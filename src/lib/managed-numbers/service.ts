/**
 * Managed numbers, end to end:
 *
 *   createOrder   -> a number_orders row (pending) + a CoinPay checkout
 *   settlePayment -> CoinPay webhook: pending -> paid, exactly once, then provision
 *   provision     -> rent (or lend, in test mode) a Telnyx number, or extend one
 *   sweep         -> retry stuck provisioning, expire abandoned checkouts,
 *                    release numbers whose rental (plus grace) has run out
 *
 * Money is only ever acted on in the webhook, and how much was bought is read
 * from our own order row, never from the payload.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  coinpayConfig,
  createPayment,
  normalizeChain,
  type CoinPayConfig,
  type WebhookEvent,
} from "@/lib/coinpay/checkout";
import {
  cleanAreaCode,
  findAvailableNumber,
  lookupNumberId,
  managedMode,
  purchaseNumber,
  releaseNumber,
  telnyxConfig,
  testNumberPool,
  type ManagedMode,
  type TelnyxConfig,
} from "@/lib/telnyx/numbers";
import { getPlanUsage, orderAmountUsd } from "@/lib/plans";
import { MANAGED_API_KEY } from "@/lib/providers";

export const GRACE_DAYS = 3;
export const PENDING_TTL_HOURS = 24;
export const MAX_PROVISION_ATTEMPTS = 5;
const MANAGED_PROVIDER_KEY = MANAGED_API_KEY;

export interface Deps {
  db: SupabaseClient;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface NumberOrder {
  id: string;
  user_id: string;
  kind: "new" | "renew";
  phone_number_id: string | null;
  country: string;
  area_code: string | null;
  months: number;
  amount_usd: number | string;
  chain: string;
  status: "pending" | "paid" | "active" | "failed" | "expired";
  coinpay_payment_id: string | null;
  pay_url: string | null;
  telnyx_order_id: string | null;
  number: string | null;
  error: string | null;
  attempts: number;
  paid_at: string | null;
  created_at: string;
}

export class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function testers(env: NodeJS.ProcessEnv = process.env): string[] {
  return String(env.MANAGED_NUMBERS_TESTERS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether this user may open a checkout right now, and if not, why. */
export function orderingStatus(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): { open: boolean; mode: ManagedMode; reason?: string } {
  const mode = managedMode(env);
  if (!coinpayConfig(env) || !telnyxConfig(env)) {
    return { open: false, mode, reason: "Managed numbers are not configured yet." };
  }
  if (mode === "off") return { open: false, mode, reason: "Managed numbers open soon." };
  if (mode === "test" && !testers(env).includes(String(email || "").toLowerCase())) {
    return { open: false, mode, reason: "Managed numbers are in a private test. Join the waitlist." };
  }
  return { open: true, mode };
}

function clampMonths(m: unknown): number {
  const n = Math.floor(Number(m));
  return Number.isFinite(n) ? Math.min(12, Math.max(1, n)) : 1;
}

