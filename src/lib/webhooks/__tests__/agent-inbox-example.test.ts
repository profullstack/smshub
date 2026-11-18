// @vitest-environment node
//
// examples/agent-inbox/webhook-receiver.mjs checks signatures with its own
// zero-dependency code. These tests hold it to what the server actually sends:
// a real smshub hub signs a message.received delivery, and the example must
// accept it, and refuse it once anything is changed.
import { describe, it, expect, vi, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import { memoryStore, signRequest } from "@profullstack/webhooks";

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(), createServerSupabaseClient: vi.fn() }));

import { createHooks, emitEvent, setHooks } from "../hub";
import { verifyWebhook, createReceiver } from "../../../../examples/agent-inbox/webhook-receiver.mjs";

const guard = { lookup: async () => ["93.184.216.34"] };
type Captured = { headers: Record<string, string>; body: string };

async function signedDelivery() {
  const got: Captured[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    got.push({ headers: init?.headers as Record<string, string>, body: String(init?.body) });
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  const hooks = createHooks(memoryStore(), { guard, fetchImpl });
  setHooks(hooks);
  const { secret } = await hooks.createEndpoint("user-1", { url: "https://hooks.example.com/sms", events: ["message.received"] });
  await emitEvent(
    "user-1",
    "message.received",
    { message_id: "m1", number: "+15555550100", from: "+15555550199", body: "Your code is 000000", otp: "000000", received_at: "2026-11-18T00:00:00.000Z" },
    "message:m1"
  );
  expect(await hooks.drain()).toBe(1);
  expect(got).toHaveLength(1);
  return { secret, ...got[0] };
}

afterEach(() => setHooks(null));

describe("examples/agent-inbox webhook receiver", () => {
  it("accepts a delivery signed by the smshub hub and reads message.received", async () => {
    const d = await signedDelivery();
    expect(d.headers["webhook-signature"]).toMatch(/^v1,/);
    const r = verifyWebhook({ headers: d.headers, body: d.body, secret: d.secret });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).toBe(d.headers["webhook-id"]);
    expect(r.event).toMatchObject({ specversion: "1.0", type: "message.received", data: { otp: "000000", number: "+15555550100" } });
    // Raw bytes work too, as node:http hands them over.
    expect(verifyWebhook({ headers: d.headers, body: Buffer.from(d.body), secret: d.secret }).ok).toBe(true);
  });

  it("refuses a changed body, the wrong secret, a stale timestamp and missing headers", async () => {
    const d = await signedDelivery();
    expect(verifyWebhook({ headers: d.headers, body: d.body.replace("000000", "111111"), secret: d.secret })).toMatchObject({ ok: false, reason: "signature mismatch" });
    const other = "whsec_" + Buffer.from("k".repeat(32)).toString("base64");
    expect(verifyWebhook({ headers: d.headers, body: d.body, secret: other }).ok).toBe(false);
    const later = (Number(d.headers["webhook-timestamp"]) + 301) * 1000;
    expect(verifyWebhook({ headers: d.headers, body: d.body, secret: d.secret, now: later })).toMatchObject({ ok: false });
    const { ["webhook-signature"]: _drop, ...noSig } = d.headers;
    void _drop;
    expect(verifyWebhook({ headers: noSig, body: d.body, secret: d.secret }).ok).toBe(false);
  });

  it("agrees with the package signer, including several signatures during a rotation", () => {
    const secret = "whsec_" + Buffer.from("s".repeat(32)).toString("base64");
    const old = "whsec_" + Buffer.from("o".repeat(32)).toString("base64");
    const body = JSON.stringify({ type: "webhook.test", id: "evt_1" });
    const h = signRequest({ id: "evt_1", body, secret });
    const hOld = signRequest({ id: "evt_1", timestamp: Number(h["webhook-timestamp"]), body, secret: old });
    const both = { ...h, "webhook-signature": `${hOld["webhook-signature"]} ${h["webhook-signature"]}` };
    expect(verifyWebhook({ headers: both, body, secret }).ok).toBe(true);
    expect(verifyWebhook({ headers: hOld, body, secret }).ok).toBe(false);
  });

  it("the HTTP receiver answers 204 to a signed delivery, 401 to a forged one, and hands each event over once", async () => {
    const d = await signedDelivery();
    const events: unknown[] = [];
    const server = createReceiver({ secret: d.secret, onEvent: (e: unknown) => void events.push(e) });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    try {
      const post = (body: string) => fetch(url, { method: "POST", headers: d.headers, body });
      expect((await post(d.body)).status).toBe(204);
      expect((await post(d.body)).status).toBe(204); // a retry: same webhook-id
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await post(d.body + " ")).status).toBe(401);
      err.mockRestore();
      expect((await fetch(url)).status).toBe(405);
      await new Promise((r) => setTimeout(r, 20));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "message.received" });
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
