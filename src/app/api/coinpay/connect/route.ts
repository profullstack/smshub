import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

const COINPAY_BASE_URL = "https://coinpayportal.com";
const STATE_COOKIE = "coinpay_oauth_state";
const VERIFIER_COOKIE = "coinpay_oauth_verifier";

function randomState() {
  return crypto.randomBytes(16).toString("hex");
}

function randomVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function challengeForVerifier(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", getSiteUrl());
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.COINPAY_CLIENT_ID;

  if (!clientId) {
    const settingsUrl = new URL("/settings", getSiteUrl());
    settingsUrl.searchParams.set("coinpay", "error");
    settingsUrl.searchParams.set("reason", "not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  const state = randomState();
  const verifier = randomVerifier();
  const challenge = challengeForVerifier(verifier);
  const redirectUri = new URL("/api/coinpay/callback", getSiteUrl()).toString();
  const authorizeUrl = new URL("/api/oauth/authorize", COINPAY_BASE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid profile email wallet:read");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/",
  });
  response.cookies.set(VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
}
