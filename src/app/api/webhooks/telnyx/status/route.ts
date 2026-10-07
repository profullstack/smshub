import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/providers";
import { applyTelnyxStatus, parseTelnyxStatusEvent } from "@/lib/providers/telnyx-status";
import { findActiveNumber } from "@/lib/inbound";
import { telnyxProviderPublicKey } from "@/lib/providers/telnyx-webhook-auth";

// Telnyx delivery status events (message.sent / message.finalized). The
// messaging profile's webhook_url normally points at /api/webhooks/telnyx,
// which handles these too; this route stays for per-message webhook_url.
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Our account signs with TELNYX_PUBLIC_KEY; a bring-your-own account with
    // its own key, found through the sending number's provider.
    if (process.env.TELNYX_PUBLIC_KEY) {
      const provider = getProvider("telnyx");
      let valid = provider.validateWebhook(rawBody, request.headers, "");
      if (!valid) {
        const payload = (body.data as { payload?: { from?: { phone_number?: string } } } | undefined)?.payload;
        const supabase = createServiceClient();
        const sender = await findActiveNumber(supabase, String(payload?.from?.phone_number ?? ""));
        const key = sender ? await telnyxProviderPublicKey(supabase, sender.provider_id) : null;
        if (key) valid = provider.validateWebhook(rawBody, request.headers, "", key);
      }
      if (!valid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const data = body.data as { event_type?: string; payload?: { id?: string } } | undefined;
    const eventType: string = data?.event_type || "";
    if (!eventType.startsWith("message.") || eventType === "message.received") {
      return NextResponse.json({ ok: true });
    }

    if (!data?.payload?.id) {
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
