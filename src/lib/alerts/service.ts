/**
 * Alerts: one short message to the account's own phone (or someone on its
 * lines), sent by API, MCP or CLI.
 *
 *   text  when one of the account's Telnyx numbers can deliver SMS (a verified
 *         toll-free number or a 10DLC-registered one)
 *   call  otherwise, and always for severity "critical": a Call Control call
 *         from a number on the "smshub voice menu" app that reads the alert
 *         twice and hangs up (src/lib/alerts/call.ts drives it)
 *
 * Both are logged in the inbox thread with that phone. The same text to the
 * same phone within 10 minutes is sent once, and an account gets at most
 * MAX_PER_HOUR alerts and MAX_CALLS_PER_HOUR calls an hour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSMS, toE164 } from "@/lib/providers";
import { telnyxRequest, type TelnyxResult } from "@/lib/providers/telnyx-api";
import { lineApiKey, lineLocked } from "@/lib/lines/credentials";
import { LOCKED_MESSAGE, PROVIDER_COLS, type ProviderRowLike } from "@/lib/vault/provider-credentials";
import { findOrCreateThread } from "@/lib/inbound";
import { encodeState, voiceWebhookUrl } from "@/lib/voice/telnyx-voice";
import { CONSENT_TEXT } from "./consent";

export { CONSENT_TEXT };
export const SEVERITIES = ["info", "warning", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const DEDUPE_MS = 10 * 60 * 1000;
export const MAX_PER_HOUR = 30;
export const MAX_CALLS_PER_HOUR = 10;
export const MAX_MESSAGE = 600;

export class AlertError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Telnyx = <T = Record<string, unknown>>(
  apiKey: string,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown
) => Promise<TelnyxResult<T>>;

export interface AlertDeps {
  db: SupabaseClient;
  telnyx?: Telnyx;
  sendSms?: typeof sendSMS;
  now?: () => number;
}

export interface AlertSettings {
  phone: string | null;
  consent: boolean;
  consent_text: string | null;
  consented_at: string | null;
  opted_out_at: string | null;
}

export interface AlertRow {
  id: string;
  to_phone: string;
  message: string;
  severity: Severity;
  channels: string[];
  status: "sending" | "sent" | "failed";
  error: string | null;
  sms_message_id: string | null;
  call_message_id: string | null;
  created_at: string;
}

export interface AlertResult {
  alert: AlertRow;
  deduped: boolean;
  /** Why it went out the way it did, in words. */
  note: string;
}

const ALERT_COLUMNS = "id, to_phone, message, severity, channels, status, error, sms_message_id, call_message_id, created_at";

// ---- settings -------------------------------------------------------------

