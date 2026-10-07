import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/request-user";
import { listOrders } from "@/lib/managed-numbers/api";
import { createOrder, OrderError } from "@/lib/managed-numbers/service";
import { getBrandSiteUrl } from "@/lib/brand-server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  return NextResponse.json({ orders: await listOrders(createServiceClient(), who.user.userId) });
}

/**
 * Rent a number: { area_code?, months?, chain? } -> an order with a CoinPay
 * pay_url. The number is provisioned when CoinPay confirms the payment.
 */
export async function POST(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const rl = checkRateLimit(`number-order:${who.user.userId}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many checkouts, try again later" }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const order = await createOrder(
      { db: createServiceClient() },
      {
        userId: who.user.userId,
        email: who.user.email,
        kind: "new",
        areaCode: body.area_code,
        months: body.months,
        chain: body.chain,
        siteUrl: await getBrandSiteUrl(request),
      }
    );
    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("create number order error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
