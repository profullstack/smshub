import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Auth callback for email links (signup confirmation, password recovery).
 *
 * Supabase sends the user here after verifying the link. With the PKCE flow
 * the URL carries `?code=...`; older-style links carry `?token_hash=...&type=...`.
 * We hand whichever is present to Supabase, then decide purely on whether a
 * session now exists: signed in -> `next`, otherwise -> /login.
 *
 * Redirects are built from getSiteUrl(), not request.url: behind Railway's
 * proxy the request origin is the container's localhost.
 */

type OtpType = "signup" | "recovery" | "email" | "email_change" | "magiclink";
const OTP_TYPES: readonly OtpType[] = ["signup", "recovery", "email", "email_change", "magiclink"];

/** Only allow same-origin relative paths so the redirect cannot leave the site. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/inbox";
  }
  return next;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const site = getSiteUrl();
  const code = url.searchParams.get("code") ?? "";
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const rawType = url.searchParams.get("type") ?? "";
  const type = OTP_TYPES.find((t) => t === rawType);
  const next = safeNextPath(url.searchParams.get("next"));

  let signedIn = false;

  try {
    const supabase = await createServerSupabaseClient();

    // Best effort: let Supabase consume whatever the link carried. Errors are
    // not trusted either way; only the session lookup below decides.
    if (code.length > 0) {
      await supabase.auth.exchangeCodeForSession(code);
    } else if (tokenHash.length > 0 && type) {
      await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  } catch (error) {
    console.error("Auth callback error:", error);
    signedIn = false;
  }

  if (signedIn) {
    return NextResponse.redirect(new URL(next, site));
  }

  const failure = new URL("/login", site);
  failure.searchParams.set("error", "link");
  return NextResponse.redirect(failure);
}
