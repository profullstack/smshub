import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import { callLength, handleCallEvent, menuPrompt, type CallState } from "../ivr";
import { configureVoice, decodeState, encodeState } from "../telnyx-voice";

const LINE = { id: "11111111-1111-4111-8111-111111111111", user_id: "u1", number: "+14085550100" };

function setup(withMenu = true) {
  const fdb = new FakeDb();
  fdb.tables.line_contacts = withMenu
    ? [
        { phone_number_id: LINE.id, name: "Mike", forward_to: "+14155550002", keypad_digit: 2 },
        { phone_number_id: LINE.id, name: "Kim", forward_to: "+14155550001", keypad_digit: 1 },
        { phone_number_id: LINE.id, name: "Pat", forward_to: "+14155550003", keypad_digit: null },
      ]
    : [];
  const calls: Array<{ action: string; body: Record<string, unknown> }> = [];
  const command = vi.fn(async (_id: string, action: string, body: Record<string, unknown>) => {
    calls.push({ action, body });
    return { ok: true as const, data: {} };
  });
  const deps = { db: fdb as unknown as SupabaseClient, command };
  const send = (event_type: string, payload: Record<string, unknown>, state: CallState | null = null) =>
    handleCallEvent(deps, LINE, { event_type, payload: { call_control_id: "cc-1", ...payload } }, state);
  return { fdb, calls, send };
}

describe("menuPrompt", () => {
  it("reads the book in digit order and skips people without a digit", () => {
    expect(
      menuPrompt([
        { name: "Mike", forward_to: "+1", keypad_digit: 2 },
        { name: "Kim ♥", forward_to: "+1", keypad_digit: 1 },
        { name: "Pat", forward_to: "+1", keypad_digit: null },
      ])
    ).toBe("Thanks for calling. Press 1 for Kim. Press 2 for Mike.");
  });
  it("formats call length", () => {
    expect(callLength({ start_time: "2026-10-07T10:00:00Z", end_time: "2026-10-07T10:02:13Z" })).toBe("2m 13s");
    expect(callLength({})).toBeNull();
  });
});

describe("voice menu call flow", () => {
  it("answers, plays the menu, puts the caller through, and logs it", async () => {
    const { fdb, calls, send } = setup();
    expect(await send("call.initiated", { direction: "incoming", from: "+12125550199", to: LINE.number, call_session_id: "s1" })).toBe("answered");
    const [log] = fdb.rows("messages");
    expect(log).toMatchObject({ kind: "call", direction: "inbound", body: "Incoming call", provider_message_id: "call:s1" });
    const state = decodeState(calls[0].body.client_state) as CallState;
    expect(state).toEqual({ l: LINE.id, m: log.id, a: 0 });

    // A retried call.initiated is not logged or answered twice.
    expect(await send("call.initiated", { direction: "incoming", from: "+12125550199", to: LINE.number, call_session_id: "s1" })).toBe("ignored: retry");

    expect(await send("call.answered", {}, state)).toBe("menu");
    expect(calls[1]).toMatchObject({
      action: "gather_using_speak",
      body: { payload: "Thanks for calling. Press 1 for Kim. Press 2 for Mike.", valid_digits: "12", maximum_digits: 1 },
    });

    expect(await send("call.gather.ended", { digits: "1", status: "valid" }, state)).toBe("transferred to Kim");
    expect(calls[2]).toMatchObject({ action: "transfer", body: { to: "+14155550001" } });
    const transferState = decodeState(calls[2].body.client_state) as CallState;
    expect(transferState.t).toBe(1);

    // The transferred leg's own events are left alone (no second menu on Kim's phone).
    expect(await send("call.answered", {}, transferState)).toBe("ignored: transferred leg");

    await send("call.hangup", { start_time: "2026-10-07T10:00:00Z", end_time: "2026-10-07T10:01:05Z" }, state);
    expect(fdb.rows("messages")[0].body).toBe("Incoming call, put through to Kim (1m 5s)");
    expect(fdb.rows("contacts")[0]).toMatchObject({ phone: "+12125550199" });
    expect(calls).toHaveLength(3);
  });

  it("asks again on a wrong digit, then gives up", async () => {
    const { fdb, calls, send } = setup();
    await send("call.initiated", { direction: "incoming", from: "+12125550199", to: LINE.number, call_session_id: "s2" });
    let state = decodeState(calls[0].body.client_state) as CallState;
    expect(await send("call.gather.ended", { digits: "7", status: "invalid" }, state)).toBe("asked again");
    expect(String(calls[1].body.payload)).toMatch(/^Sorry, that is not an option\. Press 1/);
    state = decodeState(calls[1].body.client_state) as CallState;
    expect(await send("call.gather.ended", { digits: "", status: "timeout" }, state)).toBe("asked again");
    state = decodeState(calls[2].body.client_state) as CallState;
    expect(await send("call.gather.ended", { digits: "", status: "timeout" }, state)).toBe("gave up");
    expect(calls[3].action).toBe("hangup");
    expect(fdb.rows("messages")[0].body).toMatch(/^Missed call/);
  });

  it("marks a caller who hangs up at the menu as missed", async () => {
    const { fdb, calls, send } = setup();
    await send("call.initiated", { direction: "incoming", from: "+12125550199", to: LINE.number, call_session_id: "s3" });
    const state = decodeState(calls[0].body.client_state) as CallState;
    expect(await send("call.gather.ended", { status: "call_hangup" }, state)).toBe("caller left");
    await send("call.hangup", {}, state);
    expect(fdb.rows("messages")[0].body).toBe("Missed call: hung up before choosing");
  });

  it("hangs up and logs a missed call when the line has no menu", async () => {
    const { fdb, calls, send } = setup(false);
    expect(await send("call.initiated", { direction: "incoming", from: "+12125550199", to: LINE.number })).toBe("rejected: no menu");
    expect(calls.map((c) => c.action)).toEqual(["hangup"]);
    expect(fdb.rows("messages")[0].body).toMatch(/no voice menu/);
  });
});

