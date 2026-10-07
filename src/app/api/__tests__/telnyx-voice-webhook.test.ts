import crypto from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDb } from "@/__tests__/fake-db";
import { decodeState, encodeState } from "@/lib/voice/telnyx-voice";

const db = new FakeDb();
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));

function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  return { raw: spki.subarray(spki.length - 32).toString("base64"), privateKey };
}

function signed(privateKey: crypto.KeyObject, body: unknown) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString("base64");
  return new Request("http://localhost/api/webhooks/telnyx/voice", {
    method: "POST",
    body: rawBody,
    headers: { "Content-Type": "application/json", "telnyx-signature-ed25519": signature, "telnyx-timestamp": timestamp },
  });
}

const LINE_ID = "11111111-1111-4111-8111-111111111111";
const event = (event_type: string, payload: Record<string, unknown>) => ({ data: { event_type, payload: { call_control_id: "cc-1", ...payload } } });

describe("Telnyx voice webhook", () => {
  const fetchMock = vi.fn();
  const customer = keyPair();

  beforeEach(() => {
    const provider = { id: "prov-1", user_id: "u1", type: "telnyx", api_key: "KEY_CUSTOMER", api_secret: customer.raw, metadata: null };
    db.tables = {
      providers: [provider],
      // FakeDb ignores the embedded select, so the row carries its provider like PostgREST would return it.
      phone_numbers: [
        { id: LINE_ID, user_id: "u1", provider_id: "prov-1", number: "+14085550100", status: "active", managed: false, providers: provider },
      ],
      line_contacts: [{ phone_number_id: LINE_ID, name: "Kim", forward_to: "+14155550001", keypad_digit: 1 }],
    };
    process.env.TELNYX_PUBLIC_KEY = keyPair().raw;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { result: "ok" } }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELNYX_PUBLIC_KEY;
  });

  it("answers a call to a BYO line with the owner's own key", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/voice/route");
    const res = await POST(signed(customer.privateKey, event("call.initiated", { direction: "incoming", from: "+12125550199", to: "+14085550100", call_session_id: "s1" })));
    expect(await res.json()).toMatchObject({ ok: true, result: "answered" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telnyx.com/v2/calls/cc-1/actions/answer");
    expect(init.headers.Authorization).toBe("Bearer KEY_CUSTOMER");
    expect(decodeState(JSON.parse(init.body).client_state)).toMatchObject({ l: LINE_ID, a: 0 });
    expect(db.rows("messages")).toEqual([expect.objectContaining({ kind: "call", body: "Incoming call" })]);
  });

  it("finds the line from client_state on later events", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/voice/route");
    const res = await POST(signed(customer.privateKey, event("call.gather.ended", { digits: "1", status: "valid", client_state: encodeState({ l: LINE_ID, a: 0 }) })));
    expect(await res.json()).toMatchObject({ result: "transferred to Kim" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.telnyx.com/v2/calls/cc-1/actions/transfer");
  });

  it("refuses an event signed by anyone else", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/voice/route");
    const res = await POST(signed(keyPair().privateKey, event("call.initiated", { direction: "incoming", from: "+1", to: "+14085550100" })));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.rows("messages")).toEqual([]);
  });
});
