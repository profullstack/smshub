import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/providers";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const headers = request.headers;
    const body = JSON.parse(rawBody);

    const provider = getProvider("telnyx");

    // Validate webhook signature (skip in dev if no public key)
    if (process.env.TELNYX_PUBLIC_KEY) {
      const valid = provider.validateWebhook(rawBody, headers, "");
      if (!valid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    // Only process message.received events
    const eventType = body.data?.event_type;
    if (eventType !== "message.received") {
      return NextResponse.json({ ok: true });
    }

    const inbound = provider.parseWebhook(body, headers);
    const supabase = createServiceClient();

    // Find the phone number this was sent to
    const { data: phoneNumber } = await supabase
      .from("phone_numbers")
      .select("*")
      .eq("number", inbound.to)
      .single();

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
