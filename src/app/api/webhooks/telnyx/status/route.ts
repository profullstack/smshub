import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { applyTelnyxStatus, parseTelnyxStatusEvent } from "@/lib/providers/telnyx-status";
import { authenticateTelnyxWebhook } from "@/lib/providers/telnyx-webhook-auth";

// Telnyx delivery status events (message.sent / message.finalized). The
// messaging profile's webhook_url normally points at /api/webhooks/telnyx,
// which handles these too; this route stays for per-message webhook_url.
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    const body = JSON.parse(rawBody);
    const supabase = createServiceClient();

    const auth = await authenticateTelnyxWebhook(supabase, rawBody, body, request.headers);
    if (!auth.ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const eventType: string = body.data?.event_type || "";
    if (!eventType.startsWith("message.") || eventType === "message.received") {
      return NextResponse.json({ ok: true });
    }

    if (!body.data?.payload?.id) {
      return NextResponse.json({ error: "Missing message ID" }, { status: 400 });
    }

    const update = parseTelnyxStatusEvent(body);
    if (!update) {
      return NextResponse.json({ ok: true });
    }

    const { error } = await applyTelnyxStatus(supabase, update);
    if (error) {
      console.error("Telnyx status update error:", error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telnyx status webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