export async function createOrder(
  deps: Deps,
  input: {
    userId: string;
    email: string | null | undefined;
    kind?: "new" | "renew";
    phoneNumberId?: string | null;
    areaCode?: unknown;
    months?: unknown;
    chain?: unknown;
    siteUrl: string;
  }
): Promise<NumberOrder> {
  const env = deps.env ?? process.env;
  const gate = orderingStatus(input.email, env);
  if (!gate.open) throw new OrderError(gate.reason || "Not open", 403);
  const cp = coinpayConfig(env) as CoinPayConfig;
  const kind = input.kind ?? "new";
  const months = clampMonths(input.months);
  const chain = normalizeChain(input.chain);
  const areaCode = cleanAreaCode(input.areaCode);
  const { db } = deps;

  let numberLabel = areaCode ? `a ${areaCode} number` : "a US number";
  if (kind === "renew") {
    const { data: pn } = await db
      .from("phone_numbers")
      .select("id, number, managed, status")
      .eq("id", input.phoneNumberId ?? "")
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!pn || !pn.managed || pn.status !== "active") throw new OrderError("Number not found", 404);
    numberLabel = pn.number;
  } else {
    const plan = await getPlanUsage(db, input.userId);
    if (plan.usage.managedNumbers + plan.usage.openOrders >= plan.limits.managedNumbers) {
      throw new OrderError(
        `You can rent up to ${plan.limits.managedNumbers} numbers at once (open checkouts count).`,
        403
      );
    }
  }

  const amount = orderAmountUsd(months, env);
  const { data: order, error } = await db
    .from("number_orders")
    .insert({
      user_id: input.userId,
      kind,
      phone_number_id: kind === "renew" ? input.phoneNumberId : null,
      country: "US",
      area_code: areaCode,
      months,
      amount_usd: amount,
      chain,
    })
    .select()
    .single();
  if (error || !order) throw new OrderError("Could not create the order", 500);

  try {
    const payment = await createPayment(
      cp,
      {
        amountUsd: amount,
        chain,
        description: `smshub.dev: ${numberLabel}, ${months} month${months > 1 ? "s" : ""}`,
        metadata: { order_id: order.id, user_id: input.userId, kind },
        redirectUrl: `${input.siteUrl}/numbers?order=${order.id}`,
        idempotencyKey: `smshub-order-${order.id}`,
      },
      deps.fetchImpl
    );
    const { data: updated } = await db
      .from("number_orders")
      .update({ coinpay_payment_id: payment.id, pay_url: payment.payUrl, updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .select()
      .single();
    return (updated ?? { ...order, coinpay_payment_id: payment.id, pay_url: payment.payUrl }) as NumberOrder;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("number_orders").update({ status: "failed", error: `checkout: ${msg}` }).eq("id", order.id);
    throw new OrderError(`CoinPay checkout failed: ${msg}`, 502);
  }
}

export type SettleResult =
  | { settled: false; reason: string }
  | { settled: true; orderId: string; status: NumberOrder["status"]; number?: string | null };

/** Apply a verified CoinPay webhook. Safe to call any number of times. */
export async function settlePayment(deps: Deps, ev: WebhookEvent): Promise<SettleResult> {
  if (!ev.paymentId) return { settled: false, reason: "no payment id" };
  if (!ev.settled) return { settled: false, reason: `status ${ev.status || "unknown"}` };
  const { db } = deps;
  const { data: order } = await db
    .from("number_orders")
    .select("*")
    .eq("coinpay_payment_id", ev.paymentId)
    .maybeSingle();
  if (!order) return { settled: false, reason: "unknown payment" };
  const metaOrder = ev.metadata?.order_id;
  if (metaOrder && metaOrder !== order.id) return { settled: false, reason: "order mismatch" };

  // The one transition that grants anything. A late payment for a checkout we
  // already expired is still honoured.
  const now = (deps.now?.() ?? new Date()).toISOString();
  const { data: claimed } = await db
    .from("number_orders")
    .update({ status: "paid", paid_at: now, updated_at: now })
    .eq("id", order.id)
    .in("status", ["pending", "expired"])
    .select()
    .maybeSingle();
  if (!claimed) {
    return { settled: true, orderId: order.id, status: order.status, number: order.number };
  }
  const result = await provision(deps, claimed as NumberOrder);
  return { settled: true, orderId: order.id, status: result.status, number: result.number };
}

async function managedProviderId(db: SupabaseClient, userId: string): Promise<string> {
  const { data: existing } = await db
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "telnyx")
    .eq("api_key", MANAGED_PROVIDER_KEY)
    .limit(1);
  if (existing?.[0]?.id) return existing[0].id;
  const { data, error } = await db
    .from("providers")
    .insert({ user_id: userId, type: "telnyx", api_key: MANAGED_PROVIDER_KEY, metadata: { managed: true } })
    .select("id")
    .single();
  if (error || !data) throw new Error("could not create the managed provider row");
  return data.id;
}

