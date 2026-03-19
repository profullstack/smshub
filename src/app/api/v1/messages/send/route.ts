import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateApiKey, checkApiKeyRateLimit } from "@/lib/api-auth";
import { sendSMS } from "@/lib/providers";

export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (!auth) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const rateLimit = checkApiKeyRateLimit(auth.keyId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimit.retryAfterMs || 1000) / 1000)),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const body = await request.json();
    const { to, from: fromNumber, message } = body;

    if (!to || !fromNumber || !message) {
      return NextResponse.json(
        { error: "Missing required fields: to, from, message" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Get phone number owned by the user
    const { data: phoneNumber } = await supabase
      .from("phone_numbers")
      .select("*, providers(*)")
      .eq("number", fromNumber)
      .eq("user_id", auth.userId)
      .single();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number not found or not owned by you" },
        { status: 404 }
      );
    }

    const provider = phoneNumber.providers as {
      type: string;
      api_key: string;
      api_secret: string | null;
    };

    // Find or create contact
    let { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", auth.userId)
      .eq("phone", to)
      .single();

    if (!contact) {
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({ user_id: auth.userId, phone: to })
        .select()
        .single();
      contact = newContact;
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", auth.userId)
      .eq("contact_id", contact!.id)
      .eq("phone_number_id", phoneNumber.id)
      .single();

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({
          user_id: auth.userId,
          contact_id: contact!.id,
          phone_number_id: phoneNumber.id,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();
      conversation = newConvo;
    }

    // Send via provider
    const result = await sendSMS({
      to,
      from: phoneNumber.number,
      body: message,
      provider: provider.type as "twilio" | "telnyx",
      credentials: {
        apiKey: provider.api_key,
        apiSecret: provider.api_secret,
      },
    });

    if (!result.success) {
      await supabase.from("messages").insert({
        conversation_id: conversation!.id,
        direction: "outbound",
        body: message,
        status: "failed",
        provider: provider.type,
      });
      return NextResponse.json(
        { error: result.error || "Send failed" },
        { status: 500 }
      );
    }

    const { data: savedMessage } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation!.id,
        direction: "outbound",
        body: message,
        status: "sent",
        provider: provider.type,
        provider_message_id: result.messageId || null,
      })
      .select()
      .single();

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation!.id);

    return NextResponse.json({
      message: savedMessage,
      headers: { "X-RateLimit-Remaining": String(rateLimit.remaining) },
    });
  } catch (error) {
    console.error("API v1 send error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
