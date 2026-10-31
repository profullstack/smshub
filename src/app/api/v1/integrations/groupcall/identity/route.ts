import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { createServiceClient } from "@/lib/supabase/server";

/** Return only the CoinPay subject bound to the API key owner for account-link verification. */
export async function GET(request: Request) {
  const who = await resolveUser(request, { allowSession: false });
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });

  const { data, error } = await createServiceClient()
    .from("coinpay_connections")
    .select("coinpay_user_id")
    .eq("user_id", who.user.userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  if (!data?.coinpay_user_id) {
    return NextResponse.json({ error: "Connect CoinPay in SMSHub Settings first" }, { status: 409 });
  }

  return NextResponse.json({ coinpay_sub: data.coinpay_user_id }, { headers: { "cache-control": "no-store" } });
}
