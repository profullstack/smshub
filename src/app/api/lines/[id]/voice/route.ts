import { NextResponse } from "next/server";
import { lineVoice } from "@/lib/lines/voice-setup";
import { lineFor } from "@/lib/lines/route-auth";

type Params = { params: Promise<{ id: string }> };

/** Where calls to this number go now. Read-only: changes nothing on Telnyx. */
export async function GET(request: Request, { params }: Params) {
  const ctx = await lineFor(request, (await params).id);
  if ("response" in ctx) return ctx.response;
  return NextResponse.json({ voice: await lineVoice(ctx.db, ctx.line) });
}

/**
 * Point the number's calls at the voice menu. { "force": true } replaces a
 * voice connection that already takes its calls (another app, a SIP trunk).
 */
export async function POST(request: Request, { params }: Params) {
  const ctx = await lineFor(request, (await params).id);
  if ("response" in ctx) return ctx.response;
  const body = await request.json().catch(() => ({}));
  const voice = await lineVoice(ctx.db, ctx.line, { apply: true, force: body?.force === true });
  return NextResponse.json({ voice });
}
