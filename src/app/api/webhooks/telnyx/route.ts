import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { applyTelnyxStatus, isTelnyxStatusEvent, parseTelnyxStatusEvent } from "@/lib/providers/telnyx-status";
import { authenticateTelnyxWebhook, numberVariants } from "@/lib/providers/telnyx-webhook-auth";

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
    const body = JSON.parse(rawBody);

    const provider = getProvider("telnyx");
    const supabase = createServiceClient();

    // Each Telnyx account signs with its own key: try the keys of the
    // providers owning the numbers in this event, then the global one.
    const auth = await authenticateTelnyxWebhook(supabase, rawBody, body, headers);
    if (!auth.ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    // The messaging profile sends every event here: delivery outcomes for
    // outbound messages as well as inbound message.received.
    const eventType = body.data?.event_type;
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

    const inbound = provider.parseWebhook(body, headers);

    // Find the phone number this was sent to. When a customer's key signed
    // the event, only that provider's numbers qualify.
    let numberQuery = supabase
      .from("phone_numbers")
      .select("*")
      .in("number", numberVariants([inbound.to]));
    if (auth.providerId) numberQuery = numberQuery.eq("provider_id", auth.providerId);
    const { data: phoneNumbers } = await numberQuery.limit(1);
    const phoneNumber = phoneNumbers?.[0];

    if (!phoneNumber) {
      console.error("No phone number found for:", inbound.to);
      return NextResponse.json({ ok: true });
    }

    const userId = phoneNumber.user_id;

    // Find or create contact
    let { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", userId)
      .eq("phone", inbound.from)
      .single();

    if (!contact) {
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({ user_id: userId, phone: inbound.from })
        .select()
        .single();
      contact = newContact;
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("contact_id", contact!.id)
      .eq("phone_number_id", phoneNumber.id)
      .single();

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          contact_id: contact!.id,
          phone_number_id: phoneNumber.id,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();
      conversation = newConvo;
    }

    // Save message
    await supabase.from("messages").insert({
      conversation_id: conversation!.id,
      direction: "inbound",
      body: inbound.body,
      status: "delivered",
      provider: "telnyx",
      provider_message_id: inbound.providerMessageId,
    });

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation!.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telnyx webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
