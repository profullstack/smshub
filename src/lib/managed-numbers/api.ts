/**
 * The read side shared by the web app, the v1 API, the MCP server and the CLI:
 * what a user has rented, what it costs, and what texts have arrived.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHECKOUT_CHAINS, DEFAULT_CHAIN } from "@/lib/coinpay/checkout";
import { getPlanUsage, priceUsdPerMonth } from "@/lib/plans";
import { GRACE_DAYS, orderingStatus } from "./service";

/**
 * Pull a one-time code out of a text. Prefers a number next to a word like
 * "code", then any 4-8 digit run (also "123-456" / "123 456"). Null if none.
 */
export function extractOtp(body: string | null | undefined): string | null {
  if (!body) return null;
  const text = String(body);
  const near =
    /(?:code|otp|pin|passcode|verification|verify|token|código|код)[^0-9]{0,24}(\d{3}[- ]?\d{3}|\d{4,8})/i.exec(text) ||
    /(\d{3}[- ]?\d{3}|\d{4,8})[^0-9]{0,24}(?:is your|is the|est votre|es tu)/i.exec(text);
  const raw = near?.[1] ?? /(?<![\d.,:/])(\d{3}[- ]\d{3}|\d{4,8})(?![\d.,:/])/.exec(text)?.[1];
  return raw ? raw.replace(/[- ]/g, "") : null;
}

export interface NumberSummary {
  id: string;
  number: string;
  friendly_name: string | null;
  managed: boolean;
  status: string;
  expires_at: string | null;
  release_at: string | null;
  created_at: string;
}

export async function listNumbers(db: SupabaseClient, userId: string): Promise<NumberSummary[]> {
  const { data, error } = await db
    .from("phone_numbers")
    .select("id, number, friendly_name, managed, status, expires_at, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((n) => ({
    ...n,
    release_at: n.managed && n.expires_at
      ? new Date(new Date(n.expires_at).getTime() + GRACE_DAYS * 86400_000).toISOString()
      : null,
  }));
}

export async function listOrders(db: SupabaseClient, userId: string, limit = 20) {
  const { data, error } = await db
    .from("number_orders")
    .select("id, kind, phone_number_id, area_code, months, amount_usd, chain, status, pay_url, number, error, paid_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getOrder(db: SupabaseClient, userId: string, id: string) {
  const { data } = await db
    .from("number_orders")
    .select("id, kind, phone_number_id, area_code, months, amount_usd, chain, status, pay_url, number, error, paid_at, created_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function overview(db: SupabaseClient, userId: string, email: string | null) {
  const [plan, numbers, orders] = await Promise.all([
    getPlanUsage(db, userId),
    listNumbers(db, userId),
    listOrders(db, userId),
  ]);
  return {
    ordering: orderingStatus(email),
    pricing: { usd_per_month: priceUsdPerMonth(), chains: CHECKOUT_CHAINS, default_chain: DEFAULT_CHAIN, grace_days: GRACE_DAYS },
    plan,
    numbers,
    orders,
  };
}

export interface InboundText {
  id: string;
  from: string | null;
  body: string;
  otp: string | null;
  received_at: string;
}

/** Texts received on one of the user's numbers, newest first. */
export async function numberMessages(
  db: SupabaseClient,
  userId: string,
  numberId: string,
  opts: { since?: string | null; limit?: number } = {}
): Promise<InboundText[] | null> {
  const { data: pn } = await db
    .from("phone_numbers")
    .select("id")
    .eq("id", numberId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!pn) return null;
  const { data: convos } = await db
    .from("conversations")
    .select("id, contacts(phone)")
    .eq("user_id", userId)
    .eq("phone_number_id", numberId);
  const fromBy = new Map<string, string | null>();
  for (const c of (convos ?? []) as { id: string; contacts: { phone?: string } | { phone?: string }[] | null }[]) {
    const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
    fromBy.set(c.id, contact?.phone ?? null);
  }
  if (fromBy.size === 0) return [];
  let q = db
    .from("messages")
    .select("id, conversation_id, body, created_at")
    .in("conversation_id", [...fromBy.keys()])
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, opts.limit ?? 20)));
  if (opts.since) q = q.gt("created_at", opts.since);
  const { data: msgs, error } = await q;
  if (error) throw error;
  return (msgs ?? []).map((m) => ({
    id: m.id,
    from: fromBy.get(m.conversation_id) ?? null,
    body: m.body,
    otp: extractOtp(m.body),
    received_at: m.created_at,
  }));
}
