import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Proxy rules for SMSHub
 * - Redirect www.smshub.dev → smshub.dev
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get("host") || "";

  // Redirect www to non-www
  if (hostname.startsWith("www.")) {
    const nonWww = hostname.replace(/^www\./, "");
    url.host = nonWww;
    url.protocol = "https";
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}
