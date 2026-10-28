/**
 * The smshub events that need a little lookup before they are emitted. Every
 * helper here is best effort: it logs and returns, never throws.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent, hubConfigured } from "./hub";

export interface OutboundRow {
  id: string;
  conversation_id?: string | null;
  body?: string | null;
  status?: string | null;
  provider_message_id?: string | null;
  error_detail?: string | null;
  created_at?: string | null;
}

/**
 * message.sent or message.failed for a text that was just handed to the
 * provider (API, inbox, bulk send, group send). `error` is the send error.
 */
export async function emitOutbound(
  userId: string,
  row: OutboundRow | null | undefined,
  ctx: { number: string; phone_number_id: string; to: string; error?: string | null }
): Promise<void> {
  const failed = row ? row.status === "failed" : Boolean(ctx.error);
  await emitEvent(
    userId,
    failed ? "message.failed" : "message.sent",
    {
      message_id: row?.id ?? null,
      conversation_id: row?.conversation_id ?? null,
      phone_number_id: ctx.phone_number_id,
      number: ctx.number,
      to: ctx.to,
      body: row?.body ?? null,
      status: failed ? "failed" : "sent",
      provider_message_id: row?.provider_message_id ?? null,
      ...(failed ? { error: ctx.error ?? row?.error_detail ?? null } : {}),
      sent_at: row?.created_at ?? new Date().toISOString(),
    },
    row?.id ? `message:${row.id}` : undefined
  );
}

interface StatusRow {
  id: string;
  body: string | null;
  status: string;
  error_code: string | null;
  error_detail: string | null;
  conversation_id: string;
  conversations: {
    user_id: string;
    phone_number_id: string;
    phone_numbers: { number: string } | null;
    contacts: { phone: string } | null;
  } | null;
}

/**
 * message.delivered or message.failed once a provider status callback has been
 * stored. Only rows whose stored status is now `status` are reported, and the
 * event id is fixed per message and outcome, so a replayed callback reaches a
 * receiver with the same webhook-id (receivers dedupe on it).
 */
export async function emitDeliveryStatus(
  db: SupabaseClient,
  provider: "telnyx" | "twilio",
  providerMessageId: string,
  status: string
): Promise<void> {
  if (status !== "delivered" && status !== "failed") return;
  if (!hubConfigured()) return;
  try {
    const { data } = await db
      .from("messages")
      .select(
        "id, body, status, error_code, error_detail, conversation_id, conversations(user_id, phone_number_id, phone_numbers(number), contacts(phone))"
      )
      .eq("provider_message_id", providerMessageId)
      .eq("provider", provider)
      .eq("direction", "outbound")
      .limit(5);
    for (const m of (data ?? []) as unknown as StatusRow[]) {
      if (m.status !== status || !m.conversations) continue;
      const c = m.conversations;
      await emitEvent(
        c.user_id,
        status === "delivered" ? "message.delivered" : "message.failed",
        {
          message_id: m.id,
          conversation_id: m.conversation_id,
          phone_number_id: c.phone_number_id,
          number: c.phone_numbers?.number ?? null,
          to: c.contacts?.phone ?? null,
          body: m.body,
          status,
          provider_message_id: providerMessageId,
          ...(status === "failed" ? { error: m.error_detail ?? null, error_code: m.error_code ?? null } : {}),
          at: new Date().toISOString(),
        },
        `message:${m.id}`,
        `evt_msg_${m.id}_${status}`
      );
    }
  } catch (error) {
    console.error(`[webhooks] ${provider} status event failed:`, error);
  }
}
