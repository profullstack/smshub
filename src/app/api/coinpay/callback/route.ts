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
import { generateApiKey, hashApiKey } from "@/lib/api-auth";
import { GROUPCALL_API_KEY_NAME, GROUPCALL_BASE_URL } from "@/lib/groupcall";

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
 * Supabase session minted server side. OAuth tokens are never stored; group.call
 * modes forward the access token once over HTTPS server-to-server.
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
  const groupcallAction = pending.mode === "connect" && pending.next === "/settings?groupcall=connect"
    ? "connect"
    : pending.mode === "connect" && pending.next === "/settings?groupcall=disconnect"
      ? "disconnect"
      : null;
  const fail = (reason: string) => {
    if (groupcallAction) {
      return to(`/settings?groupcall=error&reason=${reason}`);
    }
    return to(pending.mode === "connect" ? `/settings?coinpay=error&reason=${reason}` : `/login?error=coinpay_${reason}`);
  };

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return fail("cancelled");

  let result: Awaited<ReturnType<typeof finishSignIn>>;
  try {
    result = await finishSignIn({
      code,
      verifier: pending.verifier,
      nonce: pending.nonce,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      redirectUri: cfg.redirectUri,
    });
  } catch (err) {
    console.error("[coinpay] sign-in failed", err instanceof Error ? err.message : err);
    return fail("token_exchange");
  }

  const claims = { sub: result.sub, email: result.email, name: result.name };
  const resolved = await resolveCoinpayUser({
    mode: pending.mode === "login" ? "login" : "connect",
    currentUserId: current?.id ?? null,
    claims,
  }, store);
  if (!resolved.ok) return fail(resolved.code);
  if (pending.mode === "connect" && !groupcallAction) return to("/settings?coinpay=connected");

  if (groupcallAction) {
    const groupcallHeaders: HeadersInit = {
      authorization: `Bearer ${result.tokens.accessToken}`,
      ...(groupcallAction === "connect" ? { "content-type": "application/json" } : {}),
    };

    if (groupcallAction === "disconnect") {
      let response: Response;
      try {
        response = await fetch(`${GROUPCALL_BASE_URL}/api/integrations/smshub`, {
          method: "DELETE",
          headers: groupcallHeaders,
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        return fail("groupcall_unavailable");
      }
      if (!response.ok) return fail("groupcall_unlink");
      const { error } = await admin.from("api_keys").delete().eq("user_id", resolved.userId).eq("name", GROUPCALL_API_KEY_NAME);
      if (error) return fail("smshub_cleanup");
      return to("/settings?groupcall=disconnected");
    }

    const rawKey = generateApiKey();
    const { data: created, error: createError } = await admin
      .from("api_keys")
      .insert({ user_id: resolved.userId, key_hash: hashApiKey(rawKey), name: GROUPCALL_API_KEY_NAME })
      .select("id")
      .single();
    if (createError || !created) return fail("key_create");

    let response: Response;
    try {
      response = await fetch(`${GROUPCALL_BASE_URL}/api/integrations/smshub`, {
        method: "POST",
        headers: groupcallHeaders,
        body: JSON.stringify({ key: rawKey }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      await admin.from("api_keys").delete().eq("id", created.id).eq("user_id", resolved.userId);
      return fail("groupcall_unavailable");
    }
    if (!response.ok) {
      await admin.from("api_keys").delete().eq("id", created.id).eq("user_id", resolved.userId);
      return fail("groupcall_link");
    }

    const { error: cleanupError } = await admin
      .from("api_keys")
      .delete()
      .eq("user_id", resolved.userId)
      .eq("name", GROUPCALL_API_KEY_NAME)
      .neq("id", created.id);
    if (cleanupError) console.error("[group.call] old integration key cleanup failed");
    return to("/settings?groupcall=connected");
  }

  const minted = await mintMagicLinkHash(admin, resolved.userId);
  if (!minted.ok) return fail("session");
  const { error } = await supabase.auth.verifyOtp({ token_hash: minted.tokenHash, type: "magiclink" });
  if (error) {
    console.error("[coinpay] verifyOtp", error.message);
    return fail("session");
  }
  return to(resolved.action === "created" ? "/settings?coinpay=welcome" : pending.next);
}
