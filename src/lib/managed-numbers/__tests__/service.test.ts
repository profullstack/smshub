import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import { createOrder, settlePayment, sweep, orderingStatus, OrderError, GRACE_DAYS, reopenOrder } from "../service";
import { readWebhook, resetSessionsProbe } from "@/lib/coinpay/checkout";
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
    COINPAY_API_KEY: "cp_live_" + "0".repeat(32),
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
    if (url.endsWith("/api/paypal/payments/create")) {
      paymentSeq++;
      return json({ transaction_id: `pp-${paymentSeq}`, hosted_checkout_url: "https://evil.example/x" }, 200);
    }
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
    resetSessionsProbe();
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
    expect(create.body).toMatchObject({ business_id: "biz-1", amount: 15, blockchain: "USDC_POL", expires_in_minutes: 60 });
    expect((create.body as { merchant_wallet_address?: string }).merchant_wallet_address).toBeUndefined();
  });

  it("opens a PayPal order through CoinPay when the buyer picks PayPal, and settles on its webhook", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    const order = await createOrder(deps, {
      userId: USER, email: EMAIL, months: 1, chain: "paypal", siteUrl: "https://smshub.dev",
    });
    expect(order.chain).toBe("PAYPAL");
    expect(order.coinpay_payment_id).toBe("pp-1");
    // Built from our config, never the URL in the response.
    expect(order.pay_url).toBe("https://coinpayportal.com/pay/paypal/pp-1");
    const create = f.calls.find((c) => c.url.endsWith("/paypal/payments/create"))!;
    expect(create.body).toMatchObject({
      business_id: "biz-1",
      amount: 5,
      currency: "USD",
      invoiceNumber: `smshub-${order.id}`,
      success_url: `https://smshub.dev/numbers?order=${order.id}`,
      cancel_url: "https://smshub.dev/numbers",
    });
    expect(f.calls.some((c) => c.url.endsWith("/api/payments/create"))).toBe(false);

    // CoinPay's PayPal capture webhook: payment_id is the PayPal transaction id, status completed.
    const r = await settlePayment(deps, settledEvent("pp-1", "completed"));
    expect(r).toMatchObject({ settled: true, status: "active" });
  });

  it("sends the Back-to-smshub link with a crypto checkout", async () => {
    const f = fakeFetch();
    await createOrder({ db, env: baseEnv("live"), fetchImpl: f.impl }, { userId: USER, email: EMAIL, siteUrl: "https://smshub.dev" });
    const create = f.calls.find((c) => c.url.endsWith("/api/payments/create"))!;
    expect(create.body).toMatchObject({ cancel_url: "https://smshub.dev/numbers" });
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
    expect(f.calls.some((c) => new URL(c.url).host === "api.telnyx.com")).toBe(false);

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

  it("sweep frees an abandoned checkout within the hour, not after a day", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" });
    await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" });
    const [old, fresh] = fdb.rows("number_orders");
    old.created_at = new Date(Date.now() - 61 * 60_000).toISOString();
    fresh.created_at = new Date(Date.now() - 10 * 60_000).toISOString();
    const report = await sweep({ ...deps, now: () => new Date() });
    expect(report.expiredCheckouts).toBe(1);
    expect(old.status).toBe("expired");
    expect(fresh.status).toBe("pending");
  });

  it("a payment that settles after its checkout expired is still honoured", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" });
    fdb.rows("number_orders")[0].status = "expired";
    expect(await settlePayment(deps, settledEvent("pay-1"))).toMatchObject({ status: "active" });
  });

  it("tags every crypto and PayPal payment with property, user, order and email", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    const a = await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "https://smshub.dev" });
    const b = await createOrder(deps, { userId: USER, email: EMAIL, chain: "PAYPAL", siteUrl: "https://smshub.dev" });
    const crypto = f.calls.find((c) => c.url.endsWith("/api/payments/create"))!.body as Record<string, unknown>;
    expect(crypto.metadata).toEqual({
      property: "smshub.dev", order_id: a.id, user_id: USER, kind: "new", email: EMAIL, customer_email: EMAIL,
    });
    expect(crypto.expires_in_minutes).toBe(60);
    const pp = f.calls.find((c) => c.url.endsWith("/paypal/payments/create"))!.body as Record<string, unknown>;
    expect(pp.customer_email).toBe(EMAIL);
    expect(pp.metadata).toMatchObject({ property: "smshub.dev", order_id: b.id, user_id: USER, email: EMAIL });
  });

  it("prefers a CoinPay hosted checkout session when CoinPay has one, and settles it by metadata", async () => {
    const f = fakeFetch();
    const inner = f.impl;
    const sessionCalls: Record<string, unknown>[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/checkout/sessions")) {
        sessionCalls.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ id: "cs_1", url: "https://coinpayportal.com/checkout/cs_1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return inner(input, init);
    }) as unknown as typeof fetch;
    const deps = { db, env: baseEnv("live"), fetchImpl: impl };
    const order = await createOrder(deps, { userId: USER, email: EMAIL, chain: "DOGE", siteUrl: "https://smshub.dev" });
    expect(order.pay_url).toBe("https://coinpayportal.com/checkout/cs_1");
    expect(order.coinpay_payment_id).toBe("cs_1");
    expect(sessionCalls[0]).toMatchObject({
      amount: 5, currency: "USD", customer_email: EMAIL, account_id: USER, property: "smshub.dev",
      expires_in_minutes: 60, cancel_url: "https://smshub.dev/numbers",
    });
    expect(f.calls.some((c) => c.url.endsWith("/api/payments/create"))).toBe(false);

    // The payment made inside the session has its own id: mapped back by metadata.
    const ev = readWebhook({
      data: { payment_id: "pay-real", status: "confirmed", metadata: { order_id: order.id, user_id: USER } },
    });
    expect(await settlePayment(deps, ev)).toMatchObject({ settled: true, status: "active" });
    expect(fdb.rows("number_orders")[0].coinpay_payment_id).toBe("pay-real");
    // A forged user in otherwise valid metadata is refused.
    const o2 = await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" });
    const bad = readWebhook({ data: { payment_id: "pay-x", status: "confirmed", metadata: { order_id: o2.id, user_id: "someone" } } });
    expect(await settlePayment(deps, bad)).toMatchObject({ settled: false });
  });

  it("falls back to the direct checkout when CoinPay has no sessions endpoint, and stops asking", async () => {
    const f = fakeFetch(); // answers the sessions URL with a non-JSON 500, like CoinPay's HTML 404 page
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    const order = await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" });
    expect(order.coinpay_payment_id).toBe("pay-1");
    await createOrder(deps, { userId: USER, email: EMAIL, siteUrl: "x" });
    expect(f.calls.filter((c) => c.url.endsWith("/checkout/sessions")).length).toBe(1);
  });

  it("reopens an expired order in one click with the same terms, optionally on PayPal", async () => {
    const f = fakeFetch();
    const deps = { db, env: baseEnv("live"), fetchImpl: f.impl };
    const old = await createOrder(deps, { userId: USER, email: EMAIL, areaCode: "415", months: 3, chain: "BTC", siteUrl: "x" });
    const row = fdb.rows("number_orders")[0];
    row.created_at = new Date(Date.now() - 61 * 60_000).toISOString();
    // Still "pending" but its window closed: reopenable, and marked expired.
    const fresh = await reopenOrder(deps, { userId: USER, email: EMAIL, orderId: old.id, chain: "PAYPAL", siteUrl: "x" });
    expect(fresh.id).not.toBe(old.id);
    expect(fresh).toMatchObject({ area_code: "415", months: 3, chain: "PAYPAL", status: "pending" });
    expect(row.status).toBe("expired");
    // A second click while that checkout is open returns it instead of another.
    const again = await reopenOrder(deps, { userId: USER, email: EMAIL, orderId: old.id, siteUrl: "x" });
    expect(again.id).toBe(fresh.id);
    // Someone else's order, or a paid one, cannot be reopened.
    await expect(reopenOrder(deps, { userId: "other", email: EMAIL, orderId: old.id, siteUrl: "x" })).rejects.toThrow(OrderError);
    row.status = "active";
    await expect(reopenOrder(deps, { userId: USER, email: EMAIL, orderId: old.id, siteUrl: "x" })).rejects.toThrow(/cannot be reopened/);
  });
});
