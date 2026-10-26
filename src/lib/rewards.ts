/**
 * Credit codes and invites.
 *
 * - A credit code (@profullstack/redeem-credits) grants unit `usd_cents`: store
 *   credit that pays for a rented number. It is spent through the same order
 *   path as a CoinPay payment (see createOrder with chain "CREDIT" in
 *   lib/managed-numbers/service.ts), so a number paid with credit is an ordinary
 *   number_orders row that went pending -> paid -> active.
 * - Invites (@profullstack/affiliates): 3 per account. When a NEW account made
 *   through an invite confirms its email and has a valid signup profile, both
 *   people get INVITE_BONUS_CENTS of credit. Two accepted invites pay for a month.
 * - ?ref= links reuse @profullstack/referrals' `referral_code` cookie (set by
 *   trackReferralCode in middleware.ts); a code that belongs to the old referrals
 *   tables comes back external and is not recorded twice.
 *
 * Server only: both stores run on the service-role client.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Credits, supabaseStore as creditStore, type RedeemResult } from "@profullstack/redeem-credits";
import { Affiliates, supabaseStore as affStore, refFromRequest } from "@profullstack/affiliates";

export const CREDIT_UNIT = "usd_cents";
/** What an accepted invite gives each side: $2.50, so two accepted invites pay for a $5 month. */
export const INVITE_BONUS_CENTS = 250;
export const INVITE_QUOTA = 3;
export const INVITE_COOKIE = "smshub_invite";
export const INVITE_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
/** An invite only counts for an account this young: an old account opening an invite link gets nothing. */
export const INVITE_NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

// process.env[name] with a non-literal key: Next.js inlines process.env.LITERAL at build time.
function env(name: string): string {
  const key = String(name);
  return process.env[key] ?? "";
}

let serviceClient: SupabaseClient | undefined;
function client(): SupabaseClient {
  return (serviceClient ??= createClient(
    env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  ));
}

let credits: Credits | undefined;
let affiliates: Affiliates | undefined;

export function getCredits(): Credits {
  return (credits ??= new Credits(creditStore(client())));
}

export function getAffiliates(): Affiliates {
  return (affiliates ??= new Affiliates(affStore(client()), { defaultQuota: INVITE_QUOTA }));
}

/** Tests: swap in memory stores. */
export function setRewardsForTests(c: Credits | undefined, a: Affiliates | undefined): void {
  credits = c;
  affiliates = a;
}

export async function creditBalanceCents(userId: string, c: Credits = getCredits()): Promise<number> {
  return Math.max(0, Math.floor(await c.balance(userId, CREDIT_UNIT)));
}

export function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

const REDEEM_MESSAGES: Record<Exclude<RedeemResult, { ok: true }>["reason"], string> = {
  invalid: "That code is not valid. Check it and try again.",
  expired: "That code has expired.",
  used_up: "That code has already been used.",
  already_redeemed: "You already redeemed that code.",
  revoked: "That code is no longer valid.",
};

export type RedeemOutcome =
  | { ok: true; unit: string; amount: number; credit_usd: number; balance_usd: number }
  | { ok: false; reason: string; error: string };

/** Redeem a credit code for a user, with a message a person can read. */
export async function redeemCode(userId: string, code: unknown, c: Credits = getCredits()): Promise<RedeemOutcome> {
  const raw = String(code ?? "").trim();
  if (!raw || raw.length > 64) return { ok: false, reason: "invalid", error: REDEEM_MESSAGES.invalid };
  const r = await c.redeem(raw, userId);
  if (!r.ok) return { ok: false, reason: r.reason, error: REDEEM_MESSAGES[r.reason] };
  const balance = await creditBalanceCents(userId, c);
  return {
    ok: true,
    unit: r.grant.unit,
    amount: r.grant.amount,
    credit_usd: r.grant.unit === CREDIT_UNIT ? centsToUsd(r.grant.amount) : 0,
    balance_usd: centsToUsd(balance),
  };
}

export async function creditSummary(userId: string, c: Credits = getCredits()) {
  const [balance, history] = await Promise.all([creditBalanceCents(userId, c), c.history(userId, CREDIT_UNIT)]);
  return {
    unit: CREDIT_UNIT,
    balance_cents: balance,
    balance_usd: centsToUsd(balance),
    history: history
      .slice(-50)
      .reverse()
      .map((h) => ({ kind: h.kind, amount_usd: centsToUsd(h.amount), source: h.source, at: new Date(h.at).toISOString() })),
  };
}

