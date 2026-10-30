import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import {
  AlertError,
  callAfterFailedAlertText,
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

function setup(opts: { verified?: string[]; delivered?: string[]; failedSince?: string[]; smsFails?: boolean; callFails?: boolean } = {}) {
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
    if (path.startsWith("/detail_records")) {
      return {
        ok: true as const,
        data: {
          data: [
            ...(opts.delivered ?? []).map((n) => ({ cli: n, direction: "outbound", status: "delivered", created_at: "2026-10-21T13:24:00Z" })),
            ...(opts.failedSince ?? []).map((n) => ({ cli: n, direction: "outbound", status: "failed", created_at: "2026-10-28T18:50:49Z" })),
          ],
        },
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
  // Start from the real clock: FakeDb stamps created_at with Date.now(), so a
  // pinned date drifts out of the dedupe window as the calendar moves on.
  let now = Date.now();
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

  it("texts from an unverified toll-free number that Telnyx shows delivering", async () => {
    const { calls, sendSms, deps } = setup({ delivered: [TOLLFREE.number] });
    const r = await sendAlert(deps, USER, { message: "disk 92%" });
    expect(r.alert.channels).toEqual(["sms"]);
    expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({ from: TOLLFREE.number }));
    expect(calls.some((c) => c.path === "/calls")).toBe(false);
  });

  it("does not text from a toll-free number with no verification and no deliveries", async () => {
    const { sendSms, deps } = setup({ delivered: ["+18885559999"] });
    const r = await sendAlert(deps, USER, { message: "disk 93%" });
    expect(r.alert.channels).toEqual(["call"]);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("stops texting from a toll-free number whose latest text failed", async () => {
    const { sendSms, deps } = setup({ delivered: [TOLLFREE.number], failedSince: [TOLLFREE.number] });
    const r = await sendAlert(deps, USER, { message: "disk 94%" });
    expect(r.alert.channels).toEqual(["call"]);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("rings the phone when an alert text fails after Telnyx took it", async () => {
    const { fdb, calls, deps } = setup({ verified: [TOLLFREE.number] });
    const r = await sendAlert(deps, USER, { message: "disk 95%" });
    expect(r.alert.channels).toEqual(["sms"]);
    const sms = fdb.tables.messages.find((m) => m.id === r.alert.sms_message_id)!;
    expect(sms.provider_message_id).toBe("sms-1");

    expect(await callAfterFailedAlertText(deps, "sms-1")).toBe(true);
    expect(calls.filter((c) => c.path === "/calls")).toHaveLength(1);
    const after = fdb.tables.alerts.find((a) => a.id === r.alert.id)!;
    expect(after.channels).toEqual(["call"]);
    expect(after.call_message_id).toBeTruthy();
    // Once only, and never for a text that is not an alert.
    expect(await callAfterFailedAlertText(deps, "sms-1")).toBe(false);
    expect(await callAfterFailedAlertText(deps, "not-an-alert")).toBe(false);
    expect(calls.filter((c) => c.path === "/calls")).toHaveLength(1);
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


describe("alert call recordings", () => {
  it("records enabled lines, announces recording and saves duration on the alert's message", async () => {
    const { fdb } = setup();
    fdb.tables.alerts = [{ id: "alert-record", message: "SSH key changed" }];
    fdb.tables.messages = [{ id: "message-record", body: "Alert call: SSH key changed", provider_message_id: "alert:session" }];
    const calls: Array<{ action: string; body: Record<string, unknown> }> = [];
    const command = vi.fn(async (_id: string, action: string, body: Record<string, unknown>) => { calls.push({ action, body }); return { ok: true as const, data: {} }; });
    const deps = { db: fdb as unknown as SupabaseClient, command };
    const line = { ...FAMILY, user_id: USER, record_calls: true };
    const state = { l: FAMILY.id, m: "message-record", al: "alert-record" };
    await handleCallEvent(deps, line, { event_type: "call.answered", payload: { call_control_id: "cc-record" } }, state);
    expect(calls[0]).toMatchObject({ action: "record_start", body: { format: "mp3", channels: "dual", command_id: "alert-record:alert-record:cc-record" } });
    expect(calls[1].body.payload).toMatch(/^This call may be recorded\. This is an alert from SMS Hub/);
    expect(decodeState(String(calls[0].body.client_state))).toMatchObject(state);
    expect(await handleCallEvent(deps, line, { event_type: "call.recording.saved", payload: { call_control_id: "cc-record", recording_started_at: "2026-10-30T13:00:00Z", recording_ended_at: "2026-10-30T13:01:24Z" } }, state)).toBe("recording saved");
    expect(fdb.rows("messages")[0].recording_seconds).toBe(84);
    expect(await handleCallEvent(deps, line, { event_type: "call.speak.ended", payload: { call_control_id: "cc-record" } }, { ...state, h: 1 })).toBe("hung up after goodbye");
  });

  it("leaves recording disabled for other lines", async () => {
    const { fdb } = setup();
    fdb.tables.alerts = [{ id: "alert-off", message: "Backup done" }];
    const command = vi.fn(async (_id: string, _action: string, _body: Record<string, unknown>) => ({ ok: true as const, data: {} }));
    await handleCallEvent({ db: fdb as unknown as SupabaseClient, command }, { ...FAMILY, user_id: USER, record_calls: false }, { event_type: "call.answered", payload: { call_control_id: "cc-off" } }, { l: FAMILY.id, al: "alert-off" });
    expect(command).toHaveBeenCalledTimes(1);
    expect(command.mock.calls[0]).toEqual(expect.arrayContaining(["speak", expect.objectContaining({ payload: expect.not.stringContaining("recorded") })]));
  });
});
