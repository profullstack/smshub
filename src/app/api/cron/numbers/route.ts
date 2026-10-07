import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { sweep } from "@/lib/managed-numbers/service";

/**
 * Run the managed-number sweep by hand (the server also runs it every few
 * minutes on its own, see instrumentation.ts). Bearer CRON_SECRET.
 */
export async function POST(request: Request) {
  const env = process.env;
  const secret = env["CRON_SECRET"] || "";
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ok =
    secret.length >= 16 &&
    got.length === secret.length &&
    timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await sweep({ db: createServiceClient() }));
}
