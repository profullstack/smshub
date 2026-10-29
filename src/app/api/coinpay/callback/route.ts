import { NextResponse, type NextRequest } from "next/server";
import { finishSignIn } from "@profullstack/coinpay-onboard/oauth";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import {
  STATE_COOKIE,
  STATE_COOKIE_PATH,
  coinpaySignInConfig,
  mintMagicLinkHash,
  resolveCoinpayUser,
  supabaseCoinpayStore,
  takeCallback,
} from "@/lib/coinpay/signin";

export const dynamic = "force-dynamic";

/**
 * GET /api/coinpay/callback?code=…&state=… for both Sign in with CoinPay and
 * Connect CoinPay.
 *
 * Refused before the code is exchanged when the state is not this browser's,
 * was already used, or (Connect) the signed-in user is not the one who asked.
 * The exchange sends the PKCE verifier and the client secret; the id_token's
 * iss/aud/exp/nonce are checked and userinfo's sub must match it. The account
 * is chosen by sub only (lib/coinpay/signin.ts); a sign-in then gets a normal
 * Supabase session minted server side. OAuth tokens are never stored.
 */
export async function GET(request: NextRequest) {
  const site = getSiteUrl();
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, site));
    res.cookies.set(STATE_COOKIE, "", { path: STATE_COOKIE_PATH, maxAge: 0 });
    res.headers.set("cache-control", "no-store");
    return res;
  };
  const cfg = coinpaySignInConfig(site);
  if (!cfg) return to("/login?error=coinpay_off");

  const url = new URL(request.url);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: current },
  } = await supabase.auth.getUser();

  const admin = createServiceClient();
  const store = supabaseCoinpayStore(admin);
  const checked = await takeCallback(store, {
    state: url.searchParams.get("state"),
    cookieState: request.cookies.get(STATE_COOKIE)?.value,
    currentUserId: current?.id ?? null,
  });
  if (!checked.ok) return to(`/login?error=coinpay_${checked.code}`);
  const { pending } = checked;
  const fail = (reason: string) =>
    to(pending.mode === "connect" ? `/settings?coinpay=error&reason=${reason}` : `/login?error=coinpay_${reason}`);

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return fail("cancelled");

  let claims;
  try {
    const result = await finishSignIn({
      code,
      verifier: pending.verifier,
      nonce: pending.nonce,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      redirectUri: cfg.redirectUri,
    });
    claims = { sub: result.sub, email: result.email, name: result.name };
  } catch (err) {
    console.error("[coinpay] sign-in failed", err instanceof Error ? err.message : err);
    return fail("token_exchange");
  }

  const resolved = await resolveCoinpayUser({ mode: pending.mode, currentUserId: current?.id ?? null, claims }, store);
  if (!resolved.ok) return fail(resolved.code);
  if (pending.mode === "connect") return to("/settings?coinpay=connected");

  const minted = await mintMagicLinkHash(admin, resolved.userId);
  if (!minted.ok) return fail("session");
  const { error } = await supabase.auth.verifyOtp({ token_hash: minted.tokenHash, type: "magiclink" });
  if (error) {
    console.error("[coinpay] verifyOtp", error.message);
    return fail("session");
  }
  return to(resolved.action === "created" ? "/settings?coinpay=welcome" : pending.next);
}
