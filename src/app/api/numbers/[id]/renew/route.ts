import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/request-user";
import { createOrder, OrderError } from "@/lib/managed-numbers/service";
import { getSiteUrl } from "@/lib/site-url";

/** Extend a rented number: { months?, chain? } -> an order with a CoinPay pay_url. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const order = await createOrder(
      { db: createServiceClient() },
      {
        userId: who.user.userId,
        email: who.user.email,
        kind: "renew",
        phoneNumberId: id,
        months: body.months,
        chain: body.chain,
        siteUrl: getSiteUrl(),
      }
    );
    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("renew number error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
