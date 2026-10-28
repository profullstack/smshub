// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { memoryStore, verifyAndParse } from "@profullstack/webhooks";

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(), createServerSupabaseClient: vi.fn() }));

import { createHooks, emitEvent, setHooks, WEBHOOK_EVENT_TYPES } from "../hub";
import { emitDeliveryStatus, emitOutbound } from "../events";
import { supabaseStore } from "../supabase-store";
import { fakeSupabase } from "../__fixtures__/fake-supabase";
import { llmsTxt } from "@/lib/developer-api";

/** A public address for every host, so no test touches DNS. */
const guard = { lookup: async () => ["93.184.216.34"] };

type Captured = { url: string; headers: Record<string, string>; body: string };

function receiver(status = 200) {
  const got: Captured[] = [];
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    got.push({ url: String(url), headers: init?.headers as Record<string, string>, body: String(init?.body) });
    return new Response("ok", { status });
  });
  return { got, fetchImpl: fetchImpl as unknown as typeof fetch };
}

afterEach(() => setHooks(null));

describe("smshub webhooks hub", () => {
  it("message.received reaches a Standard Webhooks receiver as a signed CloudEvent, via the Supabase store", async () => {
    const sb = fakeSupabase();
    const { got, fetchImpl } = receiver();
    const hooks = createHooks(supabaseStore(sb), { guard, fetchImpl });
    setHooks(hooks);
    const { secret } = await hooks.createEndpoint("user-1", { url: "https://hooks.example.com/sms", events: ["message.received"] });

    await emitEvent(
      "user-1",
      "message.received",
      { message_id: "m1", number: "+14155550100", from: "+14155551234", body: "Your code is 482913", otp: "482913", received_at: "2026-10-28T12:00:00.000Z" },
      "message:m1"
    );
    expect(await hooks.drain()).toBe(1);
    expect(got).toHaveLength(1);

    const r = verifyAndParse({ headers: got[0].headers, body: got[0].body, secret });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event).toMatchObject({
      specversion: "1.0",
      type: "message.received",
      subject: "message:m1",
      data: { number: "+14155550100", from: "+14155551234", body: "Your code is 482913", otp: "482913" },
    });
    // A receiver with the wrong secret is refused.
    expect(verifyAndParse({ headers: got[0].headers, body: got[0].body, secret: "whsec_" + Buffer.from("x".repeat(32)).toString("base64") }).ok).toBe(false);
    expect(sb.rows("hub_webhook_deliveries")[0]).toMatchObject({ status: "delivered", attempts: 1, last_status: 200 });
  });

  it("only subscribed events are queued, and patterns smshub never sends are refused", async () => {
    const hooks = createHooks(memoryStore(), { guard, fetchImpl: receiver().fetchImpl });
    setHooks(hooks);
    await expect(hooks.createEndpoint("u", { url: "https://hooks.example.com/", events: ["room.joined"] })).rejects.toThrow(/no event matches/);
    await hooks.createEndpoint("u", { url: "https://hooks.example.com/", events: ["number.*"] });
    expect((await hooks.emit("u", "message.received", {})).queued).toBe(0);
    expect((await hooks.emit("u", "number.expiring", {})).queued).toBe(1);
    expect(WEBHOOK_EVENT_TYPES).toContain("group.sent");
  });

  it("emitEvent never throws, even when the store is down", async () => {
    const broken = { ...memoryStore(), listEndpoints: async () => { throw new Error("db down"); } };
    setHooks(createHooks(broken, { guard }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(emitEvent("u", "message.sent", {})).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("emitOutbound picks message.sent or message.failed from the saved row", async () => {
    const hooks = createHooks(memoryStore(), { guard, fetchImpl: receiver().fetchImpl });
    setHooks(hooks);
    await hooks.createEndpoint("u", { url: "https://hooks.example.com/", events: ["message.*"] });
    await emitOutbound("u", { id: "a", status: "sent", body: "hi" }, { number: "+1", phone_number_id: "p", to: "+2" });
    await emitOutbound("u", { id: "b", status: "failed", body: "hi", error_detail: "40010" }, { number: "+1", phone_number_id: "p", to: "+2", error: "Not 10DLC registered" });
    const types = (await hooks.deliveries("u", { limit: 10 })).map((d) => [d.event_type, (d.payload as { data: { error?: string } }).data.error ?? null]);
    expect(types).toEqual(expect.arrayContaining([["message.sent", null], ["message.failed", "Not 10DLC registered"]]));
  });

  it("delivery status events go to the number's owner, once per outcome id", async () => {
    const hooks = createHooks(memoryStore(), { guard, fetchImpl: receiver().fetchImpl });
    setHooks(hooks);
    await hooks.createEndpoint("owner-1", { url: "https://hooks.example.com/", events: ["message.delivered", "message.failed"] });
    const row = {
      id: "msg-1",
      body: "hello",
      status: "delivered",
      error_code: null,
      error_detail: null,
      conversation_id: "c1",
      conversations: { user_id: "owner-1", phone_number_id: "pn1", phone_numbers: { number: "+14155550100" }, contacts: { phone: "+14155551234" } },
    };
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq"]) q[k] = () => q;
    q.limit = async () => ({ data: [row], error: null });
    const db = { from: () => q } as never;

    await emitDeliveryStatus(db, "telnyx", "tx-1", "delivered");
    await emitDeliveryStatus(db, "telnyx", "tx-1", "delivered"); // a replayed callback
    await emitDeliveryStatus(db, "telnyx", "tx-1", "failed"); // stored status is delivered: not reported
    await emitDeliveryStatus(db, "telnyx", "tx-1", "sent"); // not final: not reported
    const ds = await hooks.deliveries("owner-1", { limit: 10 });
    expect(ds.map((d) => d.event_type)).toEqual(["message.delivered", "message.delivered"]);
    expect(new Set(ds.map((d) => d.event_id))).toEqual(new Set(["evt_msg_msg-1_delivered"]));
    expect((ds[0].payload as { data: Record<string, unknown> }).data).toMatchObject({ number: "+14155550100", to: "+14155551234", status: "delivered" });
  });

  it("llms.txt lists every webhook event", () => {
    const txt = llmsTxt("https://smshub.dev", "SMS Hub");
    for (const t of WEBHOOK_EVENT_TYPES) expect(txt).toContain(`- ${t}:`);
    expect(txt).toContain("POST /api/v1/webhooks");
  });
});
