import type { NextRequest } from "next/server";
import { startCoinpay } from "@/lib/coinpay/start";

export const dynamic = "force-dynamic";

/** GET /api/coinpay/login?next=/inbox: Sign in (or sign up) with CoinPay. */
export async function GET(request: NextRequest) {
  return startCoinpay(request, "login");
}
