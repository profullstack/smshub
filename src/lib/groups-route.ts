import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/request-user";
import { SendError } from "@/lib/messages/send";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Run a groups handler for the caller (API key or session), mapping SendError to its status. */
export async function groupsHandler(
  request: Request,
  run: (db: SupabaseClient, userId: string, body: Record<string, unknown>) => Promise<unknown>,
  status = 200
) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  let body: Record<string, unknown> = {};
  if (request.method !== "GET" && request.method !== "DELETE") {
    try {
      body = ((await request.json()) ?? {}) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    }
  }
  try {
    return NextResponse.json(await run(createServiceClient(), who.user.userId, body), { status });
  } catch (error) {
    if (error instanceof SendError) {
      const headers: Record<string, string> = {};
      if (error.retryAfterMs) headers["Retry-After"] = String(Math.ceil(error.retryAfterMs / 1000));
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    console.error("groups API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
