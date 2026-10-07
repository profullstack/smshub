import crypto from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDb } from "@/__tests__/fake-db";

const db = new FakeDb();
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));

function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  return { raw: spki.subarray(spki.length - 32).toString("base64"), privateKey };
}

function signedRequest(path: string, privateKey: crypto.KeyObject, body: unknown) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString("base64");
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: rawBody,
    headers: {
      "Content-Type": "application/json",
      "telnyx-signature-ed25519": signature,
      "telnyx-timestamp": timestamp,
    },
  });
}

const inbound = {
  data: {
    event_type: "message.received",
    id: "evt-1",
    payload: {
      id: "msg-in-1",
      from: { phone_number: "+15550001111" },
      to: [{ phone_number: "+17139303938" }],
      text: "hello",
    },
  },
};

describe("Telnyx webhooks from a bring-your-own account", () => {
  const fetchMock = vi.fn();
  const customer = keyPair();

  beforeEach(() => {
    db.tables = {
      providers: [{ id: "prov-1", user_id: "user-1", type: "telnyx", api_key: "KEY_CUSTOMER", api_secret: null }],
      phone_numbers: [
        { id: "pn-1", user_id: "user-1", provider_id: "prov-1", number: "+17139303938", status: "active", managed: false },
      ],
    };
    process.env.TELNYX_PUBLIC_KEY = keyPair().raw; // smshub's own account, not the signer
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { public: customer.raw } }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELNYX_PUBLIC_KEY;
  });

  it("fetches the account's key on first use, keeps it, and stores the text", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const res = await POST(signedRequest("/api/webhooks/telnyx", customer.privateKey, inbound));
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.telnyx.com/v2/public_key");
    expect(db.rows("providers")[0].api_secret).toBe(customer.raw);
    expect(db.rows("messages")).toEqual([expect.objectContaining({ body: "hello", direction: "inbound" })]);

    // Second event: the stored key is used, no new Telnyx call.
    fetchMock.mockClear();
    const again = await POST(
      signedRequest("/api/webhooks/telnyx", customer.privateKey, {
        data: { ...inbound.data, payload: { ...inbound.data.payload, id: "msg-in-2" } },
      })
    );
    expect(again.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replaces junk typed into API Secret with the fetched key", async () => {
    db.rows("providers")[0].api_secret = "abc123";
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const res = await POST(signedRequest("/api/webhooks/telnyx", customer.privateKey, inbound));
    expect(res.status).toBe(200);
    expect(db.rows("providers")[0].api_secret).toBe(customer.raw);
  });

  it("refuses an event signed by some other key", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const res = await POST(signedRequest("/api/webhooks/telnyx", keyPair().privateKey, inbound));
    expect(res.status).toBe(403);
    expect(db.rows("messages")).toEqual([]);
  });

  it("accepts the account's delivery reports on the status route", async () => {
    db.rows("providers")[0].api_secret = customer.raw;
    db.tables.messages = [{ id: "m1", provider_message_id: "msg-out-1", status: "sent" }];
    const { POST } = await import("@/app/api/webhooks/telnyx/status/route");
    const res = await POST(
      signedRequest("/api/webhooks/telnyx/status", customer.privateKey, {
        data: {
          event_type: "message.finalized",
          payload: {
            id: "msg-out-1",
            from: { phone_number: "+17139303938" },
            to: [{ phone_number: "+15550001111", status: "delivered" }],
            errors: [],
          },
        },
      })
    );
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("looksLikeEd25519Key", () => {
  it("accepts raw and DER keys, rejects whatever else was typed in", async () => {
    const { looksLikeEd25519Key } = await import("@/lib/providers/telnyx-webhook-auth");
    expect(looksLikeEd25519Key(Buffer.alloc(32, 7).toString("base64"))).toBe(true);
    expect(looksLikeEd25519Key(Buffer.alloc(44, 7).toString("base64"))).toBe(true);
    expect(looksLikeEd25519Key("mysecret1234")).toBe(false);
    expect(looksLikeEd25519Key("")).toBe(false);
    expect(looksLikeEd25519Key(null)).toBe(false);
  });
});
