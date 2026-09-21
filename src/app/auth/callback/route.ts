import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Auth callback for email links (signup confirmation, password recovery).
 *
 * Supabase sends the user here after verifying the link. With the PKCE flow
 * the URL carries `?code=...`; older-style links carry `?token_hash=...&type=...`.
 * Either way we turn it into a session cookie and continue to `next`.
 */

/** Only allow same-origin relative paths so the redirect cannot leave the site. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/inbox";
  }
  return next;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNextPath(url.searchParams.get("next"));

  const failure = new URL("/login", url.origin);
  failure.searchParams.set("error", "link");

  try {
    const supabase = await createServerSupabaseClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return NextResponse.redirect(failure);
      return NextResponse.redirect(new URL(next, url.origin));
    }

    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as "signup" | "recovery" | "email" | "email_change" | "magiclink",
      });
      if (error) return NextResponse.redirect(failure);
      return NextResponse.redirect(new URL(next, url.origin));
    }
  } catch (error) {
    console.error("Auth callback error:", error);
  }

  return NextResponse.redirect(failure);
}
