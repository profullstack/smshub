import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/request-user";
import { SendError, sendMessage } from "@/lib/messages/send";

/**
 * Send one SMS: { to, message, from?, media_url? }. `from` is one of your
 * numbers (E.164 or its id); optional when only one of them can send.
 */
export async function POST(request: Request) {
  const who = await resolveUser(request, { allowSession: false });
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON: { to, message, from? }" }, { status: 400 });
  }
  try {
    const result = await sendMessage(createServiceClient(), who.user.userId, body ?? {});
    return NextResponse.json(result, { headers: { "X-RateLimit-Remaining": String(result.remaining) } });
  } catch (error) {
    if (error instanceof SendError) {
      const headers: Record<string, string> = {};
      if (error.retryAfterMs) headers["Retry-After"] = String(Math.ceil(error.retryAfterMs / 1000));
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    console.error("API v1 send error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
