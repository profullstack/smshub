import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBrandSiteUrl } from "@/lib/brand-server";
import { safeNextPath } from "@/lib/safe-next";
import { profileStore, saveProfileFromMetadata } from "@/lib/profile";
import { INVITE_COOKIE, onConfirmedSignIn } from "@/lib/rewards";

export { safeNextPath };

/**
 * Auth callback for email links (signup confirmation, password recovery).
 *
 * Supabase sends the user here after verifying the link. With the PKCE flow
 * the URL carries `?code=...`; older-style links carry `?token_hash=...&type=...`.
 * We hand whichever is present to Supabase, then decide purely on whether a
 * session now exists: signed in -> `next`, otherwise -> /login.
 *
 * Redirects are built from getBrandSiteUrl(), not request.url: behind the
 * proxy the request origin is the container's localhost. It returns the brand
 * host the link was opened on when that host is configured, else getSiteUrl().
 */

type OtpType = "signup" | "recovery" | "email" | "email_change" | "magiclink";
const OTP_TYPES: readonly OtpType[] = ["signup", "recovery", "email", "email_change", "magiclink"];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const site = await getBrandSiteUrl(request);
  const code = url.searchParams.get("code") ?? "";
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const rawType = url.searchParams.get("type") ?? "";
  const type = OTP_TYPES.find((t) => t === rawType);
  const next = safeNextPath(url.searchParams.get("next"));

  let signedIn = false;
  const inviteCookie = request.cookies.get(INVITE_COOKIE)?.value ?? null;

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
    // First confirmation: store the /register profile fields (never blocks).
    if (user) {
      await saveProfileFromMetadata(user);
      // A new, confirmed account: spend its invite (both people get credit) and
      // record ?ref= first touch. Never blocks sign-in.
      await onConfirmedSignIn(request, user, inviteCookie, () =>
        profileStore()
          .get(user.id)
          .then(Boolean)
          .catch(() => false)
      );
    }
  } catch (error) {
    console.error("Auth callback error:", error);
    signedIn = false;
  }

  if (signedIn) {
    const res = NextResponse.redirect(new URL(next, site));
    if (inviteCookie) res.cookies.delete(INVITE_COOKIE);
    return res;
  }

  const failure = new URL("/login", site);
  failure.searchParams.set("error", "link");
  if (next !== "/inbox") failure.searchParams.set("next", next);
  return NextResponse.redirect(failure);
}
