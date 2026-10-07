/**
 * Store an inbound text against the number it was sent to, and tell the
 * owner's webhooks. Shared by the Telnyx and Twilio inbound routes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundMessage } from "@/lib/providers/types";
import { fireWebhooks, type UserWebhook } from "@/lib/webhooks/outbound";
import { extractOtp } from "@/lib/managed-numbers/api";

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

  let { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", inbound.from)
    .limit(1)
    .maybeSingle();
  if (!contact) {
    const { data } = await db
      .from("contacts")
      .insert({ user_id: userId, phone: inbound.from })
      .select("id")
      .single();
    contact = data;
  }
  if (!contact) throw new Error("could not save the contact");

  let { data: conversation } = await db
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("contact_id", contact.id)
    .eq("phone_number_id", phoneNumber.id)
    .limit(1)
    .maybeSingle();
  const now = new Date().toISOString();
  if (!conversation) {
    const { data } = await db
      .from("conversations")
      .insert({ user_id: userId, contact_id: contact.id, phone_number_id: phoneNumber.id, last_message_at: now })
      .select("id")
      .single();
    conversation = data;
  }
  if (!conversation) throw new Error("could not save the conversation");

  const { data: message } = await db
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      direction: "inbound",
      body: inbound.body,
      status: "delivered",
      provider: inbound.provider,
      provider_message_id: inbound.providerMessageId || null,
      media_url: inbound.mediaUrl ?? null,
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
    });
  }
  return { messageId: message?.id ?? null, duplicate: false };
}
