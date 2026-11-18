import { NextResponse, type NextRequest } from "next/server";
import { gate } from "@/lib/crawl-gateway";
import { meter } from "@/lib/throttle";
import { trackReferralCode } from "@profullstack/stack/referrals";
import { SOURCE_COOKIE, SOURCE_MAX_AGE, encodeSource, sourceFromParams } from "@/lib/attribution";

export async function middleware(request: NextRequest) {
  // /register is the human signup page. An MCP client that misses our OAuth
  // metadata falls back to POST /register for dynamic client registration;
  // answering it with the signup HTML (200) crashes the client's JSON parse.
  // Point it at the real registration endpoint instead (RFC 7591 error shape).
  if (
    request.method === "POST" &&
    request.nextUrl.pathname === "/register" &&
    /json/i.test(request.headers.get("content-type") ?? "")
  ) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "Register clients at /api/oauth/register (see /.well-known/oauth-authorization-server)",
      },
      { status: 404 }
    );
  }

  // Crawl gateway first: AI training crawlers get 402 Payment Required (or the
  // sales page at /crawl) unless they present a paid pass. The root
  // middleware.ts is the one Next runs here; src/proxy.ts is not wired.
  const answer = await gate(request);
  if (answer) return answer;

  // Then the site-wide allowance on page routes: 100 requests a minute per
  // caller, and going over is answered 402 with the same offer (lib/throttle).
  const overLimit = await meter(request);
  if (overLimit) return overLimit;
  const response = trackReferralCode(request, NextResponse.next() as any) as NextResponse;
  rememberFirstTouch(request, response);
  return response;
}

/**
 * First-touch attribution (lib/attribution): a page opened with utm_* or ref
 * query params, and no smshub_src cookie yet, gets one for 30 days. Pages only;
 * cheap (no I/O) and never overwrites an earlier source.
 */
function rememberFirstTouch(request: NextRequest, response: NextResponse) {
  if (request.method !== "GET" || request.nextUrl.pathname.startsWith("/api/")) return;
  if (!request.nextUrl.search || request.cookies.has(SOURCE_COOKIE)) return;
  const src = sourceFromParams(request.nextUrl.searchParams);
  if (!src) return;
  response.cookies.set(SOURCE_COOKIE, encodeSource(src), {
    maxAge: SOURCE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
    httpOnly: true,
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
