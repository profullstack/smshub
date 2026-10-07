import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import { createOrder, settlePayment, sweep, orderingStatus, OrderError, GRACE_DAYS } from "../service";
import { readWebhook } from "@/lib/coinpay/checkout";
import { MANAGED_TAG } from "@/lib/telnyx/numbers";

const USER = "user-1";
const EMAIL = "tester@example.com";

function baseEnv(mode: "off" | "test" | "live"): NodeJS.ProcessEnv {
  return {
    MANAGED_NUMBERS_MODE: mode,
    MANAGED_NUMBERS_TESTERS: EMAIL,
    TELNYX_TEST_NUMBERS: "+14085550001",
    TELNYX_API_KEY: "KEYtest",
    TELNYX_MESSAGING_PROFILE_ID: "profile-1",
    COINPAY_API_KEY: "cp_live_0123456789abcdef0123456789abcdef",
    COINPAY_BUSINESS_ID: "biz-1",
    COINPAY_WEBHOOK_SECRET: "whsec",
    MANAGED_NUMBER_PRICE_USD: "5",
  } as unknown as NodeJS.ProcessEnv;
}

/** Fake CoinPay + Telnyx. Records every call so tests can assert nothing was bought. */
function fakeFetch() {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let paymentSeq = 0;
  const numbers: Record<string, { id: string; phone_number: string; tags: string[] }> = {};
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.endsWith("/api/payments/create")) {
      paymentSeq++;
      return json({ success: true, payment: { id: `pay-${paymentSeq}`, payment_address: "0xabc" } }, 201);
    }
    if (url.includes("/available_phone_numbers")) return json({ data: [{ phone_number: "+16505550123" }] });
    if (url.endsWith("/number_orders") && method === "POST") {
      const n = body.phone_numbers[0].phone_number;
      numbers[n] = { id: `num-${n}`, phone_number: n, tags: [] };
      return json({ data: { id: "tn-order-1", phone_numbers: [{ phone_number: n }] } });
    }
    if (url.includes("/phone_numbers?")) {
      const n = new URL(url).searchParams.get("filter[phone_number]")!;
      return json({ data: numbers[n] ? [numbers[n]] : [] });
    }
    const m = /\/phone_numbers\/([^/?]+)$/.exec(url);
    if (m) {
      const rec = Object.values(numbers).find((x) => x.id === m[1]);
      if (method === "PATCH" && rec) rec.tags = body.tags;
      if (method === "DELETE" && rec) delete numbers[rec.phone_number];
      return json({ data: rec ?? null }, rec ? 200 : 404);
    }
    return json({ errors: [{ detail: `unexpected ${method} ${url}` }] }, 500);
  });
  return { impl: impl as unknown as typeof fetch, calls, numbers };
}

const settledEvent = (paymentId: string, status = "confirmed", orderId?: string) =>
  readWebhook({ id: `evt_${paymentId}_1`, type: "payment.confirmed", data: { payment_id: paymentId, status, metadata: orderId ? { order_id: orderId } : {} } });

