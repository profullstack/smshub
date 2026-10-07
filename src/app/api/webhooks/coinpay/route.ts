import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { coinpayConfig, readWebhook, verifyWebhookSignature } from "@/lib/coinpay/checkout";
import { settlePayment } from "@/lib/managed-numbers/service";

/**
 * CoinPay payment webhooks for managed-number orders. Verified over the raw
 * bytes; an unknown or unsettled payment answers 200 so CoinPay stops retrying,
 * a provisioning failure is kept on the order and retried by the sweeper.
 */
export async function POST(request: Request) {
  const cfg = coinpayConfig();
  if (!cfg) return NextResponse.json({ error: "CoinPay is not configured" }, { status: 503 });

  const raw = await request.text();
  const sig = request.headers.get("x-coinpay-signature");
  if (!verifyWebhookSignature(raw, sig, cfg.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await settlePayment({ db: createServiceClient() }, readWebhook(payload));
    return NextResponse.json(result);
  } catch (e) {
    console.error("coinpay webhook error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
