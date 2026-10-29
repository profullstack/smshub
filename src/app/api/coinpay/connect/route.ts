import type { NextRequest } from "next/server";
import { startCoinpay } from "@/lib/coinpay/start";

export const dynamic = "force-dynamic";

/** GET /api/coinpay/connect: Connect CoinPay to the signed-in account (Settings). */
export async function GET(request: NextRequest) {
  return startCoinpay(request, "connect");
}
