import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { getBrandSiteUrl } from "@/lib/brand-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createInvite, invitesSummary } from "@/lib/rewards";

export const dynamic = "force-dynamic";

/** Invite quota (3 per account), the invites made so far, and the ?ref= link. */
export async function GET(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  try {
    return NextResponse.json(await invitesSummary(who.user.userId, await getBrandSiteUrl(request)));
  } catch (e) {
    console.error("invites error:", e);
    return NextResponse.json({ error: "Could not load invites" }, { status: 500 });
  }
}

/** Create an invite: { note? } -> { code, url }. The code is shown once. */
export async function POST(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const rl = checkRateLimit(`invite:${who.user.userId}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await createInvite(who.user.userId, await getBrandSiteUrl(request), body.note);
    return NextResponse.json(r, { status: r.ok ? 201 : 403 });
  } catch (e) {
    console.error("create invite error:", e);
    return NextResponse.json({ error: "Could not create the invite" }, { status: 500 });
  }
}