export function inviteUrl(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/i/${encodeURIComponent(code)}`;
}

export async function invitesSummary(userId: string, siteUrl: string, a: Affiliates = getAffiliates()) {
  const [quota, invites, code] = await Promise.all([a.quota(userId), a.invites(userId), a.affiliateCode(userId)]);
  return {
    quota,
    bonus_usd: centsToUsd(INVITE_BONUS_CENTS),
    referral_link: `${siteUrl.replace(/\/+$/, "")}/?ref=${encodeURIComponent(code)}`,
    invites: invites.map((i) => ({
      id: i.id,
      note: i.note,
      created_at: new Date(i.createdAt).toISOString(),
      expires_at: i.expiresAt ? new Date(i.expiresAt).toISOString() : null,
      used: Boolean(i.usedBy),
      used_at: i.usedAt ? new Date(i.usedAt).toISOString() : null,
    })),
  };
}

/** Create one invite. The plaintext code exists only in this answer. */
export async function createInvite(userId: string, siteUrl: string, note: unknown, a: Affiliates = getAffiliates()) {
  const quota = await a.quota(userId);
  if (quota.left <= 0) return { ok: false as const, error: `You have used all ${quota.total} invites.` };
  try {
    const inv = await a.createInvite(userId, String(note ?? "").slice(0, 80));
    return { ok: true as const, code: inv.code, url: inviteUrl(siteUrl, inv.code), expires_at: inv.expiresAt ? new Date(inv.expiresAt).toISOString() : null };
  } catch (e) {
    if (e instanceof Error && /no invites left/.test(e.message)) return { ok: false as const, error: "No invites left." };
    throw e;
  }
}

export interface SignupUser {
  id: string;
  created_at?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * smshub's signup checks, which an account must pass before an invite pays out:
 * the email address is confirmed (GoTrue requires it), the account is new, and
 * the /register profile (first and last name, validated by @profullstack/profile)
 * was given.
 */
export function passesSignupChecks(user: SignupUser, hasProfile: boolean, now = Date.now()): boolean {
  if (!user.email_confirmed_at) return false;
  const created = user.created_at ? new Date(user.created_at).getTime() : NaN;
  if (!Number.isFinite(created) || now - created > INVITE_NEW_ACCOUNT_MS) return false;
  return hasProfile;
}

/** The invite code a sign-up carries: the /i/<code> cookie, or the one /register put in user metadata. */
export function inviteCodeFor(cookieValue: string | null | undefined, user: SignupUser): string | null {
  const fromMeta = user.user_metadata?.invite_code;
  const code = String(cookieValue || (typeof fromMeta === "string" ? fromMeta : "") || "").trim();
  return code && code.length <= 64 ? code : null;
}

export type InviteOutcome =
  | { accepted: true; inviterId: string; bonus_usd: number }
  | { accepted: false; reason: string };

/**
 * Spend an invite for a new account and credit both sides. Only called once the
 * account passes the signup checks. The bonus rests on redeemInvite's answer
 * alone: since @profullstack/affiliates 0.3 the database (aff_claim_invite plus
 * the aff_invites_one_per_user unique index) lets an account take ONE invite,
 * atomically, so two sign-ins racing with different invite cookies get one
 * `ok` and one `already_invited` (no bonus, the second invite stays unused).
 * A separate invitedBy() check first would only be a racy read, so there is none.
 */
export async function acceptInvite(
  user: SignupUser,
  code: string,
  hasProfile: boolean,
  deps: { credits?: Credits; affiliates?: Affiliates; now?: number } = {}
): Promise<InviteOutcome> {
  if (!passesSignupChecks(user, hasProfile, deps.now)) return { accepted: false, reason: "checks" };
  const a = deps.affiliates ?? getAffiliates();
  const c = deps.credits ?? getCredits();
  const r = await a.redeemInvite(code, user.id);
  if (!r.ok) return { accepted: false, reason: r.reason };
  const grant = { unit: CREDIT_UNIT, amount: INVITE_BONUS_CENTS };
  await c.grant(user.id, grant, `invite:${r.inviteId}:joined`);
  await c.grant(r.inviterId, grant, `invite:${r.inviteId}:inviter`);
  return { accepted: true, inviterId: r.inviterId, bonus_usd: centsToUsd(INVITE_BONUS_CENTS) };
}

/**
 * First-touch ?ref= attribution for a new account, from ?ref= or the existing
 * referral_code cookie. Codes from the old @profullstack/referrals tables come
 * back external and are left to that system, so a sign-up is counted once.
 */
export async function attributeReferral(
  request: Request,
  user: SignupUser,
  deps: { affiliates?: Affiliates; now?: number } = {}
): Promise<{ ok: boolean; external?: boolean; affiliateId?: string } | null> {
  const created = user.created_at ? new Date(user.created_at).getTime() : NaN;
  if (!Number.isFinite(created) || (deps.now ?? Date.now()) - created > INVITE_NEW_ACCOUNT_MS) return null;
  const code = refFromRequest(request);
  if (!code) return null;
  return (deps.affiliates ?? getAffiliates()).attribute(code, user.id);
}

/** Run both on a confirmed sign-in; never throws (sign-in must not fail on rewards). */
export async function onConfirmedSignIn(
  request: Request,
  user: SignupUser,
  inviteCookie: string | null | undefined,
  hasProfile: () => Promise<boolean>
): Promise<{ invite: InviteOutcome | null }> {
  let invite: InviteOutcome | null = null;
  try {
    const code = inviteCodeFor(inviteCookie, user);
    if (code) invite = await acceptInvite(user, code, await hasProfile());
  } catch (e) {
    console.error("[rewards] invite accept failed", e);
  }
  try {
    await attributeReferral(request, user);
  } catch (e) {
    console.error("[rewards] referral attribution failed", e);
  }
  return { invite };
}
