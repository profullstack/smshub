import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/request-user";
import { numberMessages } from "@/lib/managed-numbers/api";

const MAX_WAIT_SECONDS = 55;

/**
 * Texts received on a number, newest first, each with any one-time code pulled
 * out as `otp`. `?since=<iso>` returns only newer ones; `?wait=<seconds>` holds
 * the request open (up to 55s) until one arrives, which is how the CLI and MCP
 * "wait for the code" without polling.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await params;
  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const limit = Number(url.searchParams.get("limit") || 20);
  const wait = Math.min(MAX_WAIT_SECONDS, Math.max(0, Number(url.searchParams.get("wait") || 0)));
  const db = createServiceClient();

  const deadline = Date.now() + wait * 1000;
  for (;;) {
    const messages = await numberMessages(db, who.user.userId, id, { since, limit });
    if (messages === null) return NextResponse.json({ error: "Number not found" }, { status: 404 });
    if (messages.length > 0 || Date.now() >= deadline || request.signal.aborted) {
      return NextResponse.json({ messages });
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
