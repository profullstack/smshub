import { describe, it, expect } from "vitest";
import {
  coinpayConfig,
  normalizeChain,
  readWebhook,
  signWebhookBody,
  verifyWebhookSignature,
  CHECKOUT_CHAINS,
  FALLBACK_CHAINS,
  availableChains,
  methodsFor,
  paymentMetadata,
  resetChainsCache,
} from "../checkout";

describe("coinpay checkout", () => {
  it("only accepts a merchant key, never an OAuth client id", () => {
    const base = { COINPAY_BUSINESS_ID: "b", COINPAY_WEBHOOK_SECRET: "s" };
    expect(coinpayConfig({ ...base, COINPAY_API_KEY: "cp_" + "a".repeat(24) } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(coinpayConfig({ ...base, COINPAY_X402_KEY: "cp_live_" + "0".repeat(20) } as unknown as NodeJS.ProcessEnv)).toBeNull();
    const cfg = coinpayConfig({ ...base, COINPAY_API_KEY: "cp_live_" + "0".repeat(20) } as unknown as NodeJS.ProcessEnv);
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

  it("knows every coin CoinPay takes and falls back to the default for anything else", () => {
    expect(normalizeChain("usdc_sol")).toBe("USDC_SOL");
    expect(normalizeChain("USDC_BASE")).toBe("USDC_BASE");
    expect(normalizeChain("doge")).toBe("DOGE");
    expect(normalizeChain("SHIB")).toBe("USDC_POL");
    for (const c of ["BTC", "BCH", "ETH", "POL", "SOL", "DOGE", "XRP", "ADA", "BNB", "USDT_TRON"]) {
      expect(CHECKOUT_CHAINS).toContain(c);
    }
    expect(FALLBACK_CHAINS).not.toContain("USDT_TRON");
  });

  it("offers what CoinPay reports active, PayPal second, and falls back when CoinPay cannot answer", async () => {
    resetChainsCache();
    const cfg = coinpayConfig({
      COINPAY_API_KEY: "cp_live_" + "0".repeat(20),
      COINPAY_BUSINESS_ID: "b",
      COINPAY_WEBHOOK_SECRET: "s",
    } as unknown as NodeJS.ProcessEnv)!;
    let calls = 0;
    const ok = (async (url: RequestInfo | URL) => {
      calls++;
      expect(String(url)).toBe("https://coinpayportal.com/api/supported-coins?active_only=true");
      return new Response(
        JSON.stringify({
          coins: [
            { symbol: "BTC", is_active: true },
            { symbol: "USDC_POL", is_active: true },
            { symbol: "DOGE", is_active: true },
            { symbol: "XRP", is_active: false },
            { symbol: "SHIB", is_active: true },
          ],
        })
      );
    }) as unknown as typeof fetch;
    const chains = await availableChains(cfg, ok, 1000);
    expect(chains).toEqual(["USDC_POL", "BTC", "DOGE"]);
    expect(methodsFor(chains)).toEqual(["USDC_POL", "PAYPAL", "BTC", "DOGE"]);
    await availableChains(cfg, ok, 2000);
    expect(calls).toBe(1); // cached

    resetChainsCache();
    const down = (async () => new Response("nope", { status: 502 })) as unknown as typeof fetch;
    expect(await availableChains(cfg, down)).toEqual([...FALLBACK_CHAINS]);
    resetChainsCache();
  });

  it("tags every payment with the property, user, order and email", () => {
    expect(paymentMetadata({ orderId: "o1", userId: "u1", kind: "new", email: " a@b.co " })).toEqual({
      property: "smshub.dev",
      order_id: "o1",
      user_id: "u1",
      kind: "new",
      email: "a@b.co",
      customer_email: "a@b.co",
    });
    expect(paymentMetadata({ orderId: "o1", userId: "u1", kind: "renew", email: null })).not.toHaveProperty("email");
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

describe("checkout window", () => {
  it("is the 60-minute window we ask CoinPay for", async () => {
    const { CHECKOUT_WINDOW_MINUTES, checkoutWindowOpen } = await import("../checkout");
    expect(CHECKOUT_WINDOW_MINUTES).toBe(60);
    const made = new Date("2026-10-17T11:09:49Z");
    expect(checkoutWindowOpen(made.toISOString(), new Date(made.getTime() + 59 * 60_000))).toBe(true);
    expect(checkoutWindowOpen(made.toISOString(), new Date(made.getTime() + 60 * 60_000))).toBe(false);
    expect(checkoutWindowOpen("not a date", made)).toBe(false);
  });
});
