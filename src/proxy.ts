import { gate } from "@/lib/crawl-gateway";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Proxy rules for SMSHub
 * - Redirect www.smshub.dev → smshub.dev
 * - Auth session management (Supabase)
 */
export async function proxy(request: NextRequest) {
  // Crawl gateway first: AI training crawlers get 402 Payment Required (or the
  // sales page at /crawl) unless they present a paid pass. People, Googlebot
  // and retrieval crawlers fall through to everything below.
  const answer = await gate(request);
  if (answer) return answer;

  const hostname = request.headers.get("host") || "";

  // Redirect www to non-www
  if (hostname.startsWith("www.")) {
    const url = request.nextUrl.clone();
    const nonWww = hostname.replace(/^www\./, "");
    url.host = nonWww;
    url.protocol = "https";
    return NextResponse.redirect(url, 301);
  }

  // Auth session handling
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
