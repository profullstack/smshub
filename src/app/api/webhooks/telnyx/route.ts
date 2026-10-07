import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { applyTelnyxStatus, isTelnyxStatusEvent, parseTelnyxStatusEvent } from "@/lib/providers/telnyx-status";
import { findActiveNumber, recordInbound } from "@/lib/inbound";

const WEBHOOK_RATE_LIMIT = { limit: 100, windowMs: 60 * 1000 };

export async function POST(request: Request) {
  try {
    // Rate limit: 100 per minute per IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = checkRateLimit(`webhook:telnyx:${ip}`, WEBHOOK_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs || 1000) / 1000)) },
        }
      );
    }

    const rawBody = await request.text();
    const headers = request.headers;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const provider = getProvider("telnyx");
    const supabase = createServiceClient();
    const data = body.data as { event_type?: string; payload?: Record<string, unknown> } | undefined;
    const eventType = data?.event_type;

    // Our number on this event: the recipient of an inbound text, the sender of
    // an outbound one's delivery report.
    const payload = data?.payload ?? {};
    const ourNumber =
      eventType === "message.received"
        ? String((payload.to as { phone_number?: string }[] | undefined)?.[0]?.phone_number ?? "")
        : String((payload.from as { phone_number?: string } | undefined)?.phone_number ?? "");
    let phoneNumber: Awaited<ReturnType<typeof findActiveNumber>> | undefined;
    const owner = async () => (phoneNumber ??= await findActiveNumber(supabase, ourNumber));

    // Our own account (managed numbers) signs with TELNYX_PUBLIC_KEY; a
    // bring-your-own account signs with its own key, kept as the provider's
    // api_secret. Nothing is stored until one of them verifies. Outside
    // production with no key configured, local testing skips the check.
    const env = process.env;
    let valid =
      provider.validateWebhook(rawBody, headers, "") ||
      (!env["TELNYX_PUBLIC_KEY"] && env.NODE_ENV !== "production");
    if (!valid && (await owner())) {
      const { data: prov } = await supabase
        .from("providers")
        .select("api_secret")
        .eq("id", phoneNumber!.provider_id)
        .maybeSingle();
      if (prov?.api_secret) valid = provider.validateWebhook(rawBody, headers, "", prov.api_secret);
    }
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    // The messaging profile sends every event here: delivery outcomes for
    // outbound messages as well as inbound message.received.
    if (isTelnyxStatusEvent(eventType)) {
      const update = parseTelnyxStatusEvent(body);
      if (update) {
        const { error } = await applyTelnyxStatus(supabase, update);
        if (error) console.error("Telnyx status update error:", error);
      }
      return NextResponse.json({ ok: true });
    }
    if (eventType !== "message.received") {
      return NextResponse.json({ ok: true });
    }

    const target = await owner();
    if (!target) {
      console.error("No phone number found for:", ourNumber);
      return NextResponse.json({ ok: true });
    }

    await recordInbound(supabase, target, provider.parseWebhook(body, headers));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telnyx webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
