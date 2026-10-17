import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import {
  AlertError,
  CONSENT_TEXT,
  MAX_CALLS_PER_HOUR,
  resetSmsCache,
  saveAlertSettings,
  sendAlert,
  type AlertDeps,
} from "../service";
import { noteAlertOptOut } from "../opt-out";
import { alertSpeech } from "../call";
import { handleCallEvent, type CallState } from "@/lib/voice/ivr";
import { decodeState } from "@/lib/voice/telnyx-voice";

const USER = "u1";
const ME = "+14086560000";
const APP = "app-1";
const TELNYX = { type: "telnyx", api_key: "KEY", metadata: null };
const FAMILY = { id: "11111111-1111-4111-8111-111111111111", number: "+19165550100" };
const TOLLFREE = { id: "22222222-2222-4222-8222-222222222222", number: "+18885550100" };

function setup(opts: { verified?: string[]; smsFails?: boolean; callFails?: boolean } = {}) {
  const fdb = new FakeDb();
  fdb.tables.alert_settings = [{ user_id: USER, phone: ME, consent: true, consent_text: CONSENT_TEXT, consented_at: "2026-10-17T00:00:00Z", opted_out_at: null }];
  fdb.tables.phone_numbers = [
    { ...TOLLFREE, user_id: USER, status: "active", managed: false, created_at: "2026-10-01", providers: TELNYX },
    { ...FAMILY, user_id: USER, status: "active", managed: false, created_at: "2026-10-02", providers: TELNYX },
    { id: "33333333-3333-4333-8333-333333333333", number: "+16285550100", user_id: USER, status: "active", managed: true, created_at: "2026-10-03", providers: TELNYX },
  ];
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  const telnyx = vi.fn(async (_key: string, method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body: body as Record<string, unknown> });
    if (path.startsWith("/messaging_tollfree/verification/requests")) {
      return {
        ok: true as const,
        data: { records: (opts.verified ?? []).map((n) => ({ verificationStatus: "Verified", phoneNumbers: [{ phoneNumber: n }] })) },
      };
    }
    if (path.startsWith("/10dlc/")) return { ok: false as const, error: { status: 404, code: null, message: "not found" } };
    if (path.startsWith("/call_control_applications")) {
      return { ok: true as const, data: { data: [{ id: APP, webhook_event_url: "https://smshub.dev/api/webhooks/telnyx/voice" }] } };
    }
    if (path.startsWith("/phone_numbers?filter[connection_id]")) return { ok: true as const, data: { data: [{ phone_number: FAMILY.number }] } };
    if (path === "/calls") {
      return opts.callFails
        ? { ok: false as const, error: { status: 422, code: "10010", message: "no outbound profile" } }
        : { ok: true as const, data: { data: { call_session_id: "sess-1", call_control_id: "cc-1" } } };
    }
    return { ok: false as const, error: { status: 404, code: null, message: `unexpected ${path}` } };
  });
  const sendSms = vi.fn(async () => (opts.smsFails ? { success: false, error: "40010 not registered" } : { success: true, messageId: "sms-1" }));
  let now = Date.parse("2026-10-17T16:00:00Z");
  const deps: AlertDeps = {
    db: fdb as unknown as SupabaseClient,
    telnyx: telnyx as unknown as AlertDeps["telnyx"],
    sendSms: sendSms as unknown as AlertDeps["sendSms"],
    now: () => now,
  };
  return { fdb, calls, telnyx, sendSms, deps, advance: (ms: number) => (now += ms) };
}

beforeEach(() => resetSmsCache());

