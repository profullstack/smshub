import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { createServiceClient } from "@/lib/supabase/server";
import { AlertError, listAlerts, sendAlert } from "@/lib/alerts/service";

/**
 * Send an alert: { message, to?, severity? }. `to` defaults to the account's
 * alert phone (Settings > Alerts). A text when one of your numbers can send
 * one, otherwise (and always for severity "critical") a call that reads it.
 */
export async function POST(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON: { message, to?, severity? }" }, { status: 400 });
  }
  try {
    const result = await sendAlert({ db: createServiceClient() }, who.user.userId, body ?? {});
    if (result.alert.status === "failed") {
      return NextResponse.json({ ...result, error: result.alert.error || "Alert could not be sent" }, { status: 502 });
    }
    return NextResponse.json(result, { status: result.deduped ? 200 : 201 });
  } catch (error) {
    if (error instanceof AlertError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Send alert error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Recent alerts, newest first. */
export async function GET(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const limit = Number(new URL(request.url).searchParams.get("limit")) || 20;
  return NextResponse.json({ alerts: await listAlerts(createServiceClient(), who.user.userId, limit) });
}
