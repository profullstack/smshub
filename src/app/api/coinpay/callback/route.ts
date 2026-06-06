import { NextResponse, type NextRequest } from "next/server";
import {
  createServerSupabaseClient,
  createServiceClient,
} from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

const COINPAY_BASE_URL = "https://coinpayportal.com";
const STATE_COOKIE = "coinpay_oauth_state";
const VERIFIER_COOKIE = "coinpay_oauth_verifier";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

type UserInfoResponse = {
  sub?: string;
  email?: string;
  name?: string;
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  const settingsUrl = new URL("/settings", getSiteUrl());

  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    settingsUrl.searchParams.set("coinpay", "error");
    settingsUrl.searchParams.set("reason", "invalid_state");
    return NextResponse.redirect(settingsUrl);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", getSiteUrl());
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.COINPAY_CLIENT_ID;
  const clientSecret = process.env.COINPAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    settingsUrl.searchParams.set("coinpay", "error");
    settingsUrl.searchParams.set("reason", "not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = new URL("/api/coinpay/callback", getSiteUrl()).toString();
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const tokenResponse = await fetch(`${COINPAY_BASE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });

  if (!tokenResponse.ok) {
    settingsUrl.searchParams.set("coinpay", "error");
    settingsUrl.searchParams.set("reason", "token_exchange");
    return NextResponse.redirect(settingsUrl);
  }

  const token = (await tokenResponse.json()) as TokenResponse;
  const userInfoResponse = await fetch(`${COINPAY_BASE_URL}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const userInfo = userInfoResponse.ok
    ? ((await userInfoResponse.json()) as UserInfoResponse)
    : {};

  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.from("coinpay_connections").upsert(
    {
      user_id: user.id,
      coinpay_user_id: userInfo.sub || null,
      email: userInfo.email || null,
      name: userInfo.name || null,
      access_token: token.access_token,
      refresh_token: token.refresh_token || null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  const responseUrl = new URL("/settings", getSiteUrl());
  responseUrl.searchParams.set("coinpay", error ? "error" : "connected");
  if (error) {
    responseUrl.searchParams.set("reason", "save_failed");
  }

  const response = NextResponse.redirect(responseUrl);
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(VERIFIER_COOKIE);

  return response;
}