describe("configureVoice", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const HOOK = "https://smshub.dev/api/webhooks/telnyx/voice";

  function account(apps: unknown[], connection: string | null, forwarding: Record<string, unknown> | null = null, connectionPatch = 200) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/voice")) {
        if (init?.method === "PATCH") return json({ data: {} });
        return json({ data: { call_forwarding: forwarding ?? { call_forwarding_enabled: false } } });
      }
      if (init?.method === "PATCH" && connectionPatch >= 400) return json({ errors: [{ title: "Bad Request" }] }, connectionPatch);
      if (init?.method === "POST" && url.endsWith("/call_control_applications")) return json({ data: { id: "app-new", application_name: "smshub voice menu", webhook_event_url: HOOK } });
      if (init?.method === "PATCH") return json({ data: {} });
      if (url.includes("/call_control_applications")) return json({ data: apps });
      if (url.includes("/phone_numbers?")) return json({ data: [{ id: "tn-1", phone_number: "+14085550100", connection_id: connection }] });
      if (url.includes("/connections/")) return json({ data: { connection_name: "qrypt sip" } });
      throw new Error(`unexpected ${url}`);
    });
  }
  const writes = () => fetchMock.mock.calls.filter(([, i]) => i?.method && i.method !== "GET").map(([u, i]) => [i.method, u, JSON.parse(i.body)]);

  it("only reads without apply", async () => {
    account([], null);
    expect(await configureVoice("KEY", "+14085550100")).toMatchObject({ ok: false, state: "not_configured" });
    expect(writes()).toEqual([]);
  });

  it("creates the app and points the number at it", async () => {
    account([], null);
    const v = await configureVoice("KEY", "+14085550100", { apply: true });
    expect(v).toMatchObject({ ok: true, state: "configured", action: "created_application", applicationId: "app-new" });
    expect(writes()).toEqual([
      ["POST", "https://api.telnyx.com/v2/call_control_applications", expect.objectContaining({ webhook_event_url: HOOK })],
      ["PATCH", "https://api.telnyx.com/v2/phone_numbers/tn-1", { connection_id: "app-new" }],
    ]);
  });

  it("is a no-op when already set", async () => {
    account([{ id: "app-1", application_name: "x", webhook_event_url: HOOK + "/" }], "app-1");
    expect(await configureVoice("KEY", "+14085550100", { apply: true })).toMatchObject({ ok: true, action: "already_set" });
    expect(writes()).toEqual([]);
  });

  it("leaves another connection alone unless forced", async () => {
    account([{ id: "app-1", application_name: "x", webhook_event_url: HOOK }], "sip-9");
    const v = await configureVoice("KEY", "+14085550100", { apply: true });
    expect(v).toMatchObject({ ok: false, state: "points_elsewhere", action: "refused", connectionName: "qrypt sip" });
    expect(writes()).toEqual([]);
    expect(await configureVoice("KEY", "+14085550100", { apply: true, force: true })).toMatchObject({ ok: true, action: "assigned" });
    expect(writes()).toEqual([["PATCH", "https://api.telnyx.com/v2/phone_numbers/tn-1", { connection_id: "app-1" }]]);
  });

  it("treats Telnyx call forwarding as taken, and switches it off only when forced", async () => {
    const fwd = { call_forwarding_enabled: true, forwards_to: "+14085550199", forwarding_type: "always" };
    account([{ id: "app-1", application_name: "x", webhook_event_url: HOOK }], "cred-1", fwd);
    const v = await configureVoice("KEY", "+14085550100", { apply: true });
    expect(v).toMatchObject({ ok: false, state: "points_elsewhere", forwardsTo: "+14085550199" });
    expect(v.message).toMatch(/forwarded to \+14085550199/);
    expect(writes()).toEqual([]);
    expect(await configureVoice("KEY", "+14085550100", { apply: true, force: true })).toMatchObject({ ok: true });
    expect(writes()).toEqual([
      ["PATCH", "https://api.telnyx.com/v2/phone_numbers/tn-1/voice", { call_forwarding: { call_forwarding_enabled: false } }],
      ["PATCH", "https://api.telnyx.com/v2/phone_numbers/tn-1", { connection_id: "app-1" }],
    ]);
  });

  it("puts the forwarding back when Telnyx refuses the connection", async () => {
    const fwd = { call_forwarding_enabled: true, forwards_to: "+14085550199", forwarding_type: "always" };
    account([{ id: "app-1", application_name: "x", webhook_event_url: HOOK }], "cred-1", fwd, 400);
    expect(await configureVoice("KEY", "+14085550100", { apply: true, force: true })).toMatchObject({ ok: false, state: "error" });
    expect(writes().at(-1)).toEqual(["PATCH", "https://api.telnyx.com/v2/phone_numbers/tn-1/voice", { call_forwarding: fwd }]);
  });

  it("round-trips client_state and shrugs at junk", () => {
    expect(decodeState(encodeState({ l: "x", a: 1 }))).toEqual({ l: "x", a: 1 });
    expect(decodeState("%%%")).toBeNull();
    expect(decodeState(undefined)).toBeNull();
  });
});
