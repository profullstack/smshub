import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign } from "crypto";
import { extractOtp } from "../api";
import { isPrivateAddress, isPublicHttpsUrl } from "@/lib/webhooks/url-guard";
import { TelnyxProvider } from "@/lib/providers/telnyx";
import { normalizeE164 } from "@/lib/phone";
import { PLANS, limitReached, orderAmountUsd, type PlanUsage } from "@/lib/plans";

describe("extractOtp", () => {
  it.each([
    ["Your Google verification code is 482913", "482913"],
    ["G-482913 is your Google verification code.", "482913"],
    ["WhatsApp code 123-456. Don't share it", "123456"],
    ["Your code: 1234", "1234"],
    ["7731 is your Uber code", "7731"],
    ["Код подтверждения: 55821", "55821"],
    ["Use 908 112 to sign in", "908112"],
    ["Hello, see you at 10:30", null],
    ["", null],
  ])("%s -> %s", (body, code) => {
    expect(extractOtp(body)).toBe(code);
  });
});

describe("webhook url guard", () => {
  it("refuses private, loopback and non-https targets", async () => {
    const pub = async () => [{ address: "93.184.216.34" }];
    const priv = async () => [{ address: "10.200.56.4" }];
    expect(await isPublicHttpsUrl("https://hooks.example.com/x", pub)).toBe(true);
    expect(await isPublicHttpsUrl("http://hooks.example.com/x", pub)).toBe(false);
    expect(await isPublicHttpsUrl("https://hooks.example.com/x", priv)).toBe(false);
    expect(await isPublicHttpsUrl("https://localhost/x", pub)).toBe(false);
    expect(await isPublicHttpsUrl("https://127.0.0.1/x", pub)).toBe(false);
    expect(await isPublicHttpsUrl("https://[::1]/x", pub)).toBe(false);
    expect(await isPublicHttpsUrl("https://user:pw@hooks.example.com/x", pub)).toBe(false);
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
});

describe("telnyx webhook signatures", () => {
  // Telnyx hands out the raw 32-byte Ed25519 key, base64. That form used to be
  // parsed as DER and every signed webhook was refused.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawB64 = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");

  it("accepts the raw 32-byte key form", () => {
    expect(Buffer.from(rawB64, "base64").length).toBe(32);
    const body = JSON.stringify({ data: { event_type: "message.received" } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(null, Buffer.from(`${ts}|${body}`), privateKey).toString("base64");
    const headers = new Headers({ "telnyx-signature-ed25519": sig, "telnyx-timestamp": ts });
    const p = new TelnyxProvider();
    expect(p.validateWebhook(body, headers, "", rawB64)).toBe(true);
    expect(p.validateWebhook(body + "x", headers, "", rawB64)).toBe(false);
    const old = String(Number(ts) - 3600);
    const oldSig = sign(null, Buffer.from(`${old}|${body}`), privateKey).toString("base64");
    expect(
      p.validateWebhook(body, new Headers({ "telnyx-signature-ed25519": oldSig, "telnyx-timestamp": old }), "", rawB64)
    ).toBe(false);
  });
});

describe("numbers and plans", () => {
  it("normalizes E.164", () => {
    expect(normalizeE164("+1 (415) 555-0123")).toBe("+14155550123");
    expect(normalizeE164("4155550123")).toBeNull();
    expect(normalizeE164("+")).toBeNull();
  });

  it("prices whole months and reports limits", () => {
    expect(orderAmountUsd(3, { MANAGED_NUMBER_PRICE_USD: "4.99" } as unknown as NodeJS.ProcessEnv)).toBe(14.97);
    expect(orderAmountUsd(1, {} as unknown as NodeJS.ProcessEnv)).toBe(5);
    const free: PlanUsage = {
      plan: "free",
      limits: PLANS.free,
      usage: { managedNumbers: 0, openOrders: 0, byoNumbers: 3, apiKeys: 1, webhooks: 0 },
    };
    expect(limitReached(free, "byoNumbers")).toMatch(/free plan allows 3/);
    expect(limitReached(free, "apiKeys")).toBeNull();
  });
});
