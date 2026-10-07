import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { testProvider } from "../provider-check";

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

const HOOK = "https://smshub.dev/api/webhooks/telnyx";

describe("testProvider (telnyx)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.NEXT_PUBLIC_APP_URL = "https://smshub.dev";
  });
  afterEach(() => vi.unstubAllGlobals());

  function account(opts: { profileHook?: string | null; sendStatus?: number; finalStatus?: string; errors?: unknown[] } = {}) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/public_key")) return json({ data: { public: "PUBKEY" } });
      if (url.includes("/messaging_profiles"))
        return json({ data: [{ id: "p1", name: "Main", webhook_url: opts.profileHook ?? null }] });
      if (url.includes("/phone_numbers/messaging"))
        return json({ data: [{ phone_number: "+17139303938", messaging_profile_id: "p1" }] });
      if (url.endsWith("/messages") && init?.method === "POST") {
        return opts.sendStatus && opts.sendStatus >= 400
          ? json({ errors: [{ code: "40310", title: "Invalid 'to' address" }] }, opts.sendStatus)
          : json({ data: { id: "msg-1" } });
      }
      if (url.endsWith("/messages/msg-1"))
        return json({ data: { to: [{ status: opts.finalStatus ?? "queued" }], errors: opts.errors ?? [] } });
      throw new Error(`unexpected ${url}`);
    });
  }

  const base = { type: "telnyx", apiKey: "KEY", apiSecret: null, numbers: ["(713) 930-3938"] };

  it("fails the key check with Telnyx's own message and code", async () => {
    fetchMock.mockResolvedValue(json({ errors: [{ code: "10009", title: "Authentication failed" }] }, 401));
    const res = await testProvider(base);
    expect(res.ok).toBe(false);
    expect(res.checks).toEqual([
      expect.objectContaining({ id: "credentials", status: "fail", code: "10009" }),
    ]);
  });

  it("flags a number whose profile has no webhook as fixable", async () => {
    account({ profileHook: null });
    const res = await testProvider(base);
    expect(res.ok).toBe(false);
    expect(res.publicKey).toBe("PUBKEY");
    const number = res.checks.find((c) => c.id === "number:+17139303938");
    expect(number).toMatchObject({ status: "fail", fixable: true });
  });

  it("passes when the profile points at smshub", async () => {
    account({ profileHook: HOOK });
    const res = await testProvider(base);
    expect(res.ok).toBe(true);
    expect(res.checks.map((c) => c.status)).toEqual(["pass", "pass", "pass"]);
  });

  it("reports a carrier rejection with the 10DLC explanation", async () => {
    account({
      profileHook: HOOK,
      finalStatus: "delivery_failed",
      errors: [{ code: "40010", title: "Not 10DLC registered" }],
    });
    const res = await testProvider({ ...base, testTo: "+14155551234" }, { pollMs: 0, polls: 2 });
    const sms = res.checks.find((c) => c.id === "test_sms");
    expect(sms).toMatchObject({ status: "fail", code: "40010" });
    expect(sms?.detail).toContain("10DLC");
    const post = fetchMock.mock.calls.find(([u, i]) => u.endsWith("/messages") && i?.method === "POST");
    expect(JSON.parse(post![1].body)).toMatchObject({ from: "+17139303938", to: "+14155551234" });
  });

  it("reports a refused send with Telnyx's code", async () => {
    account({ profileHook: HOOK, sendStatus: 422 });
    const res = await testProvider({ ...base, testTo: "+14155551234" }, { pollMs: 0, polls: 1 });
    expect(res.checks.find((c) => c.id === "test_sms")).toMatchObject({ status: "fail", code: "40310" });
  });

  it("passes a delivered test SMS", async () => {
    account({ profileHook: HOOK, finalStatus: "delivered" });
    const res = await testProvider({ ...base, testTo: "4155551234" }, { pollMs: 0, polls: 2 });
    expect(res.ok).toBe(true);
    expect(res.checks.find((c) => c.id === "test_sms")?.status).toBe("pass");
  });
});
