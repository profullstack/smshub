/**
 * Store an inbound text against the number it was sent to, and tell the
 * owner's webhooks. Shared by the Telnyx and Twilio inbound routes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundMessage } from "@/lib/providers/types";
import { fireWebhooks, type UserWebhook } from "@/lib/webhooks/outbound";
import { extractOtp } from "@/lib/managed-numbers/api";
import { bookLineId, matchPrefix, type LineContact } from "@/lib/lines/contacts";
import { sendSMS } from "@/lib/providers";

export interface OwnedNumber {
  id: string;
  user_id: string;
  number: string;
  provider_id: string;
  managed?: boolean;
}

/** The one active owner of a number, if any. Released numbers receive nothing. */
export async function findActiveNumber(db: SupabaseClient, number: string): Promise<OwnedNumber | null> {
  if (!number) return null;
  const { data } = await db
    .from("phone_numbers")
    .select("id, user_id, number, provider_id, managed")
    .eq("number", number)
    .eq("status", "active")
    .limit(1);
  return (data?.[0] as OwnedNumber | undefined) ?? null;
}

export async function recordInbound(
  db: SupabaseClient,
  phoneNumber: OwnedNumber,
  inbound: InboundMessage
): Promise<{ messageId: string | null; duplicate: boolean }> {
  const userId = phoneNumber.user_id;

  // Providers retry webhooks; the same provider message id is stored once.
  if (inbound.providerMessageId) {
    const { data: dup } = await db
      .from("messages")
      .select("id")
      .eq("provider_message_id", inbound.providerMessageId)
      .eq("direction", "inbound")
      .limit(1);
    if (dup?.[0]) return { messageId: dup[0].id, duplicate: true };
  }

  // "K: running late" on a line whose contacts book has prefix K is filed
  // into K's thread, keeping who really sent it; anything else stays in the
  // sender's own thread on this line.
  const routed = await routeByPrefix(db, phoneNumber, inbound.body);
  const threadPhone = routed?.contact.forward_to ?? inbound.from;
  const now = new Date().toISOString();
  const conversation = await findOrCreateThread(db, userId, phoneNumber.id, threadPhone, now);

  const { data: message } = await db
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      direction: "inbound",
      body: routed ? routed.text : inbound.body,
      status: "delivered",
      provider: inbound.provider,
      provider_message_id: inbound.providerMessageId || null,
      media_url: inbound.mediaUrl ?? null,
      ...(routed ? { routed_from: inbound.from } : {}),
    })
    .select("id, created_at")
    .single();

  await db
    .from("conversations")
    .update({ last_message_at: now, archived: false })
    .eq("id", conversation.id);

  const { data: hooks } = await db
    .from("user_webhooks")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true);
  if (hooks?.length) {
    await fireWebhooks(hooks as UserWebhook[], "message.received", {
      message_id: message?.id ?? null,
      conversation_id: conversation.id,
      phone_number_id: phoneNumber.id,
      to: phoneNumber.number,
      from: inbound.from,
      body: inbound.body,
      otp: extractOtp(inbound.body),
      media_url: inbound.mediaUrl ?? null,
      received_at: message?.created_at ?? now,
      ...(routed ? { routed_to: { name: routed.contact.name, phone: routed.contact.forward_to } } : {}),
    });
  }
  if (routed?.contact.forward_sms && routed.contact.forward_to !== inbound.from) {
    await forwardRouted(db, phoneNumber, conversation.id, routed.contact.forward_to, inbound.from, routed.text);
  }
  return { messageId: message?.id ?? null, duplicate: false };
}

/** The conversation between a line and a phone, created (with its contact) when new. */
export async function findOrCreateThread(
  db: SupabaseClient,
  userId: string,
  phoneNumberId: string,
  phone: string,
  now = new Date().toISOString()
): Promise<{ id: string; contact_id: string }> {
  let { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();
  if (!contact) {
    const { data } = await db.from("contacts").insert({ user_id: userId, phone }).select("id").single();
    contact = data;
  }
  if (!contact) throw new Error("could not save the contact");

  let { data: conversation } = await db
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("contact_id", contact.id)
    .eq("phone_number_id", phoneNumberId)
    .limit(1)
    .maybeSingle();
  if (!conversation) {
    const { data } = await db
      .from("conversations")
      .insert({ user_id: userId, contact_id: contact.id, phone_number_id: phoneNumberId, last_message_at: now })
      .select("id")
      .single();
    conversation = data;
  }
  if (!conversation) throw new Error("could not save the conversation");
  return { id: conversation.id, contact_id: contact.id };
}

type RoutingContact = Pick<LineContact, "name" | "forward_to" | "sms_prefix" | "forward_sms">;

async function routeByPrefix(db: SupabaseClient, line: OwnedNumber, body: string) {
  if (!body) return null;
  const { data } = await db
    .from("line_contacts")
    .select("name, forward_to, sms_prefix, forward_sms")
    .eq("phone_number_id", await bookLineId(db, line.id));
  const withPrefix = ((data ?? []) as RoutingContact[]).filter((c) => c.sms_prefix);
  return withPrefix.length ? matchPrefix(body, withPrefix) : null;
}

/**
 * Text a prefix-routed message on to that person's own cell, logged as an
 * outbound message in their thread. Until the line can send (10DLC), the
 * provider refuses it and the thread shows why.
 */
async function forwardRouted(
  db: SupabaseClient,
  line: OwnedNumber,
  conversationId: string,
  to: string,
  from: string,
  text: string
) {
  const body = `From ${from}: ${text}`.slice(0, 1600);
  try {
    const { data: provider } = await db
      .from("providers")
      .select("type, api_key, api_secret")
      .eq("id", line.provider_id)
      .maybeSingle();
    if (!provider) return;
    // Rented numbers carry the managed placeholder key, which sendSMS refuses.
    const result = await sendSMS({
      to,
      from: line.number,
      body,
      provider: provider.type,
      credentials: { apiKey: provider.api_key, apiSecret: provider.api_secret },
    });
    await db.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      body,
      status: result.success ? "sent" : "failed",
      provider: provider.type,
      provider_message_id: result.success ? result.messageId ?? null : null,
      error_detail: result.success ? null : String(result.error ?? "send failed").slice(0, 500),
    });
  } catch (error) {
    console.error("forward routed SMS failed:", error);
  }
}
