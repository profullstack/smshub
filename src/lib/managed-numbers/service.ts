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
  CHECKOUT_WINDOW_MINUTES,
  checkoutWindowOpen,
  coinpayConfig,
  createCheckoutSession,
  createPayment,
  createPaypalPayment,
  paymentMetadata,
  normalizeMethod,
  PAYPAL_METHOD,
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
import type { Credits } from "@profullstack/redeem-credits";
import { centsToUsd, CREDIT_UNIT, getCredits } from "@/lib/rewards";

/**
 * Store credit (from a redeemed code or an accepted invite) pays for an order
 * when the buyer picks this as the method. It goes through the same order row
 * and the same pending -> paid -> provision transition as a CoinPay payment.
 */
export const CREDIT_METHOD = "CREDIT" as const;

export function isCreditMethod(method: unknown): boolean {
  return String(method ?? "").trim().toUpperCase() === CREDIT_METHOD;
}

export const GRACE_DAYS = 3;
/**
 * A pending order stops counting as an open checkout when CoinPay's pay page
 * closes, CHECKOUT_WINDOW_MINUTES after it was made (we ask CoinPay for that same
 * window). Holding the row longer (it was 24 hours once) kept a dead "Waiting for
 * payment" link on /numbers and counted against the plan's open-checkout limit.
 * Marking it expired grants or forfeits nothing: settlePayment still honours a
 * late payment.
 */
export const PENDING_TTL_MINUTES = CHECKOUT_WINDOW_MINUTES;
export const MAX_PROVISION_ATTEMPTS = 5;
const MANAGED_PROVIDER_KEY = MANAGED_API_KEY;

export interface Deps {
  db: SupabaseClient;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Store credit; defaults to the app's (lib/rewards). */
  credits?: Credits;
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
  const payWithCredit = isCreditMethod(input.chain);
  const chain = normalizeMethod(input.chain);
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
  const amountCents = Math.round(amount * 100);
  const credits = payWithCredit ? deps.credits ?? getCredits() : null;
  if (credits) {
    const have = Math.max(0, Math.floor(await credits.balance(input.userId, CREDIT_UNIT)));
    if (have < amountCents) {
      throw new OrderError(
        `Not enough credit: you have $${centsToUsd(have).toFixed(2)} and this costs $${amount.toFixed(2)}.`,
        402
      );
    }
  }
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
      chain: payWithCredit ? CREDIT_METHOD : chain,
    })
    .select()
    .single();
  if (error || !order) throw new OrderError("Could not create the order", 500);

  if (credits) return payOrderWithCredit(deps, credits, order as NumberOrder, amountCents);

  try {
    const description = `smshub.dev: ${numberLabel}, ${months} month${months > 1 ? "s" : ""}`;
    const metadata = paymentMetadata({ orderId: order.id, userId: input.userId, kind, email: input.email });
    const backUrl = `${input.siteUrl}/numbers?order=${order.id}`;
    const cancelUrl = `${input.siteUrl}/numbers`;
    const session = await createCheckoutSession(
      cp,
      {
        amountUsd: amount,
        description,
        customerEmail: input.email,
        accountId: input.userId,
        metadata: { ...metadata, preferred_method: chain },
        successUrl: backUrl,
        cancelUrl,
        idempotencyKey: `smshub-session-${order.id}`,
      },
      deps.fetchImpl
    );
    const payment =
      session ??
      (chain === PAYPAL_METHOD
        ? await createPaypalPayment(
            cp,
            {
              amountUsd: amount,
              description,
              metadata,
              successUrl: backUrl,
              cancelUrl,
              invoiceNumber: `smshub-${order.id}`,
              customerEmail: input.email,
            },
            deps.fetchImpl
          )
        : await createPayment(
            cp,
            {
              amountUsd: amount,
              chain,
              description,
              metadata,
              redirectUrl: backUrl,
              cancelUrl,
              idempotencyKey: `smshub-order-${order.id}`,
            },
            deps.fetchImpl
          ));
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
  const metaOrder = typeof ev.metadata?.order_id === "string" ? ev.metadata.order_id : null;
  const metaUser = typeof ev.metadata?.user_id === "string" ? ev.metadata.user_id : null;
  let { data: order } = await db
    .from("number_orders")
    .select("*")
    .eq("coinpay_payment_id", ev.paymentId)
    .maybeSingle();
  if (!order && metaOrder && metaUser) {
    // A payment made inside a hosted checkout session (we stored the session id),
    // or one whose id we never wrote down: map it back by the metadata we sent.
    // The webhook is signed with our secret and only we create payments for this
    // business, so this metadata is ours.
    const { data: byMeta } = await db
      .from("number_orders")
      .select("*")
      .eq("id", metaOrder)
      .eq("user_id", metaUser)
      .maybeSingle();
    if (byMeta) {
      await db
        .from("number_orders")
        .update({ coinpay_payment_id: ev.paymentId, updated_at: new Date().toISOString() })
        .eq("id", byMeta.id)
        .in("status", ["pending", "expired"]);
      order = { ...byMeta, coinpay_payment_id: ev.paymentId };
    }
  }
  if (!order) return { settled: false, reason: "unknown payment" };
  if (metaOrder && metaOrder !== order.id) return { settled: false, reason: "order mismatch" };
  if (metaUser && metaUser !== order.user_id) return { settled: false, reason: "user mismatch" };

  const result = await claimAndProvision(deps, order.id);
  if (!result) return { settled: true, orderId: order.id, status: order.status, number: order.number };
  return { settled: true, orderId: order.id, status: result.status, number: result.number };
}