export async function getAlertSettings(db: SupabaseClient, userId: string): Promise<AlertSettings> {
  const { data } = await db
    .from("alert_settings")
    .select("phone, consent, consent_text, consented_at, opted_out_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as AlertSettings | null) ?? { phone: null, consent: false, consent_text: null, consented_at: null, opted_out_at: null };
}

/** Save the alert phone. Consent must be given again whenever the phone changes. */
export async function saveAlertSettings(
  db: SupabaseClient,
  userId: string,
  input: { phone?: unknown; consent?: unknown },
  now = new Date().toISOString()
): Promise<AlertSettings> {
  const phone = input.phone === null || input.phone === "" ? null : toE164(String(input.phone ?? ""));
  if (input.phone && !phone) throw new AlertError(400, "phone must be one number, e.g. +14155550123");
  const consent = input.consent === true;
  if (phone && !consent) throw new AlertError(400, "Tick the consent box to receive alerts on this phone");
  const row = {
    user_id: userId,
    phone,
    consent: Boolean(phone) && consent,
    consent_text: phone ? CONSENT_TEXT : null,
    consented_at: phone ? now : null,
    opted_out_at: null,
    updated_at: now,
  };
  const { data: existing } = await db.from("alert_settings").select("user_id").eq("user_id", userId).maybeSingle();
  const { error } = existing
    ? await db.from("alert_settings").update(row).eq("user_id", userId)
    : await db.from("alert_settings").insert(row);
  if (error) throw new Error(`could not save alert settings: ${(error as { message?: string }).message}`);
  return getAlertSettings(db, userId);
}

// ---- which numbers can send -----------------------------------------------

const TOLL_FREE = /^\+1(800|833|844|855|866|877|888)\d{7}$/;
const smsCache = new Map<string, { ok: boolean; at: number }>();

/** Clear cached SMS checks (tests). */
export const resetSmsCache = () => smsCache.clear();

/**
 * Whether US carriers will take a text from this Telnyx number: a toll-free
 * number needs a Verified toll-free verification or proof that it delivers
 * (its latest text in the last 30 days was delivered, not failed: some
 * unverified toll-free numbers still do), a local one a 10DLC campaign. Unregistered
 * local numbers fail with 40010, so they are not tried.
 */
export async function smsDeliverable(telnyx: Telnyx, apiKey: string, number: string, now = Date.now()): Promise<boolean> {
  const hit = smsCache.get(number);
  if (hit && now - hit.at < (hit.ok ? 60 : 10) * 60 * 1000) return hit.ok;
  let ok = false;
  if (TOLL_FREE.test(number)) {
    const res = await telnyx<{ records?: Array<{ verificationStatus?: string; phoneNumbers?: Array<{ phoneNumber?: string }> }> }>(
      apiKey,
      "GET",
      "/messaging_tollfree/verification/requests?page=1&page_size=100"
    );
    ok =
      res.ok &&
      (res.data.records ?? []).some(
        (r) => r.verificationStatus === "Verified" && (r.phoneNumbers ?? []).some((p) => p.phoneNumber === number)
      );
    if (!ok) {
      const recent = await telnyx<{ data?: Array<{ cli?: string; direction?: string; status?: string; created_at?: string }> }>(
        apiKey,
        "GET",
        "/detail_records?filter[record_type]=messaging&filter[date_range]=last_30_days&page[size]=500"
      );
      const last = (recent.ok ? (recent.data.data ?? []) : [])
        .filter((d) => d.cli === number && d.direction === "outbound" && (d.status === "delivered" || d.status === "failed"))
        .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
      ok = last?.status === "delivered";
    }
  } else if (number.startsWith("+1")) {
    const res = await telnyx<{ assignmentStatus?: string; campaignId?: string }>(
      apiKey,
      "GET",
      `/10dlc/phone_number_campaigns/${encodeURIComponent(number)}`
    );
    ok = res.ok && Boolean(res.data.campaignId) && (!res.data.assignmentStatus || res.data.assignmentStatus === "ASSIGNED");
  }
  smsCache.set(number, { ok, at: now });
  return ok;
}

// ---- sending ---------------------------------------------------------------

interface Line {
  id: string;
  number: string;
  apiKey: string;
}

async function telnyxLines(db: SupabaseClient, userId: string, seen: { locked: number } = { locked: 0 }): Promise<Line[]> {
  const { data } = await db
    .from("phone_numbers")
    .select(`id, number, managed, created_at, providers(${PROVIDER_COLS})`)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const out: Line[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    // Rented numbers run on smshub's own Telnyx account: never billed for an alert.
    if (row.managed) continue;
    const provider = row.providers as ProviderRowLike | null;
    const apiKey = lineApiKey(provider, false);
    if (!apiKey && lineLocked(provider, false)) seen.locked += 1;
    if (apiKey) out.push({ id: String(row.id), number: String(row.number), apiKey });
  }
  return out;
}

/** A line whose number is on the voice app, so Telnyx sends the call's events to us. */
async function callLine(telnyx: Telnyx, lines: Line[]): Promise<{ line: Line; appId: string } | null> {
  for (const apiKey of [...new Set(lines.map((l) => l.apiKey))]) {
    const app = await findVoiceApp(telnyx, apiKey);
    if (!app.ok || !app.data) continue;
    const nums = await telnyx<{ data?: Array<{ phone_number?: string }> }>(
      apiKey,
      "GET",
      `/phone_numbers?filter[connection_id]=${encodeURIComponent(app.data.id)}&page[size]=250`
    );
    if (!nums.ok) continue;
    const onApp = new Set((nums.data.data ?? []).map((n) => n.phone_number));
    const line = lines.find((l) => l.apiKey === apiKey && onApp.has(l.number));
    if (line) return { line, appId: app.data.id };
  }
  return null;
}

async function findVoiceApp(telnyx: Telnyx, apiKey: string): Promise<TelnyxResult<{ id: string } | null>> {
  const res = await telnyx<{ data?: Array<{ id: string; webhook_event_url: string | null }> }>(
    apiKey,
    "GET",
    "/call_control_applications?page[size]=250"
  );
  if (!res.ok) return res;
  const url = voiceWebhookUrl().toLowerCase();
  return { ok: true, data: (res.data.data ?? []).find((a) => (a.webhook_event_url ?? "").toLowerCase().replace(/\/+$/, "") === url) ?? null };
}

/** Ring `to` and read the alert, from a line on the voice app. Logs the call in that line's thread. */
async function placeAlertCall(
  db: SupabaseClient,
  telnyx: Telnyx,
  userId: string,
  alertId: string,
  to: string,
  message: string,
  lines: Line[],
  nowIso: string
): Promise<{ ok: boolean; note: string; messageId: string | null }> {
  const target = await callLine(telnyx, lines);
  if (!target) {
    return { ok: false, messageId: null, note: 'call: none of your numbers is on the "smshub voice menu" app (Settings > Lines > Set up the voice menu)' };
  }
  const { line, appId } = target;
  const thread = await findOrCreateThread(db, userId, line.id, to, nowIso);
  const { data: msg } = await db
    .from("messages")
    .insert({
      conversation_id: thread.id,
      direction: "outbound",
      kind: "call",
      body: `Alert call: ${message}`,
      status: "queued",
      provider: "telnyx",
    })
    .select("id")
    .single();
  const messageId = (msg as { id?: string } | null)?.id ?? null;
  await db.from("conversations").update({ last_message_at: nowIso, archived: false }).eq("id", thread.id);
  const res = await telnyx<{ data?: { call_session_id?: string; call_control_id?: string } }>(line.apiKey, "POST", "/calls", {
    connection_id: appId,
    to,
    from: line.number,
    timeout_secs: 30,
    client_state: encodeState({ l: line.id, m: messageId ?? undefined, al: alertId }),
  });
  if (res.ok) {
    const session = res.data.data?.call_session_id || res.data.data?.call_control_id;
    if (messageId) {
      await db
        .from("messages")
        .update({ status: "sent", provider_message_id: session ? `alert:${session}` : null, status_updated_at: nowIso })
        .eq("id", messageId);
    }
    return { ok: true, messageId, note: `calling from ${line.number}` };
  }
  if (messageId) {
    await db.from("messages").update({ status: "failed", error_detail: res.error.message, status_updated_at: nowIso }).eq("id", messageId);
  }
  return { ok: false, messageId, note: `call: ${res.error.message}` };
}

/**
 * Telnyx accepted an alert text and later reported it failed (spam filter,
 * 40010, ...): the person heard nothing, so ring them now. Called from the
 * delivery-status webhook with the Telnyx message id; a no-op for texts that
 * are not alerts or alerts that already called.
 */
export async function callAfterFailedAlertText(
  deps: Pick<AlertDeps, "db" | "telnyx" | "now">,
  providerMessageId: string
): Promise<boolean> {
  const { db } = deps;
  const telnyx = deps.telnyx ?? telnyxRequest;
  const nowMs = (deps.now ?? Date.now)();
  const { data: msg } = await db
    .from("messages")
    .select("id")
    .eq("provider_message_id", providerMessageId)
    .eq("provider", "telnyx")
    .maybeSingle();
  const smsId = (msg as { id?: string } | null)?.id;
  if (!smsId) return false;
  const { data: row } = await db.from("alerts").select(`${ALERT_COLUMNS}, user_id`).eq("sms_message_id", smsId).maybeSingle();
  const alert = row as (AlertRow & { user_id: string }) | null;
  if (!alert || alert.call_message_id || (alert.channels ?? []).includes("call")) return false;

  const { data: lastHour } = await db
    .from("alerts")
    .select("channels")
    .eq("user_id", alert.user_id)
    .gt("created_at", new Date(nowMs - 60 * 60 * 1000).toISOString())
    .limit(MAX_PER_HOUR + 1);
  const calls = ((lastHour ?? []) as Array<{ channels: string[] | null }>).filter((a) => (a.channels ?? []).includes("call")).length;
  if (calls >= MAX_CALLS_PER_HOUR) return false;

  const seen = { locked: 0 };
  const lines = await telnyxLines(db, alert.user_id, seen);
  if (!lines.length && seen.locked) console.warn(`smshub alerts: alert ${alert.id} not called, owner's key vault is locked`);
  const call = await placeAlertCall(db, telnyx, alert.user_id, alert.id, alert.to_phone, alert.message, lines, new Date(nowMs).toISOString());
  const channels = call.ok ? ["call"] : [];
  await db
    .from("alerts")
    .update({
      call_message_id: call.messageId,
      channels,
      status: call.ok ? "sent" : "failed",
      error: ["text: delivery failed", call.ok ? null : call.note].filter(Boolean).join("; "),
    })
    .eq("id", alert.id);
  return call.ok;
}

const clean = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

export async function sendAlert(
  deps: AlertDeps,
  userId: string,
  input: { to?: unknown; message?: unknown; severity?: unknown }
): Promise<AlertResult> {
  const { db } = deps;
  const telnyx = deps.telnyx ?? telnyxRequest;
  const sms = deps.sendSms ?? sendSMS;
  const nowMs = (deps.now ?? Date.now)();
  const nowIso = new Date(nowMs).toISOString();

  const message = clean(String(input.message ?? ""));
  if (!message) throw new AlertError(400, "message is required");
  if (message.length > MAX_MESSAGE) throw new AlertError(400, `message is longer than ${MAX_MESSAGE} characters`);
  const severity = (input.severity ?? "warning") as Severity;
  if (!SEVERITIES.includes(severity)) throw new AlertError(400, "severity must be info, warning or critical");

  // Who: the account's own consented phone, or someone already on its lines.
  const settings = await getAlertSettings(db, userId);
  const to = input.to ? toE164(String(input.to)) : settings.phone;
  if (input.to && !to) throw new AlertError(400, "to must be one phone number, e.g. +14155550123");
  if (!to) throw new AlertError(400, "No alert phone yet: set one in Settings > Alerts (https://smshub.dev/settings/alerts)");
  if (to === settings.phone) {
    if (!settings.consent) {
      throw new AlertError(403, settings.opted_out_at ? "This phone replied STOP; consent again in Settings > Alerts" : "Consent is missing for this phone: tick the box in Settings > Alerts");
    }
  } else {
    const { data: known } = await db.from("line_contacts").select("id").eq("user_id", userId).eq("forward_to", to).limit(1);
    if (!known?.length) {
      throw new AlertError(403, "to must be your alert phone (Settings > Alerts) or someone in one of your line contacts books");
    }
  }

  // The same alert to the same phone again within 10 minutes is the same alert.
  const since = new Date(nowMs - DEDUPE_MS).toISOString();
  const { data: recent } = await db
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("user_id", userId)
    .eq("to_phone", to)
    .eq("message", message)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);
  const dup = ((recent ?? []) as AlertRow[]).find((a) => a.status !== "failed");
  if (dup) return { alert: dup, deduped: true, note: "Same alert already sent in the last 10 minutes" };

  const { data: lastHour } = await db
    .from("alerts")
    .select("channels")
    .eq("user_id", userId)
    .gt("created_at", new Date(nowMs - 60 * 60 * 1000).toISOString())
    .limit(MAX_PER_HOUR + 1);
  const hour = (lastHour ?? []) as Array<{ channels: string[] | null }>;
  if (hour.length >= MAX_PER_HOUR) throw new AlertError(429, `At most ${MAX_PER_HOUR} alerts an hour`);
  const callsLeft = MAX_CALLS_PER_HOUR - hour.filter((a) => (a.channels ?? []).includes("call")).length;

  const seen = { locked: 0 };
  const lines = await telnyxLines(db, userId, seen);
  if (!lines.length && seen.locked) throw new AlertError(423, LOCKED_MESSAGE);
  if (!lines.length) throw new AlertError(409, "Alerts need a Telnyx number of your own on this account (Settings > Providers)");
  let smsLine: Line | null = null;
  for (const line of lines) {
    if (await smsDeliverable(telnyx, line.apiKey, line.number, nowMs)) {
      smsLine = line;
      break;
    }
  }
  let wantCall = !smsLine || severity === "critical";
  if (wantCall && callsLeft <= 0) {
    if (!smsLine) throw new AlertError(429, `At most ${MAX_CALLS_PER_HOUR} alert calls an hour`);
    wantCall = false;
  }

  const { data: inserted, error: insertError } = await db
    .from("alerts")
    .insert({ user_id: userId, to_phone: to, message, severity, status: "sending", channels: [] })
    .select(ALERT_COLUMNS)
    .single();
  if (insertError || !inserted) throw new Error("could not save the alert");
  const alert = inserted as AlertRow;
  const channels: string[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  const patch: Partial<AlertRow> = {};

  if (smsLine) {
    const thread = await findOrCreateThread(db, userId, smsLine.id, to, nowIso);
    const body = `SMSHub alert: ${message} Reply STOP to opt out.`;
    const res = await sms({ to, from: smsLine.number, body, provider: "telnyx", credentials: { apiKey: smsLine.apiKey, apiSecret: null } });
    const { data: msg } = await db
      .from("messages")
      .insert({
        conversation_id: thread.id,
        direction: "outbound",
        body,
        status: res.success ? "sent" : "failed",
        provider: "telnyx",
        provider_message_id: res.messageId || null,
        error_detail: res.success ? null : res.error || "send failed",
      })
      .select("id")
      .single();
    await db.from("conversations").update({ last_message_at: nowIso, archived: false }).eq("id", thread.id);
    patch.sms_message_id = (msg as { id?: string } | null)?.id ?? null;
    if (res.success) {
      channels.push("sms");
      notes.push(`texted from ${smsLine.number}`);
    } else {
      errors.push(`text: ${res.error || "send failed"}`);
      // A text that fails falls back to a call.
      if (!wantCall && callsLeft > 0) wantCall = true;
    }
  } else {
    notes.push("no number on this account can text yet (toll-free verification or 10DLC pending), so it calls");
  }

  if (wantCall) {
    const call = await placeAlertCall(db, telnyx, userId, alert.id, to, message, lines, nowIso);
    patch.call_message_id = call.messageId;
    if (call.ok) {
      channels.push("call");
      notes.push(call.note);
    } else {
      errors.push(call.note);
    }
  }

  const final = {
    ...patch,
    channels,
    status: (channels.length ? "sent" : "failed") as AlertRow["status"],
    error: errors.length ? errors.join("; ") : null,
  };
  await db.from("alerts").update(final).eq("id", alert.id);
  return { alert: { ...alert, ...final }, deduped: false, note: [...notes, ...errors].join("; ") };
}

export async function listAlerts(db: SupabaseClient, userId: string, limit = 20): Promise<AlertRow[]> {
  const { data } = await db
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));
  return (data ?? []) as AlertRow[];
}
