/**
 * Send one SMS from one of the caller's own numbers. Shared by the v1 API,
 * MCP (send_message) and the CLI (smshub-cli send). Rented numbers are
 * receive-only; sendSMS refuses them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSMS, toE164 } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/conversations";

export const SEND_RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };
export const MAX_BODY = 1600;

export class SendError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterMs?: number
  ) {
    super(message);
  }
}

export interface SendInput {
  to?: unknown;
  /** E.164 number or number id; optional when the account has exactly one number that can send. */
  from?: unknown;
  phone_number_id?: unknown;
  message?: unknown;
  media_url?: unknown;
}

interface NumberRow {
  id: string;
  number: string;
  managed: boolean | null;
  providers: { type: string; api_key: string; api_secret: string | null } | null;
}

async function pickNumber(db: SupabaseClient, userId: string, ref: string | null): Promise<NumberRow> {
  let q = db
    .from("phone_numbers")
    .select("id, number, managed, providers(type, api_key, api_secret)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (ref) q = isUuid(ref) ? q.eq("id", ref) : q.eq("number", toE164(ref) ?? ref);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as NumberRow[];
  if (ref) {
    if (!rows.length) throw new SendError("Phone number not found or not owned by you", 404);
    return rows[0];
  }
  const sendable = rows.filter((r) => !r.managed);
  if (sendable.length === 1) return sendable[0];
  throw new SendError(
    sendable.length
      ? "You have several numbers: pass from (a number or its id)"
      : "No number that can send. Add your own Twilio or Telnyx number; rented numbers receive only.",
    400
  );
}

export async function sendMessage(db: SupabaseClient, userId: string, input: SendInput) {
  const to = typeof input.to === "string" ? input.to.trim() : "";
  const message = typeof input.message === "string" ? input.message : "";
  const mediaUrl = typeof input.media_url === "string" && input.media_url ? input.media_url : undefined;
  const ref = [input.phone_number_id, input.from].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  if (!to || !message.trim()) throw new SendError("Missing required fields: to, message", 400);
  if (message.length > MAX_BODY) throw new SendError(`message is longer than ${MAX_BODY} characters`, 400);
  if (!toE164(to)) throw new SendError(`Invalid recipient "${to}": use one phone number, e.g. +14155551234`, 400);

  const rl = checkRateLimit(`send:${userId}`, SEND_RATE_LIMIT);
  if (!rl.allowed) throw new SendError("Rate limit exceeded", 429, rl.retryAfterMs);

  const number = await pickNumber(db, userId, ref?.trim() ?? null);
  const provider = number.providers;
  if (!provider) throw new SendError("This number has no provider", 400);
  const toE = toE164(to)!;

  let { data: contact } = await db.from("contacts").select("id").eq("user_id", userId).eq("phone", toE).maybeSingle();
  if (!contact) {
    ({ data: contact } = await db.from("contacts").insert({ user_id: userId, phone: toE }).select("id").single());
  }
  let { data: conversation } = await db
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("contact_id", contact!.id)
    .eq("phone_number_id", number.id)
    .maybeSingle();
  if (!conversation) {
    ({ data: conversation } = await db
      .from("conversations")
      .insert({ user_id: userId, contact_id: contact!.id, phone_number_id: number.id, last_message_at: new Date().toISOString() })
      .select("id")
      .single());
  }

  const result = await sendSMS({
    to: toE,
    from: number.number,
    body: message,
    provider: provider.type as "twilio" | "telnyx",
    credentials: { apiKey: provider.api_key, apiSecret: provider.api_secret },
    mediaUrl,
  });

  const { data: saved } = await db
    .from("messages")
    .insert({
      conversation_id: conversation!.id,
      direction: "outbound",
      body: message,
      status: result.success ? "sent" : "failed",
      provider: provider.type,
      provider_message_id: result.messageId || null,
      media_url: mediaUrl || null,
      error_detail: result.success ? null : result.error || null,
    })
    .select("id, conversation_id, direction, body, status, provider_message_id, created_at")
    .single();

  if (!result.success) throw new SendError(result.error || "Send failed", 502);
  await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation!.id);
  return { message: saved, from: number.number, to: toE, remaining: rl.remaining };
}
