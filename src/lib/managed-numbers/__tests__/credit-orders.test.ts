import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Credits, memoryStore } from "@profullstack/redeem-credits";
import { FakeDb } from "@/__tests__/fake-db";
import { createOrder, OrderError, MAX_PROVISION_ATTEMPTS, sweep, CREDIT_METHOD } from "../service";
import { CREDIT_UNIT } from "@/lib/rewards";

const USER = "user-1";
const EMAIL = "tester@example.com";

function env(mode: "test" | "live" = "test"): NodeJS.ProcessEnv {
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

describe("paying for a rented number with store credit", () => {
  let fdb: FakeDb;
  let db: SupabaseClient;
  let credits: Credits;
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fdb = new FakeDb();
    db = fdb as unknown as SupabaseClient;
    credits = new Credits(memoryStore());
    fetchImpl = vi.fn(async () => new Response("{}", { status: 500 }));
  });

  const deps = () => ({ db, env: env(), credits, fetchImpl: fetchImpl as unknown as typeof fetch });

  it("refuses with 402 and opens no order when the credit does not cover it", async () => {
    await credits.grant(USER, { unit: CREDIT_UNIT, amount: 250 }, "invite:x:joined");
    const err = await createOrder(deps(), { userId: USER, email: EMAIL, chain: "credit", months: 1, siteUrl: "https://smshub.dev" }).catch((e) => e);
    expect(err).toBeInstanceOf(OrderError);
    expect((err as OrderError).status).toBe(402);
    expect((err as Error).message).toMatch(/\$2\.50 .* \$5\.00/);
    expect(fdb.rows("number_orders")).toHaveLength(0);
    expect(await credits.balance(USER, CREDIT_UNIT)).toBe(250);
  });

  it("spends the credit and provisions through the normal order path, with no CoinPay call", async () => {
    await credits.grant(USER, { unit: CREDIT_UNIT, amount: 1200 }, "code:crd_1");
    const order = await createOrder(deps(), { userId: USER, email: EMAIL, chain: "CREDIT", months: 2, siteUrl: "https://smshub.dev" });
    expect(order).toMatchObject({ status: "active", chain: CREDIT_METHOD, number: "+14085550001" });
    expect(order.pay_url ?? null).toBeNull();
    expect(Number(order.amount_usd)).toBe(10);
    expect(order.paid_at).toBeTruthy();
    expect(await credits.balance(USER, CREDIT_UNIT)).toBe(200);
    expect(fetchImpl).not.toHaveBeenCalled();
    const pn = fdb.rows("phone_numbers")[0];
    expect(pn).toMatchObject({ user_id: USER, managed: true, status: "active" });
    const history = await credits.history(USER, CREDIT_UNIT);
    expect(history.at(-1)).toMatchObject({ kind: "spend", amount: 1000, source: `order:${order.id}` });
  });

  it("renews a rented number from credit, extending its expiry", async () => {
    await credits.grant(USER, { unit: CREDIT_UNIT, amount: 1000 }, "code:crd_1");
    await createOrder(deps(), { userId: USER, email: EMAIL, chain: "CREDIT", months: 1, siteUrl: "x" });
    const pn = fdb.rows("phone_numbers")[0];
    const before = new Date(String(pn.expires_at));
    const renew = await createOrder(deps(), { userId: USER, email: EMAIL, kind: "renew", phoneNumberId: String(pn.id), chain: "CREDIT", months: 1, siteUrl: "x" });
    expect(renew.status).toBe("active");
    const expected = new Date(before);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(String(fdb.rows("phone_numbers")[0].expires_at)).toBe(expected.toISOString());
    expect(await credits.balance(USER, CREDIT_UNIT)).toBe(0);
  });

  it("gives the credit back when provisioning gives up for good", async () => {
    // The one pool number is already lent to someone else, so provisioning keeps failing.
    fdb.rows("phone_numbers").push({ id: "other", user_id: "u2", number: "+14085550001", status: "active", managed: true });
    await credits.grant(USER, { unit: CREDIT_UNIT, amount: 500 }, "code:crd_1");
    const order = await createOrder(deps(), { userId: USER, email: EMAIL, chain: "CREDIT", siteUrl: "x" });
    expect(order.status).toBe("paid");
    expect(await credits.balance(USER, CREDIT_UNIT)).toBe(0);
    for (let i = 1; i < MAX_PROVISION_ATTEMPTS; i++) await sweep(deps());
    expect(fdb.rows("number_orders")[0].status).toBe("failed");
    expect(await credits.balance(USER, CREDIT_UNIT)).toBe(500);
    await sweep(deps());
    expect(await credits.balance(USER, CREDIT_UNIT)).toBe(500);
  });
});
