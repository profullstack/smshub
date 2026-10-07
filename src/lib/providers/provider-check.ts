// The "Test" button on a provider: is the key valid, are the numbers set up
// to reach smshub, and (optionally) does a real text go out?

import { getSiteUrl } from "@/lib/site-url";
import { toE164 } from "./phone";
import {
  fetchTelnyxPublicKey,
  listMessagingNumbers,
  listMessagingProfiles,
  sameWebhookUrl,
  telnyxRequest,
} from "./telnyx-api";

export type CheckStatus = "pass" | "fail" | "warn";

export interface ProviderCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  code?: string | null;
  /** Set when the "Fix webhook" action can repair this check. */
  fixable?: boolean;
}

export interface ProviderTestResult {
  ok: boolean;
  checks: ProviderCheck[];
  /** Telnyx: the account's webhook signing key, for the caller to store. */
  publicKey?: string;
}

export interface ProviderTestInput {
  type: string;
  apiKey: string;
  apiSecret: string | null;
  /** Numbers saved in smshub for this provider. */
  numbers: string[];
  /** Send a real test SMS to this number when set. */
  testTo?: string | null;
  testFrom?: string | null;
}

export function telnyxWebhookUrl() {
  return `${getSiteUrl()}/api/webhooks/telnyx`;
}

export function twilioWebhookUrl() {
  return `${getSiteUrl()}/api/webhooks/twilio`;
}

// Plain-language next steps for the errors people actually hit.
const ERROR_HINTS: Record<string, string> = {
  "40010":
    "US carriers block texts from local numbers that are not 10DLC registered. Register a brand and campaign in Telnyx (Messaging > Compliance), or use a verified toll-free number.",
  "40011": "Too many messages too fast for this number. Slow down or add numbers.",
  "40300": "The recipient replied STOP to this number. They must text START before you can message them.",
  "40008": "This number is not a valid mobile number for SMS.",
  "10009": "Telnyx did not accept this API key. Copy a fresh key from Telnyx > Account Settings > Keys & Credentials.",
  "30034": "US carriers block texts from local numbers that are not A2P 10DLC registered. Register in the Twilio console (Messaging > Regulatory Compliance).",
  "30032": "This toll-free number is not verified yet. Submit toll-free verification in the Twilio console.",
  "21608": "Twilio trial accounts can only text verified numbers. Verify the recipient or upgrade the account.",
};

