import { describe, it, expect } from "vitest";
import {
  coinpayConfig,
  normalizeChain,
  readWebhook,
  signWebhookBody,
  verifyWebhookSignature,
  CHECKOUT_CHAINS,
} from "../checkout";

describe("coinpay checkout", () => {
  it("only accepts a merchant key, never an OAuth client id", () => {
    const base = { COINPAY_BUSINESS_ID: "b", COINPAY_WEBHOOK_SECRET: "s" };
    expect(coinpayConfig({ ...base, COINPAY_API_KEY: "cp_" + "a".repeat(24) } as unknown as NodeJS.ProcessEnv)).toBeNull();
    const cfg = coinpayConfig({ ...base, COINPAY_X402_KEY: "cp_live_" + "0".repeat(20) } as unknown as NodeJS.ProcessEnv);
    expect(cfg?.apiUrl).toBe("https://coinpayportal.com/api");
  });

  it("adds /api to a site-origin COINPAY_API_URL exactly once", () => {
    const env = { COINPAY_API_KEY: "cp_live_" + "0".repeat(16), COINPAY_BUSINESS_ID: "b", COINPAY_WEBHOOK_SECRET: "s" };
    expect(coinpayConfig({ ...env, COINPAY_API_URL: "https://coinpayportal.com/" } as unknown as NodeJS.ProcessEnv)?.apiUrl).toBe(
      "https://coinpayportal.com/api"
    );
    expect(coinpayConfig({ ...env, COINPAY_API_URL: "https://coinpayportal.com/api" } as unknown as NodeJS.ProcessEnv)?.apiUrl).toBe(
      "https://coinpayportal.com/api"
    );
  });

  it("falls back to the default chain for anything we hold no wallet for", () => {
    expect(normalizeChain("usdc_sol")).toBe("USDC_SOL");
    expect(normalizeChain("USDC_BASE")).toBe("USDC_POL");
    expect(CHECKOUT_CHAINS).not.toContain("USDC_BASE");
  });

  it("verifies t=..,v1=.. signatures over the raw body with a 5 minute window", () => {
    const raw = JSON.stringify({ id: "evt_1", data: { payment_id: "p1", status: "confirmed" } });
    const now = 1_800_000_000;
    const header = signWebhookBody(raw, "secret", now);
    expect(verifyWebhookSignature(raw, header, "secret", now)).toBe(true);
    expect(verifyWebhookSignature(raw + " ", header, "secret", now)).toBe(false);
    expect(verifyWebhookSignature(raw, header, "other", now)).toBe(false);
    expect(verifyWebhookSignature(raw, header, "secret", now + 301)).toBe(false);
    expect(verifyWebhookSignature(raw, null, "secret", now)).toBe(false);
    expect(verifyWebhookSignature(raw, "t=abc,v1=zz", "secret", now)).toBe(false);
  });

  it("reads the nested payload, not the event id", () => {
    const ev = readWebhook({
      id: "evt_p1_1",
      type: "payment.confirmed",
      data: { payment_id: "p1", status: "Confirmed", metadata: { order_id: "o1" } },
    });
    expect(ev).toEqual({ paymentId: "p1", status: "confirmed", settled: true, metadata: { order_id: "o1" } });
    expect(readWebhook({ data: { payment_id: "p1", status: "detected" } }).settled).toBe(false);
    expect(readWebhook({ data: { payment_id: "p1", status: "forwarded" } }).settled).toBe(true);
    // The older flat test sender.
    expect(readWebhook({ payment_id: "p2", status: "paid" })).toMatchObject({ paymentId: "p2", settled: true });
    expect(readWebhook({ id: "evt_only", status: "paid" }).paymentId).toBeNull();
  });
});
