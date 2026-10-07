import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/providers";
import { applyTelnyxStatus, parseTelnyxStatusEvent } from "@/lib/providers/telnyx-status";

// Telnyx delivery status events (message.sent / message.finalized). The
// messaging profile's webhook_url normally points at /api/webhooks/telnyx,
// which handles these too; this route stays for per-message webhook_url.
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    if (process.env.TELNYX_PUBLIC_KEY) {
      const valid = getProvider("telnyx").validateWebhook(rawBody, request.headers, "");
      if (!valid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const body = JSON.parse(rawBody);
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

    const { error } = await applyTelnyxStatus(createServiceClient(), update);
    if (error) {
      console.error("Telnyx status update error:", error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telnyx status webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
