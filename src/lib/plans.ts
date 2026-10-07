/**
 * Plans and their limits. There is no separate subscription: renting a managed
 * number is what makes an account Pro, for as long as one is active.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanId = "free" | "pro";

export interface PlanLimits {
  /** Managed numbers rented at once (active plus checkouts still open). */
  managedNumbers: number;
  /** Bring-your-own numbers. */
  byoNumbers: number;
  apiKeys: number;
  webhooks: number;
  aiReplies: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { managedNumbers: 5, byoNumbers: 3, apiKeys: 2, webhooks: 1, aiReplies: false },
  pro: { managedNumbers: 5, byoNumbers: 25, apiKeys: 10, webhooks: 10, aiReplies: true },
};

export function priceUsdPerMonth(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.MANAGED_NUMBER_PRICE_USD);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 5;
}

export function orderAmountUsd(months: number, env: NodeJS.ProcessEnv = process.env): number {
  return Math.round(priceUsdPerMonth(env) * months * 100) / 100;
}

export interface PlanUsage {
  plan: PlanId;
  limits: PlanLimits;
  usage: { managedNumbers: number; openOrders: number; byoNumbers: number; apiKeys: number; webhooks: number };
}

async function count(
  q: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
}

export async function getPlanUsage(db: SupabaseClient, userId: string): Promise<PlanUsage> {
  const now = new Date().toISOString();
  const head = { count: "exact" as const, head: true };
  const [managedNumbers, openOrders, byoNumbers, apiKeys, webhooks] = await Promise.all([
    count(
      db.from("phone_numbers").select("id", head).eq("user_id", userId).eq("managed", true).eq("status", "active").gt("expires_at", now)
    ),
    count(
      db
        .from("number_orders")
        .select("id", head)
        .eq("user_id", userId)
        .eq("kind", "new")
        .in("status", ["pending", "paid"])
    ),
    count(db.from("phone_numbers").select("id", head).eq("user_id", userId).eq("managed", false).eq("status", "active")),
    count(db.from("api_keys").select("id", head).eq("user_id", userId)),
    count(db.from("user_webhooks").select("id", head).eq("user_id", userId)),
  ]);
  const plan: PlanId = managedNumbers > 0 ? "pro" : "free";
  return { plan, limits: PLANS[plan], usage: { managedNumbers, openOrders, byoNumbers, apiKeys, webhooks } };
}

export type LimitKey = "byoNumbers" | "apiKeys" | "webhooks";

/** Null when allowed, else a message for a 402/403 answer. */
export function limitReached(p: PlanUsage, key: LimitKey): string | null {
  if (p.usage[key] < p.limits[key]) return null;
  const what = { byoNumbers: "phone numbers", apiKeys: "API keys", webhooks: "webhooks" }[key];
  return p.plan === "free"
    ? `The free plan allows ${p.limits[key]} ${what}. Rent a number to unlock Pro limits.`
    : `Your plan allows ${p.limits[key]} ${what}.`;
}
