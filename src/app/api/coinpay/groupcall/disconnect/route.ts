import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/site-url";
import { startCoinpay } from "@/lib/coinpay/start";

export const dynamic = "force-dynamic";

/** Reauthorize with CoinPay before removing the group.call connection. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(getSiteUrl()).origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return startCoinpay(request, "connect", "/settings?groupcall=disconnect", true);
}