/**
 * The one transition that grants anything: pending (or expired) -> paid, then
 * provision. A late payment for a checkout we already expired is still
 * honoured. Null when the order was already claimed.
 */
async function claimAndProvision(
  deps: Deps,
  orderId: string
): Promise<{ status: NumberOrder["status"]; number: string | null } | null> {
  const now = (deps.now?.() ?? new Date()).toISOString();
  const { data: claimed } = await deps.db
    .from("number_orders")
    .update({ status: "paid", paid_at: now, updated_at: now })
    .eq("id", orderId)
    .in("status", ["pending", "expired"])
    .select()
    .maybeSingle();
  if (!claimed) return null;
  return provision(deps, claimed as NumberOrder);
}

/**
 * Pay a just-created order from store credit: spend it (a compare-and-swap in
 * the credit ledger, so parallel orders cannot overdraw), then the same claim +
 * provision a CoinPay webhook runs. If provisioning gives up for good, provision()
 * gives the credit back.
 */
async function payOrderWithCredit(
  deps: Deps,
  credits: Credits,
  order: NumberOrder,
  amountCents: number
): Promise<NumberOrder> {
  const { db } = deps;
  const spent = await credits.spend(order.user_id, CREDIT_UNIT, amountCents, `order:${order.id}`);
  if (!spent.ok) {
    await db
      .from("number_orders")
      .update({ status: "failed", error: "credit: not enough credit", updated_at: new Date().toISOString() })
      .eq("id", order.id);
    throw new OrderError(
      `Not enough credit: you have $${centsToUsd(spent.balance).toFixed(2)} and this costs $${centsToUsd(amountCents).toFixed(2)}.`,
      402
    );
  }
  await claimAndProvision(deps, order.id);
  const { data: after } = await db.from("number_orders").select("*").eq("id", order.id).maybeSingle();
  return (after ?? order) as NumberOrder;
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
    if (status === "failed" && isCreditMethod(order.chain)) {
      // Paid from credit and never delivered: the credit goes back.
      const cents = Math.round(Number(order.amount_usd) * 100);
      await (deps.credits ?? getCredits())
        .grant(order.user_id, { unit: CREDIT_UNIT, amount: cents }, `refund:order:${order.id}`)
        .catch((e) => console.error(`[managed-numbers] credit refund for order ${order.id} failed`, e));
    }
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

  const cutoff = new Date(now.getTime() - PENDING_TTL_MINUTES * 60_000).toISOString();
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

/**
 * Abandoned-checkout recovery: one click on /numbers or the inbox reopens an
 * expired (or window-closed) order as a fresh checkout with the same area code,
 * months and kind. The buyer may switch method (PayPal, another coin). If a
 * checkout is already open, that one comes back instead of a second.
 */
export async function reopenOrder(
  deps: Deps,
  input: { userId: string; email: string | null | undefined; orderId: string; chain?: unknown; siteUrl: string }
): Promise<NumberOrder> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const { data: old } = await db
    .from("number_orders")
    .select("*")
    .eq("id", input.orderId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!old) throw new OrderError("Order not found", 404);
  const o = old as NumberOrder;
  const windowClosed = !checkoutWindowOpen(o.created_at, now);
  const reopenable =
    o.status === "expired" ||
    (o.status === "pending" && windowClosed) ||
    (o.status === "failed" && String(o.error ?? "").startsWith("checkout:"));
  if (!reopenable) throw new OrderError("This order cannot be reopened", 409);

  const { data: open } = await db
    .from("number_orders")
    .select("*")
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  const live = ((open ?? []) as NumberOrder[]).find((x) => x.pay_url && checkoutWindowOpen(x.created_at, now));
  if (live) return live;

  if (o.status === "pending") {
    await db.from("number_orders").update({ status: "expired", updated_at: now.toISOString() }).eq("id", o.id).eq("status", "pending");
  }
  return createOrder(deps, {
    userId: input.userId,
    email: input.email,
    kind: o.kind,
    phoneNumberId: o.phone_number_id,
    areaCode: o.area_code ?? "",
    months: o.months,
    chain: input.chain ?? o.chain,
    siteUrl: input.siteUrl,
  });
}
