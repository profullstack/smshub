import { describe, it, expect, beforeEach } from "vitest";
import { Credits, memoryStore as creditMemory } from "@profullstack/redeem-credits";
import { Affiliates, memoryStore as affMemory } from "@profullstack/affiliates";
import {
  acceptInvite,
  attributeReferral,
  createInvite,
  CREDIT_UNIT,
  INVITE_BONUS_CENTS,
  INVITE_NEW_ACCOUNT_MS,
  inviteCodeFor,
  invitesSummary,
  passesSignupChecks,
  redeemCode,
} from "../rewards";

const NOW = Date.UTC(2026, 9, 26, 12);
const fresh = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  created_at: new Date(NOW - 60_000).toISOString(),
  email_confirmed_at: new Date(NOW - 1000).toISOString(),
  user_metadata: {},
  ...over,
});

describe("credit codes", () => {
  let credits: Credits;
  beforeEach(() => {
    credits = new Credits(creditMemory());
  });

  it("redeems a code into usd_cents and says why a code is refused", async () => {
    const { code } = await credits.mint({ grant: { unit: CREDIT_UNIT, amount: 1000 }, label: "for Kim" });
    const r = await redeemCode("kim", code.toLowerCase().replace(/-/g, " "), credits);
    expect(r).toEqual({ ok: true, unit: CREDIT_UNIT, amount: 1000, credit_usd: 10, balance_usd: 10 });
    expect(await redeemCode("kim", code, credits)).toMatchObject({ ok: false, reason: "already_redeemed" });
    expect(await redeemCode("lee", code, credits)).toMatchObject({ ok: false, reason: "used_up", error: "That code has already been used." });
    expect(await redeemCode("lee", "CR-NOPE-NOPE-NOPE-NOPE", credits)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await redeemCode("lee", "", credits)).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("invites", () => {
  let credits: Credits;
  let aff: Affiliates;
  beforeEach(() => {
    credits = new Credits(creditMemory());
    aff = new Affiliates(affMemory(), { defaultQuota: 3, now: () => NOW });
  });
  const deps = () => ({ credits, affiliates: aff, now: NOW });

  it("gives 3 invites, then refuses", async () => {
    for (let i = 0; i < 3; i++) expect((await createInvite("alice", "https://smshub.dev", `n${i}`, aff)).ok).toBe(true);
    expect(await createInvite("alice", "https://smshub.dev", "n4", aff)).toMatchObject({ ok: false });
    const s = await invitesSummary("alice", "https://smshub.dev", aff);
    expect(s.quota).toEqual({ total: 3, used: 3, left: 0 });
    expect(s.referral_link).toMatch(/^https:\/\/smshub\.dev\/\?ref=/);
  });

  it("an accepted invite credits both people once", async () => {
    const inv = await createInvite("alice", "https://smshub.dev/", "for Bob", aff);
    if (!inv.ok) throw new Error("no invite");
    expect(inv.url).toBe(`https://smshub.dev/i/${inv.code}`);
    const r = await acceptInvite(fresh("bob"), inv.code, true, deps());
    expect(r).toEqual({ accepted: true, inviterId: "alice", bonus_usd: 2.5 });
    expect(await credits.balance("bob", CREDIT_UNIT)).toBe(INVITE_BONUS_CENTS);
    expect(await credits.balance("alice", CREDIT_UNIT)).toBe(INVITE_BONUS_CENTS);

    // Single use: a second account gets nothing, and Bob cannot cash it again.
    expect(await acceptInvite(fresh("carol"), inv.code, true, deps())).toEqual({ accepted: false, reason: "used" });
    expect(await acceptInvite(fresh("bob"), inv.code, true, deps())).toMatchObject({ accepted: false });
    expect(await credits.balance("alice", CREDIT_UNIT)).toBe(INVITE_BONUS_CENTS);
  });

  it("pays nothing and keeps the invite until the account passes the signup checks", async () => {
    const inv = await createInvite("alice", "x", "", aff);
    if (!inv.ok) throw new Error("no invite");
    // Unconfirmed email, no signup profile, an old account, and the inviter themself.
    expect(await acceptInvite(fresh("bob", { email_confirmed_at: null }), inv.code, true, deps())).toEqual({ accepted: false, reason: "checks" });
    expect(await acceptInvite(fresh("bob"), inv.code, false, deps())).toEqual({ accepted: false, reason: "checks" });
    const old = fresh("dave", { created_at: new Date(NOW - INVITE_NEW_ACCOUNT_MS - 1).toISOString() });
    expect(await acceptInvite(old, inv.code, true, deps())).toEqual({ accepted: false, reason: "checks" });
    expect(await acceptInvite(fresh("alice"), inv.code, true, deps())).toEqual({ accepted: false, reason: "self" });
    expect(await credits.balance("alice", CREDIT_UNIT)).toBe(0);
    // Still unused: Bob, once he passes, gets it.
    expect((await acceptInvite(fresh("bob"), inv.code, true, deps())).accepted).toBe(true);
  });

  it("two simultaneous sign-ins with different invites: one is accepted and paid, the other refused unused", async () => {
    const a1 = await createInvite("alice", "x", "", aff);
    const a2 = await createInvite("dan", "x", "", aff);
    if (!a1.ok || !a2.ok) throw new Error("no invite");
    const [r1, r2] = await Promise.all([
      acceptInvite(fresh("bob"), a1.code, true, deps()),
      acceptInvite(fresh("bob"), a2.code, true, deps()),
    ]);
    const outcomes = [r1, r2];
    expect(outcomes.filter((r) => r.accepted)).toHaveLength(1);
    expect(outcomes.find((r) => !r.accepted)).toEqual({ accepted: false, reason: "already_invited" });
    // Bob and exactly one inviter are paid once; the losing invite is still unused and spendable.
    expect(await credits.balance("bob", CREDIT_UNIT)).toBe(INVITE_BONUS_CENTS);
    const paid = [await credits.balance("alice", CREDIT_UNIT), await credits.balance("dan", CREDIT_UNIT)].sort();
    expect(paid).toEqual([0, INVITE_BONUS_CENTS]);
    const loser = r1.accepted ? a2 : a1;
    expect((await acceptInvite(fresh("erin"), loser.code, true, deps())).accepted).toBe(true);
  });

  it("an account that already took an invite is refused a second one later, which stays unused", async () => {
    const a1 = await createInvite("alice", "x", "", aff);
    const a2 = await createInvite("dan", "x", "", aff);
    if (!a1.ok || !a2.ok) throw new Error("no invite");
    expect((await acceptInvite(fresh("bob"), a1.code, true, deps())).accepted).toBe(true);
    expect(await acceptInvite(fresh("bob"), a2.code, true, deps())).toEqual({ accepted: false, reason: "already_invited" });
    expect(await credits.balance("dan", CREDIT_UNIT)).toBe(0);
    expect((await invitesSummary("dan", "x", aff)).invites[0].used).toBe(false);
  });

  it("takes the invite from the cookie, else from signup metadata", () => {
    expect(inviteCodeFor("INV-AAAA-BBBB-CCCC", fresh("b"))).toBe("INV-AAAA-BBBB-CCCC");
    expect(inviteCodeFor(null, fresh("b", { user_metadata: { invite_code: "INV-1111-2222-3333" } }))).toBe("INV-1111-2222-3333");
    expect(inviteCodeFor(undefined, fresh("b"))).toBeNull();
  });

  it("passesSignupChecks needs a confirmed, new account with a profile", () => {
    expect(passesSignupChecks(fresh("b"), true, NOW)).toBe(true);
    expect(passesSignupChecks(fresh("b"), false, NOW)).toBe(false);
    expect(passesSignupChecks(fresh("b", { email_confirmed_at: null }), true, NOW)).toBe(false);
  });
});

describe("?ref= attribution", () => {
  it("records first touch for a new account from the referral_code cookie, and leaves old referral codes alone", async () => {
    const external = new Set(["OLDCODE1"]);
    const aff = new Affiliates(affMemory(), { now: () => NOW, externalCodes: (c) => external.has(c) });
    const code = await aff.affiliateCode("alice");
    const req = (cookie: string) => new Request("https://smshub.dev/auth/callback?code=x", { headers: { cookie } });

    expect(await attributeReferral(req(`referral_code=${code}`), fresh("bob"), { affiliates: aff, now: NOW })).toMatchObject({ ok: true, affiliateId: "alice" });
    expect(await aff.affiliateOf("bob")).toBe("alice");
    // First touch: a later code does not overwrite it.
    const other = await aff.affiliateCode("zed");
    expect(await attributeReferral(req(`referral_code=${other}`), fresh("bob"), { affiliates: aff, now: NOW })).toMatchObject({ ok: false, affiliateId: "alice" });
    // A code from the old @profullstack/referrals tables: not recorded here.
    expect(await attributeReferral(req("referral_code=OLDCODE1"), fresh("carol"), { affiliates: aff, now: NOW })).toMatchObject({ ok: false, external: true });
    expect(await aff.affiliateOf("carol")).toBeNull();
    // An old account is never attributed.
    const old = fresh("dave", { created_at: new Date(NOW - INVITE_NEW_ACCOUNT_MS - 1).toISOString() });
    expect(await attributeReferral(req(`referral_code=${code}`), old, { affiliates: aff, now: NOW })).toBeNull();
  });
});
