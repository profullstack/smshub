import crypto from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authenticateTelnyxWebhook, numberVariants, telnyxEventNumbers } from "../telnyx-webhook-auth";

function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  return { raw: spki.subarray(spki.length - 32).toString("base64"), privateKey };
}

function signed(privateKey: crypto.KeyObject, body: unknown) {
  const rawBody = JSON.stringify(body);
  const timestamp = "1760000000";
  const signature = crypto.sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString("base64");
  return {
    rawBody,
    body: JSON.parse(rawBody),
    headers: new Headers({ "telnyx-signature-ed25519": signature, "telnyx-timestamp": timestamp }),
  };
}

const inbound = {
  data: {
    event_type: "message.received",
    payload: { from: { phone_number: "+15550001111" }, to: [{ phone_number: "+17139303938" }] },
  },
};

// Minimal Supabase stub: phone_numbers lookup returns `rows`; updates recorded.
function stubSupabase(rows: unknown[]) {
  const updates: unknown[] = [];
  const client = {
    from: vi.fn((table: string) => {
      if (table === "phone_numbers") {
        const chain = {
          select: () => chain,
          in: () => chain,
          eq: () => Promise.resolve({ data: rows, error: null }),
        };
        return chain;
      }
      return {
        update: (v: unknown) => {
          updates.push(v);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    }),
  };
  return { client: client as never, updates };
}

describe("telnyx webhook auth", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    delete process.env.TELNYX_PUBLIC_KEY;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("collects every number in the event and its saved spellings", () => {
    expect(telnyxEventNumbers(inbound)).toEqual(["+15550001111", "+17139303938"]);
    expect(numberVariants(["+17139303938"])).toEqual(expect.arrayContaining(["+17139303938", "17139303938", "7139303938"]));
  });

  it("accepts an event signed by a customer's own Telnyx account", async () => {
    process.env.TELNYX_PUBLIC_KEY = keyPair().raw; // smshub's own account, not the signer
    const customer = keyPair();
    const { client } = stubSupabase([
      { providers: { id: "prov-1", api_key: "KEY_CUSTOMER", metadata: { public_key: customer.raw } } },
    ]);
    const e = signed(customer.privateKey, inbound);
    const auth = await authenticateTelnyxWebhook(client, e.rawBody, e.body, e.headers);
    expect(auth).toEqual({ ok: true, providerId: "prov-1", candidates: 2 });
  });

  it("rejects an event no known key signed", async () => {
    process.env.TELNYX_PUBLIC_KEY = keyPair().raw;
    const { client } = stubSupabase([
      { providers: { id: "prov-1", api_key: "KEY_CUSTOMER", metadata: { public_key: keyPair().raw } } },
    ]);
    const e = signed(keyPair().privateKey, inbound);
    const auth = await authenticateTelnyxWebhook(client, e.rawBody, e.body, e.headers);
    expect(auth.ok).toBe(false);
  });

  it("still accepts smshub's own account via TELNYX_PUBLIC_KEY", async () => {
    const own = keyPair();
    process.env.TELNYX_PUBLIC_KEY = own.raw;
    const { client } = stubSupabase([]);
    const e = signed(own.privateKey, inbound);
    const auth = await authenticateTelnyxWebhook(client, e.rawBody, e.body, e.headers);
    expect(auth).toEqual({ ok: true, providerId: null, candidates: 1 });
  });

  it("fetches and stores the key of a provider saved before keys were kept", async () => {
    const customer = keyPair();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { public: customer.raw } }) });
    const { client, updates } = stubSupabase([{ providers: { id: "prov-old", api_key: "KEY_OLD", metadata: null } }]);
    const e = signed(customer.privateKey, inbound);
    const auth = await authenticateTelnyxWebhook(client, e.rawBody, e.body, e.headers);
    expect(auth.providerId).toBe("prov-old");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.telnyx.com/v2/public_key");
    expect(updates).toEqual([{ metadata: { public_key: customer.raw } }]);
  });

  it("skips verification only when no key exists at all (local dev)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ errors: [{ code: "10009" }] }) });
    const { client } = stubSupabase([]);
    const auth = await authenticateTelnyxWebhook(client, "{}", {}, new Headers());
    expect(auth).toEqual({ ok: true, providerId: null, candidates: 0 });
  });
});
