import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { creditSummary } from "@/lib/rewards";

export const dynamic = "force-dynamic";

/** Store credit balance (USD) and the latest grants and spends. */
export async function GET(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  try {
    return NextResponse.json(await creditSummary(who.user.userId));
  } catch (e) {
    console.error("credits error:", e);
    return NextResponse.json({ error: "Could not load credit" }, { status: 500 });
  }
}
