import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/request-user";
import { OrderError, reopenOrder } from "@/lib/managed-numbers/service";
import { getBrandSiteUrl } from "@/lib/brand-server";
import { checkRateLimit } from "@/lib/rate-limit";

/** Finish an expired order: { chain? } -> a fresh checkout for the same number and months. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const rl = checkRateLimit(`number-order:${who.user.userId}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many checkouts, try again later" }, { status: 429 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const order = await reopenOrder(
      { db: createServiceClient() },
      {
        userId: who.user.userId,
        email: who.user.email,
        orderId: id,
        chain: body.chain,
        siteUrl: await getBrandSiteUrl(request),
      }
    );
    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("reopen number order error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