describe("sendAlert", () => {
  it("calls from the voice-app line when no number can text, and logs the call", async () => {
    const { fdb, calls, sendSms, deps } = setup();
    const r = await sendAlert(deps, USER, { message: "backup failed" });
    expect(r.alert.channels).toEqual(["call"]);
    expect(r.alert.status).toBe("sent");
    expect(sendSms).not.toHaveBeenCalled();
    const call = calls.find((c) => c.path === "/calls")!;
    expect(call.body).toMatchObject({ connection_id: APP, to: ME, from: FAMILY.number });
    const state = decodeState(call.body!.client_state)!;
    expect(state).toMatchObject({ l: FAMILY.id, al: r.alert.id });
    const msg = fdb.tables.messages.find((m) => m.id === state.m)!;
    expect(msg).toMatchObject({ kind: "call", direction: "outbound", status: "sent", provider_message_id: "alert:sess-1", body: "Alert call: backup failed" });
    // The rented number is never used.
    expect(calls.some((c) => c.path.includes("16285550100"))).toBe(false);
  });

  it("texts from a verified toll-free number instead, and also calls when critical", async () => {
    const { calls, sendSms, deps } = setup({ verified: [TOLLFREE.number] });
    const r = await sendAlert(deps, USER, { message: "disk 91%" });
    expect(r.alert.channels).toEqual(["sms"]);
    expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({ to: ME, from: TOLLFREE.number, body: "SMSHub alert: disk 91% Reply STOP to opt out." }));
    expect(calls.some((c) => c.path === "/calls")).toBe(false);

    const c = await sendAlert(deps, USER, { message: "db down", severity: "critical" });
    expect(c.alert.channels).toEqual(["sms", "call"]);
  });

  it("falls back to a call when the text is refused", async () => {
    const { deps } = setup({ verified: [TOLLFREE.number], smsFails: true });
    const r = await sendAlert(deps, USER, { message: "x" });
    expect(r.alert.channels).toEqual(["call"]);
    expect(r.alert.error).toContain("40010");
  });

  it("sends the same alert once per 10 minutes", async () => {
    const { calls, deps, advance } = setup();
    const a = await sendAlert(deps, USER, { message: "same" });
    const b = await sendAlert(deps, USER, { message: "same" });
    expect(b.deduped).toBe(true);
    expect(b.alert.id).toBe(a.alert.id);
    expect(calls.filter((c) => c.path === "/calls")).toHaveLength(1);
    advance(11 * 60 * 1000);
    const c = await sendAlert(deps, USER, { message: "same" });
    expect(c.deduped).toBe(false);
  });

  it("retries an alert that failed instead of deduping it", async () => {
    const { deps } = setup({ callFails: true });
    const a = await sendAlert(deps, USER, { message: "boom" });
    expect(a.alert.status).toBe("failed");
    const b = await sendAlert(deps, USER, { message: "boom" });
    expect(b.deduped).toBe(false);
  });

  it("caps calls per hour", async () => {
    const { deps } = setup();
    for (let i = 0; i < MAX_CALLS_PER_HOUR; i++) await sendAlert(deps, USER, { message: `m${i}` });
    await expect(sendAlert(deps, USER, { message: "one more" })).rejects.toMatchObject({ status: 429 });
  });

  it("refuses without an alert phone, without consent, or to a stranger", async () => {
    const { fdb, deps } = setup();
    await expect(sendAlert(deps, USER, { message: "x", to: "+12125550199" })).rejects.toMatchObject({ status: 403 });
    fdb.tables.line_contacts = [{ user_id: USER, forward_to: "+12125550199" }];
    expect((await sendAlert(deps, USER, { message: "x", to: "+12125550199" })).alert.to_phone).toBe("+12125550199");
    fdb.tables.alert_settings[0].consent = false;
    await expect(sendAlert(deps, USER, { message: "y" })).rejects.toMatchObject({ status: 403 });
    fdb.tables.alert_settings = [];
    await expect(sendAlert(deps, USER, { message: "y" })).rejects.toBeInstanceOf(AlertError);
    await expect(sendAlert(deps, USER, { message: "" })).rejects.toMatchObject({ status: 400 });
    await expect(sendAlert(deps, USER, { message: "a", severity: "loud" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("alert settings and STOP", () => {
  it("needs the consent box for a phone and records the wording", async () => {
    const fdb = new FakeDb();
    const db = fdb as unknown as SupabaseClient;
    await expect(saveAlertSettings(db, USER, { phone: "+14155550123" })).rejects.toMatchObject({ status: 400 });
    const s = await saveAlertSettings(db, USER, { phone: "(415) 555-0123", consent: true });
    expect(s).toMatchObject({ phone: "+14155550123", consent: true, consent_text: CONSENT_TEXT });
    const off = await saveAlertSettings(db, USER, { phone: null });
    expect(off).toMatchObject({ phone: null, consent: false });
  });

  it("a STOP reply withdraws consent", async () => {
    const fdb = new FakeDb();
    fdb.tables.alert_settings = [{ user_id: USER, phone: ME, consent: true }];
    const db = fdb as unknown as SupabaseClient;
    expect(await noteAlertOptOut(db, ME, "hello")).toBe(false);
    expect(await noteAlertOptOut(db, ME, " Stop ")).toBe(true);
    expect(fdb.tables.alert_settings[0]).toMatchObject({ consent: false });
    expect(fdb.tables.alert_settings[0].opted_out_at).toBeTruthy();
  });
});

describe("alert call flow", () => {
  const LINE = { id: FAMILY.id, user_id: USER, number: FAMILY.number };

  it("reads the alert twice on answer, hangs up after, and logs the outcome", async () => {
    const fdb = new FakeDb();
    fdb.tables.alerts = [{ id: "al-1", message: "fleet-db-backup failed" }];
    fdb.tables.messages = [{ id: "m-1", body: "Alert call: fleet-db-backup failed", status: "sent" }];
    const cmds: Array<{ action: string; body: Record<string, unknown> }> = [];
    const command = vi.fn(async (_id: string, action: string, body: Record<string, unknown>) => {
      cmds.push({ action, body });
      return { ok: true as const, data: {} };
    });
    const deps = { db: fdb as unknown as SupabaseClient, command };
    const state: CallState = { l: FAMILY.id, m: "m-1", al: "al-1" };
    const send = (event_type: string, payload: Record<string, unknown>, s: CallState) =>
      handleCallEvent(deps, LINE, { event_type, payload: { call_control_id: "cc-1", ...payload } }, s);

    expect(await send("call.initiated", { direction: "outgoing" }, state)).toBe("ignored: call.initiated");
    expect(await send("call.answered", {}, state)).toBe("alert read");
    expect(cmds[0].action).toBe("speak");
    expect(cmds[0].body.payload).toBe(alertSpeech("fleet-db-backup failed"));
    expect(String(cmds[0].body.payload).match(/fleet-db-backup failed/g)).toHaveLength(2);
    const after = decodeState(cmds[0].body.client_state) as CallState;
    expect(after.h).toBe(1);

    expect(await send("call.speak.ended", {}, after)).toBe("hung up after goodbye");
    expect(cmds[1].action).toBe("hangup");

    expect(
      await send("call.hangup", { hangup_cause: "normal_clearing", start_time: "2026-10-17T16:00:00Z", end_time: "2026-10-17T16:00:21Z" }, after)
    ).toBe("alert answered");
    expect(fdb.tables.messages[0]).toMatchObject({ body: "Alert call answered (21s): fleet-db-backup failed", status: "delivered" });
  });

  it("logs a call nobody picked up", async () => {
    const fdb = new FakeDb();
    fdb.tables.messages = [{ id: "m-1", body: "Alert call: x", status: "sent" }];
    const deps = { db: fdb as unknown as SupabaseClient, command: vi.fn(async () => ({ ok: true as const, data: {} })) };
    const r = await handleCallEvent(deps, LINE, { event_type: "call.hangup", payload: { call_control_id: "cc", hangup_cause: "timeout" } }, { l: FAMILY.id, m: "m-1", al: "a" });
    expect(r).toBe("alert not answered");
    expect(fdb.tables.messages[0]).toMatchObject({ body: "Alert call not answered (timeout): x", status: "failed" });
  });
});
