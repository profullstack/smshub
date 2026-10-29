import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, pkce, randomToken, SIGN_IN_SCOPES } from "@profullstack/coinpay-onboard/oauth";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { safeNextPath } from "@/lib/safe-next";
import {
  PENDING_SECONDS,
  STATE_COOKIE,
  STATE_COOKIE_PATH,
  coinpaySignInConfig,
  savePending,
  supabaseCoinpayStore,
  type OAuthMode,
} from "@/lib/coinpay/signin";

/** Connect keeps the wallet scope it always asked for; sign in needs only who you are. */
const CONNECT_SCOPES = [...SIGN_IN_SCOPES, "wallet:read"];

/**
 * Start Sign in with CoinPay (`login`) or Connect CoinPay (`connect`, signed in).
 *
 * The OAuth client's redirect URI is on smshub.dev only, so a start on a brand
 * host first hops to smshub.dev: the state cookie has to live where the
 * callback lands.
 */
export async function startCoinpay(request: NextRequest, mode: OAuthMode) {
  const site = getSiteUrl();
  const here = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedHost && forwardedHost !== new URL(site).host) {
    return NextResponse.redirect(new URL(here.pathname + here.search, site));
  }

  const cfg = coinpaySignInConfig(site);
  if (!cfg) {
    return NextResponse.redirect(
      new URL(mode === "connect" ? "/settings?coinpay=error&reason=not_configured" : "/login?error=coinpay_off", site)
    );
  }

  let linkUserId: string | null = null;
  if (mode === "connect") {
    // Connecting happens only from inside the account it joins.
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login?next=/settings", site));
    linkUserId = user.id;
  }

  const state = randomToken();
  const nonce = randomToken();
  const { verifier, challenge } = pkce();
  const next = safeNextPath(here.searchParams.get("next"), mode === "connect" ? "/settings" : "/inbox");
  await savePending(supabaseCoinpayStore(createServiceClient()), state, { verifier, nonce, mode, next, linkUserId });

  const res = NextResponse.redirect(
    authorizeUrl({
      clientId: cfg.clientId,
      redirectUri: cfg.redirectUri,
      state,
      challenge,
      nonce,
      scopes: mode === "connect" ? CONNECT_SCOPES : SIGN_IN_SCOPES,
    })
  );
  res.headers.set("cache-control", "no-store");
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: site.startsWith("https:"),
    sameSite: "lax",
    path: STATE_COOKIE_PATH,
    maxAge: PENDING_SECONDS,
  });
  return res;
}
