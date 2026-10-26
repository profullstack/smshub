import { NextResponse, type NextRequest } from "next/server";
import { getBrandSiteUrl } from "@/lib/brand-server";
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE } from "@/lib/rewards";

export const dynamic = "force-dynamic";

/**
 * /i/<code>: an invite link. Keeps the code in a 7-day cookie (read on
 * /auth/callback when the new account confirms its email) and lands on the
 * sign-up page, which says what the invite gives and also carries the code in
 * the account's metadata. The code is checked only when it is spent.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw || "").trim();
  const site = await getBrandSiteUrl(request);
  if (!/^[A-Za-z0-9-]{4,40}$/.test(code)) return NextResponse.redirect(new URL("/register", site));
  const to = new URL("/register", site);
  to.searchParams.set("invite", code);
  to.searchParams.set("next", "/numbers");
  const res = NextResponse.redirect(to);
  res.cookies.set(INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: site.startsWith("https://"),
    maxAge: INVITE_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
