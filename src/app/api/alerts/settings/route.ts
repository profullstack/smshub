import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { createServiceClient } from "@/lib/supabase/server";
import { AlertError, CONSENT_TEXT, getAlertSettings, saveAlertSettings } from "@/lib/alerts/service";

/** The account's alert phone and its consent record. */
export async function GET(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  return NextResponse.json({ settings: await getAlertSettings(createServiceClient(), who.user.userId), consent_text: CONSENT_TEXT });
}

/** { phone, consent: true } sets the alert phone; { phone: null } turns alerts off. */
export async function PUT(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  try {
    const body = await request.json().catch(() => ({}));
    const settings = await saveAlertSettings(createServiceClient(), who.user.userId, body ?? {});
    return NextResponse.json({ settings, consent_text: CONSENT_TEXT });
  } catch (error) {
    if (error instanceof AlertError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Save alert settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