export function isManagedProvider(p: { api_key?: string | null; metadata?: unknown } | null | undefined): boolean {
  return Boolean(
    p && (p.api_key === MANAGED_PROVIDER_KEY || (p.metadata as { managed?: boolean } | null)?.managed)
  );
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Turn a paid order into a working number. Records progress so a retry never buys twice. */
export async function provision(
  deps: Deps,
  order: NumberOrder
): Promise<{ status: NumberOrder["status"]; number: string | null }> {
  const env = deps.env ?? process.env;
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const fail = async (msg: string) => {
    const attempts = (order.attempts ?? 0) + 1;
    const status = attempts >= MAX_PROVISION_ATTEMPTS ? "failed" : "paid";
    await db
      .from("number_orders")
      .update({ status, error: msg, attempts, updated_at: now.toISOString() })
      .eq("id", order.id);
    console.error(`[managed-numbers] order ${order.id} attempt ${attempts}: ${msg}`);
    return { status: status as NumberOrder["status"], number: order.number };
  };

  try {
    if (order.kind === "renew") {
      const { data: pn } = await db
        .from("phone_numbers")
        .select("id, number, expires_at, status")
        .eq("id", order.phone_number_id ?? "")
        .maybeSingle();
      if (!pn || pn.status !== "active") return await fail("the number was already released");
      const base = pn.expires_at && new Date(pn.expires_at) > now ? new Date(pn.expires_at) : now;
      await db
        .from("phone_numbers")
        .update({ expires_at: addMonths(base, order.months).toISOString() })
        .eq("id", pn.id);
      await db
        .from("number_orders")
        .update({ status: "active", number: pn.number, error: null, updated_at: now.toISOString() })
        .eq("id", order.id);
      return { status: "active", number: pn.number };
    }

    const mode = managedMode(env);
    const tcfg = telnyxConfig(env) as TelnyxConfig;
    let number = order.number;
    let numberId: string | null = null;

    if (!number) {
      if (mode === "live") {
        const candidate = await findAvailableNumber(
          tcfg,
          { country: order.country || "US", areaCode: order.area_code },
          deps.fetchImpl
        );
        const bought = await purchaseNumber(tcfg, candidate, `smshub:${order.id}`, deps.fetchImpl);
        number = bought.number;
        numberId = bought.numberId;
        // Write it down before anything else can fail, so a retry reuses it.
        await db
          .from("number_orders")
          .update({ number, telnyx_order_id: bought.orderId, updated_at: now.toISOString() })
          .eq("id", order.id);
      } else if (mode === "test") {
        const { data: taken } = await db
          .from("phone_numbers")
          .select("number")
          .in("number", testNumberPool(env))
          .eq("status", "active");
        const busy = new Set((taken ?? []).map((t: { number: string }) => t.number));
        number = testNumberPool(env).find((n) => !busy.has(n)) ?? null;
        if (!number) return await fail("no test number is free (TELNYX_TEST_NUMBERS all lent)");
        await db.from("number_orders").update({ number }).eq("id", order.id);
      } else {
        return await fail("managed numbers are switched off");
      }
    }

    if (!numberId && mode === "live") {
      numberId = await lookupNumberId(tcfg, number, deps.fetchImpl).catch(() => null);
    }

    // A just-bought number cannot belong to anyone, so any hand-typed claim on it
    // (a bring-your-own row someone added) is stale and gives way.
    if (mode === "live") {
      await db
        .from("phone_numbers")
        .update({ status: "released", released_at: now.toISOString() })
        .eq("number", number)
        .eq("managed", false)
        .eq("status", "active");
    }

    const providerId = await managedProviderId(db, order.user_id);
    const { data: pn, error } = await db
      .from("phone_numbers")
      .insert({
        user_id: order.user_id,
        provider_id: providerId,
        number,
        friendly_name: `Rented ${number}`,
        managed: true,
        status: "active",
        expires_at: addMonths(now, order.months).toISOString(),
        telnyx_number_id: mode === "live" ? numberId : null,
      })
      .select("id")
      .single();
    if (error || !pn) return await fail(`could not save the number: ${error?.message ?? "unknown"}`);

    await db
      .from("number_orders")
      .update({ status: "active", phone_number_id: pn.id, number, error: null, updated_at: now.toISOString() })
      .eq("id", order.id);
    return { status: "active", number };
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
}

export interface SweepReport {
  retried: number;
  expiredCheckouts: number;
  released: number;
  errors: string[];
}

export async function sweep(deps: Deps): Promise<SweepReport> {
  const env = deps.env ?? process.env;
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const report: SweepReport = { retried: 0, expiredCheckouts: 0, released: 0, errors: [] };

  const { data: stuck } = await db
    .from("number_orders")
    .select("*")
    .eq("status", "paid")
    .lt("attempts", MAX_PROVISION_ATTEMPTS)
    .limit(20);
  for (const o of (stuck ?? []) as NumberOrder[]) {
    report.retried++;
    const r = await provision(deps, o);
    if (r.status !== "active") report.errors.push(`order ${o.id} still ${r.status}`);
  }

  const cutoff = new Date(now.getTime() - PENDING_TTL_HOURS * 3600_000).toISOString();
  const { data: expired } = await db
    .from("number_orders")
    .update({ status: "expired", updated_at: now.toISOString() })
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");
  report.expiredCheckouts = expired?.length ?? 0;

  const releaseBefore = new Date(now.getTime() - GRACE_DAYS * 86400_000).toISOString();
  const { data: due } = await db
    .from("phone_numbers")
    .select("id, number, telnyx_number_id")
    .eq("managed", true)
    .eq("status", "active")
    .lt("expires_at", releaseBefore)
    .limit(50);
  const tcfg = telnyxConfig(env);
  for (const n of due ?? []) {
    try {
      // Only numbers we bought have an id; test-pool numbers are lent, never given back.
      if (n.telnyx_number_id && tcfg && managedMode(env) === "live") {
        await releaseNumber(tcfg, n.telnyx_number_id, deps.fetchImpl);
      }
      await db
        .from("phone_numbers")
        .update({ status: "released", released_at: now.toISOString() })
        .eq("id", n.id);
      report.released++;
    } catch (e) {
      report.errors.push(`release ${n.number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return report;
}
