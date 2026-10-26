import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { checkRateLimit } from "@/lib/rate-limit";
import { redeemCode } from "@/lib/rewards";

export const dynamic = "force-dynamic";

/**
 * Redeem a credit code: { code } -> { ok, credit_usd, balance_usd }.
 * Store credit pays for rented numbers (order chain "CREDIT").
 * Session (web app) or API key (CLI, scripts).
 */
export async function POST(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const rl = checkRateLimit(`redeem:${who.user.userId}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many tries, wait a few minutes" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await redeemCode(who.user.userId, body.code);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    console.error("redeem error:", e);
    return NextResponse.json({ error: "Could not redeem the code" }, { status: 500 });
  }
}