function withHint(message: string, code: string | null | undefined) {
  const hint = code ? ERROR_HINTS[code] : undefined;
  return hint ? `${message} — ${hint}` : message;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function testProvider(input: ProviderTestInput, opts: { pollMs?: number; polls?: number } = {}) {
  if (input.type === "telnyx") return testTelnyx(input, opts);
  if (input.type === "twilio") return testTwilio(input, opts);
  return {
    ok: true,
    checks: [{ id: "managed", label: "Managed provider", status: "pass", detail: "Nothing to configure." }],
  } satisfies ProviderTestResult;
}

async function testTelnyx(
  input: ProviderTestInput,
  { pollMs = 2000, polls = 5 }: { pollMs?: number; polls?: number }
): Promise<ProviderTestResult> {
  const checks: ProviderCheck[] = [];
  const webhookUrl = telnyxWebhookUrl();

  const key = await fetchTelnyxPublicKey(input.apiKey);
  if (!key.ok) {
    checks.push({
      id: "credentials",
      label: "API key",
      status: "fail",
      code: key.error.code,
      detail: withHint(`Telnyx said: ${key.error.message}`, key.error.code ?? (key.error.status === 401 ? "10009" : null)),
    });
    return { ok: false, checks };
  }
  checks.push({ id: "credentials", label: "API key", status: "pass", detail: "Telnyx accepted the API key." });
  checks.push({
    id: "signing_key",
    label: "Webhook signing key",
    status: "pass",
    detail: "Fetched your account's public key, so smshub can verify webhooks Telnyx sends for you.",
  });

  const [numbersRes, profilesRes] = await Promise.all([
    listMessagingNumbers(input.apiKey),
    listMessagingProfiles(input.apiKey),
  ]);
  if (!numbersRes.ok || !profilesRes.ok) {
    const error = !numbersRes.ok ? numbersRes.error : !profilesRes.ok ? profilesRes.error : null;
    checks.push({
      id: "numbers",
      label: "Numbers",
      status: "fail",
      code: error?.code,
      detail: `Could not list numbers: ${error?.message}`,
    });
    return { ok: false, checks, publicKey: key.data };
  }

  const saved = input.numbers.map((n) => toE164(n) ?? n);
  if (!saved.length) {
    checks.push({
      id: "numbers",
      label: "Numbers",
      status: "warn",
      detail: `No numbers added in smshub for this provider yet. Your Telnyx account has ${numbersRes.data.length} messaging number(s); add one below under Phone Numbers.`,
    });
  }

  for (const number of saved) {
    const n = numbersRes.data.find((row) => row.phone_number === number);
    if (!n) {
      checks.push({
        id: `number:${number}`,
        label: number,
        status: "fail",
        detail: "This number is not in the Telnyx account for this API key.",
      });
      continue;
    }
    if (!n.messaging_profile_id) {
      checks.push({
        id: `number:${number}`,
        label: number,
        status: "fail",
        detail:
          "Not assigned to a messaging profile, so it cannot send or receive texts. In Telnyx: Numbers > My Numbers > this number > Messaging Profile.",
      });
      continue;
    }
    const profile = profilesRes.data.find((p) => p.id === n.messaging_profile_id);
    const profileName = profile?.name || n.messaging_profile_id;
    if (sameWebhookUrl(profile?.webhook_url, webhookUrl)) {
      checks.push({
        id: `number:${number}`,
        label: number,
        status: "pass",
        detail: `Messaging profile "${profileName}" sends webhooks to smshub.`,
      });
    } else {
      checks.push({
        id: `number:${number}`,
        label: number,
        status: "fail",
        fixable: true,
        detail: profile?.webhook_url
          ? `Messaging profile "${profileName}" sends webhooks to ${profile.webhook_url}, so replies will not reach smshub.`
          : `Messaging profile "${profileName}" has no webhook URL, so replies will not reach smshub.`,
      });
    }
  }

  if (input.testTo) {
    checks.push(await sendTelnyxTest(input, saved, webhookUrl, pollMs, polls));
  }

  return { ok: checks.every((c) => c.status !== "fail"), checks, publicKey: key.data };
}

async function sendTelnyxTest(
  input: ProviderTestInput,
  saved: string[],
  webhookUrl: string,
  pollMs: number,
  polls: number
): Promise<ProviderCheck> {
  const to = toE164(input.testTo ?? "");
  const from = toE164(input.testFrom ?? "") ?? saved[0];
  if (!to) return { id: "test_sms", label: "Test SMS", status: "fail", detail: "Enter the test number like +14155551234." };
  if (!from) return { id: "test_sms", label: "Test SMS", status: "fail", detail: "Add a number for this provider first." };

  const sent = await telnyxRequest<{ data?: { id?: string } }>(input.apiKey, "POST", "/messages", {
    from,
    to,
    text: "smshub test message: your Telnyx setup works.",
    type: "SMS",
    webhook_url: webhookUrl,
  });
  if (!sent.ok) {
    return {
      id: "test_sms",
      label: "Test SMS",
      status: "fail",
      code: sent.error.code,
      detail: withHint(`Telnyx refused the message: ${sent.error.message}`, sent.error.code),
    };
  }
  const id = sent.data.data?.id;
  let last = "queued";
  for (let i = 0; id && i < polls; i++) {
    await sleep(pollMs);
    const msg = await telnyxRequest<{ data?: Record<string, unknown> }>(input.apiKey, "GET", `/messages/${id}`);
    if (!msg.ok) break;
    const data = msg.data.data ?? {};
    const recipient = (data.to as Array<Record<string, unknown>> | undefined)?.[0];
    last = typeof recipient?.status === "string" ? recipient.status : last;
    if (last === "delivered") {
      return { id: "test_sms", label: "Test SMS", status: "pass", detail: `Delivered from ${from} to ${to}.` };
    }
    if (last === "sending_failed" || last === "delivery_failed") {
      const err = (data.errors as Array<Record<string, unknown>> | undefined)?.[0];
      const code = err?.code != null ? String(err.code) : null;
      const title = typeof err?.title === "string" ? err.title : last;
      return {
        id: "test_sms",
        label: "Test SMS",
        status: "fail",
        code,
        detail: withHint(`Carrier rejected it (${title})`, code),
      };
    }
  }
  return {
    id: "test_sms",
    label: "Test SMS",
    status: "warn",
    detail: `Telnyx accepted it (status: ${last}). The final result usually lands within a minute; check your phone.`,
  };
}

async function twilioRequest(input: ProviderTestInput, path: string, init: RequestInit = {}) {
  const auth = "Basic " + Buffer.from(`${input.apiKey}:${input.apiSecret ?? ""}`).toString("base64");
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(input.apiKey)}${path}`, {
      ...init,
      headers: { Authorization: auth, ...(init.headers ?? {}) },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { message: error instanceof Error ? error.message : "Network error" } };
  }
}

async function testTwilio(
  input: ProviderTestInput,
  { pollMs = 2000, polls = 5 }: { pollMs?: number; polls?: number }
): Promise<ProviderTestResult> {
  const checks: ProviderCheck[] = [];
  const webhookUrl = twilioWebhookUrl();

  const account = await twilioRequest(input, ".json");
  if (!account.ok) {
    const code = account.data.code != null ? String(account.data.code) : null;
    checks.push({
      id: "credentials",
      label: "Account SID + Auth Token",
      status: "fail",
      code,
      detail: `Twilio said: ${String(account.data.message ?? `HTTP ${account.status}`)}`,
    });
    return { ok: false, checks };
  }
  const accountStatus = String(account.data.status ?? "active");
  checks.push({
    id: "credentials",
    label: "Account SID + Auth Token",
    status: accountStatus === "active" ? "pass" : "fail",
    detail: accountStatus === "active" ? "Twilio accepted the credentials." : `Twilio account is ${accountStatus}.`,
  });

  const saved = input.numbers.map((n) => toE164(n) ?? n);
  if (!saved.length) {
    checks.push({ id: "numbers", label: "Numbers", status: "warn", detail: "No numbers added in smshub for this provider yet." });
  }
  for (const number of saved) {
    const res = await twilioRequest(input, `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`);
    const row = (res.data.incoming_phone_numbers as Array<Record<string, unknown>> | undefined)?.[0];
    if (!res.ok || !row) {
      checks.push({ id: `number:${number}`, label: number, status: "fail", detail: "This number is not in this Twilio account." });
      continue;
    }
    const smsUrl = typeof row.sms_url === "string" ? row.sms_url : "";
    checks.push(
      sameWebhookUrl(smsUrl, webhookUrl)
        ? { id: `number:${number}`, label: number, status: "pass", detail: "Incoming messages go to smshub." }
        : {
            id: `number:${number}`,
            label: number,
            status: "fail",
            fixable: true,
            detail: smsUrl
              ? `Incoming messages go to ${smsUrl}, so replies will not reach smshub.`
              : "No incoming-message webhook is set, so replies will not reach smshub.",
          }
    );
  }

  if (input.testTo) {
    const to = toE164(input.testTo);
    const from = toE164(input.testFrom ?? "") ?? saved[0];
    if (!to || !from) {
      checks.push({
        id: "test_sms",
        label: "Test SMS",
        status: "fail",
        detail: !to ? "Enter the test number like +14155551234." : "Add a number for this provider first.",
      });
    } else {
      const sent = await twilioRequest(input, "/Messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: "smshub test message: your Twilio setup works." }).toString(),
      });
      if (!sent.ok) {
        const code = sent.data.code != null ? String(sent.data.code) : null;
        checks.push({
          id: "test_sms",
          label: "Test SMS",
          status: "fail",
          code,
          detail: withHint(`Twilio refused the message: ${String(sent.data.message ?? sent.status)}`, code),
        });
      } else {
        let result: ProviderCheck = {
          id: "test_sms",
          label: "Test SMS",
          status: "warn",
          detail: "Twilio accepted it. The final result usually lands within a minute; check your phone.",
        };
        for (let i = 0; i < polls; i++) {
          await sleep(pollMs);
          const msg = await twilioRequest(input, `/Messages/${String(sent.data.sid)}.json`);
          const status = String(msg.data.status ?? "");
          if (status === "delivered") {
            result = { id: "test_sms", label: "Test SMS", status: "pass", detail: `Delivered from ${from} to ${to}.` };
            break;
          }
          if (status === "failed" || status === "undelivered") {
            const code = msg.data.error_code != null ? String(msg.data.error_code) : null;
            result = {
              id: "test_sms",
              label: "Test SMS",
              status: "fail",
              code,
              detail: withHint(`Message ${status}${msg.data.error_message ? `: ${String(msg.data.error_message)}` : ""}`, code),
            };
            break;
          }
        }
        checks.push(result);
      }
    }
  }

  return { ok: checks.every((c) => c.status !== "fail"), checks };
}

/** Point the smshub numbers' incoming-message webhook at smshub (Twilio). */
export async function configureTwilioWebhooks(input: ProviderTestInput) {
  const webhookUrl = twilioWebhookUrl();
  const results: Array<{ number: string; action: "updated" | "already_set" | "failed"; error?: string }> = [];
  for (const raw of input.numbers) {
    const number = toE164(raw) ?? raw;
    const res = await twilioRequest(input, `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`);
    const row = (res.data.incoming_phone_numbers as Array<Record<string, unknown>> | undefined)?.[0];
    if (!row) {
      results.push({ number, action: "failed", error: "Not in this Twilio account" });
      continue;
    }
    if (sameWebhookUrl(row.sms_url as string, webhookUrl)) {
      results.push({ number, action: "already_set" });
      continue;
    }
    const upd = await twilioRequest(input, `/IncomingPhoneNumbers/${String(row.sid)}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ SmsUrl: webhookUrl, SmsMethod: "POST" }).toString(),
    });
    results.push(
      upd.ok ? { number, action: "updated" } : { number, action: "failed", error: String(upd.data.message ?? upd.status) }
    );
  }
  return { ok: results.every((r) => r.action !== "failed"), webhookUrl, numbers: results };
}
