import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateApiKey, checkApiKeyRateLimit } from "@/lib/api-auth";
import { isBlockReason, listBlocked, setBlocked, type BlockReason } from "@/lib/blocking";

async function authed(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) return { res: NextResponse.json({ error: "Invalid API key" }, { status: 401 }) };
  if (!checkApiKeyRateLimit(auth.keyId).allowed) {
    return { res: NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }) };
  }
  return { userId: auth.userId };
}

/** Numbers you blocked, newest first. */
export async function GET(request: Request) {
  const a = await authed(request);
  if ("res" in a) return a.res;
  return NextResponse.json({ blocked: await listBlocked(createServiceClient(), a.userId) });
}

/** Block { phone, reason: spam | scam | other } on every line. */
export async function POST(request: Request) {
  const a = await authed(request);
  if ("res" in a) return a.res;
  const body = await request.json().catch(() => ({}));
  if (body.reason !== undefined && !isBlockReason(body.reason)) {
    return NextResponse.json({ error: "reason must be spam, scam or other" }, { status: 400 });
  }
  const reason: BlockReason = body.reason ?? "spam";
  const r = await setBlocked(createServiceClient(), a.userId, { phone: String(body.phone ?? "") }, reason);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}

/** Unblock ?phone=+1... */
export async function DELETE(request: Request) {
  const a = await authed(request);
  if ("res" in a) return a.res;
  const phone = new URL(request.url).searchParams.get("phone") ?? "";
  const r = await setBlocked(createServiceClient(), a.userId, { phone }, null);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