describe("managed numbers", () => {
  let fdb: FakeDb;
  let db: SupabaseClient;

  beforeEach(() => {
    fdb = new FakeDb();
    db = fdb as unknown as SupabaseClient;
  });

  it("refuses to open a checkout while switched off, or for a non-tester in test mode", () => {
    expect(orderingStatus(EMAIL, baseEnv("off")).open).toBe(false);
    expect(orderingStatus("someone@else.com", baseEnv("test")).open).toBe(false);
    expect(orderingStatus(EMAIL, baseEnv("test")).open).toBe(true);
    expect(orderingStatus("anyone@x.com", baseEnv("live")).open).toBe(true);
    expect(orderingStatus(EMAIL, { ...baseEnv("live"), COINPAY_WEBHOOK_SECRET: "" }).open).toBe(false);
  });

  it("creates a pending order priced from our config with a CoinPay pay link", async () => {
    const f = fakeFetch();
    const order = await createOrder(
      { db, env: baseEnv("live"), fetchImpl: f.impl },
      { userId: USER, email: EMAIL, areaCode: "415", months: 3, chain: "bogus", siteUrl: "https://smshub.dev" }
    );
    expect(order.status).toBe("pending");
    expect(Number(order.amount_usd)).toBe(15);
    expect(order.chain).toBe("USDC_POL");
    expect(order.pay_url).toBe("https://coinpayportal.com/pay/pay-1");
    const create = f.calls.find((c) => c.url.endsWith("/payments/create"))!;
    expect(create.body).toMatchObject({ business_id: "biz-1", amount: 15, blockchain: "USDC_POL" });
    expect((create.body as { merchant_wallet_address?: string }).merchant_wallet_address).toBeUndefined();
  });

  it("live: provisions exactly once on a settled webhook, tags the number, and ignores replays", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    const order = await createOrder(deps, { userId: USER, email: EMAIL, months: 1, siteUrl: "https://smshub.dev" });

    expect(await settlePayment(deps, settledEvent("pay-1", "detected"))).toEqual({ settled: false, reason: "status detected" });
    const r1 = await settlePayment(deps, settledEvent("pay-1", "confirmed", order.id));
    expect(r1).toMatchObject({ settled: true, status: "active", number: "+16505550123" });
    const r2 = await settlePayment(deps, settledEvent("pay-1", "forwarded"));
    expect(r2).toMatchObject({ settled: true, status: "active" });

    expect(f.calls.filter((c) => c.url.endsWith("/number_orders")).length).toBe(1);
    expect(f.numbers["+16505550123"].tags).toEqual([MANAGED_TAG]);
    const rows = fdb.rows("phone_numbers");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ managed: true, status: "active", number: "+16505550123", user_id: USER });
  });

  it("rejects a webhook whose metadata names a different order", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "https://smshub.dev" });
    expect(await settlePayment(deps, settledEvent("pay-1", "confirmed", "other-order"))).toEqual({
      settled: false,
      reason: "order mismatch",
    });
    expect(await settlePayment(deps, settledEvent("pay-999"))).toEqual({ settled: false, reason: "unknown payment" });
  });

  it("test mode lends a pool number and never calls Telnyx to buy", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("test"), fetchImpl: f.impl };
    await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "https://smshub.dev" });
    const r = await settlePayment(deps, settledEvent("pay-1"));
    expect(r).toMatchObject({ status: "active", number: "+14085550001" });
    expect(f.calls.some((c) => c.url.includes("api.telnyx.com"))).toBe(false);

    // The only pool number is lent, so a second order waits (paid, with an error) instead of double-lending.
    await createOrder(deps, { userId: "user-2", email: EMAIL, siteUrl: "https://smshub.dev" });
    const r2 = await settlePayment(deps, settledEvent("pay-2"));
    expect(r2).toMatchObject({ status: "paid" });
    expect(fdb.rows("number_orders")[1].error).toMatch(/no test number is free/);
  });

  it("renewal extends from the current expiry", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    await createOrder(deps, { userId: USER, email: EMAIL, months: 1, siteUrl: "https://smshub.dev" });
    await settlePayment(deps, settledEvent("pay-1"));
    const pn = fdb.rows("phone_numbers")[0];
    const before = new Date(String(pn.expires_at));

    await expect(
      createOrder(deps, { userId: "intruder", email: EMAIL, kind: "renew", phoneNumberId: String(pn.id), siteUrl: "x" })
    ).rejects.toBeInstanceOf(OrderError);

    await createOrder(deps, { userId: USER, email: EMAIL, kind: "renew", phoneNumberId: String(pn.id), months: 2, siteUrl: "x" });
    await settlePayment(deps, settledEvent("pay-2"));
    const after = new Date(String(fdb.rows("phone_numbers")[0].expires_at));
    const expected = new Date(before);
    expected.setUTCMonth(expected.getUTCMonth() + 2);
    expect(after.toISOString()).toBe(expected.toISOString());
    expect(f.calls.filter((c) => c.url.endsWith("/number_orders")).length).toBe(1);
  });

  it("caps open rentals per user", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    for (let i = 0; i < 5; i++) await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" });
    await expect(createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" })).rejects.toThrow(/up to 5/);
  });

  it("sweep expires abandoned checkouts and releases lapsed numbers, only deleting tagged ones", async () => {
    const f = fakeFetch();
    const env = baseEnv("live");
    const deps = { db, env, fetchImpl: f.impl };
    await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" });
    await settlePayment(deps, settledEvent("pay-1"));
    await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" });
    fdb.rows("number_orders")[1].created_at = new Date(Date.now() - 25 * 3600_000).toISOString();

    // An untagged number we own (a support line, say) that somehow got a managed row.
    f.numbers["+18885550000"] = { id: "num-support", phone_number: "+18885550000", tags: [] };
    fdb.rows("phone_numbers").push({
      id: "pn-support",
      user_id: USER,
      number: "+18885550000",
      managed: true,
      status: "active",
      telnyx_number_id: "num-support",
      expires_at: new Date(0).toISOString(),
    });

    const later = new Date(Date.now() + (40 + GRACE_DAYS) * 86400_000);
    const report = await sweep({ ...deps, now: () => later });
    expect(report.expiredCheckouts).toBe(1);
    expect(report.released).toBe(1);
    expect(report.errors.join()).toMatch(/Refusing to release \+18885550000/);
    expect(f.numbers["+16505550123"]).toBeUndefined();
    expect(f.numbers["+18885550000"]).toBeDefined();
    expect(fdb.rows("phone_numbers").find((r) => r.id === "pn-support")!.status).toBe("active");
  });

  it("a payment that settles after its checkout expired is still honoured", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" });
    fdb.rows("number_orders")[0].status = "expired";
    expect(await settlePayment(deps, settledEvent("pay-1"))).toMatchObject({ status: "active" });
  });
});
