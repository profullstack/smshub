import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendSMS } from "@/lib/providers";
import { withRetry } from "@/lib/retry";
import { checkRateLimit } from "@/lib/rate-limit";

const SEND_RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 10 sends per minute per user
    const rl = checkRateLimit(`send:${user.id}`, SEND_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rl.retryAfterMs || 1000) / 1000)),
          },
        }
      );
    }

    const body = await request.json();
    const { to, phoneNumberId, message, mediaUrl } = body;

    if (!to || !phoneNumberId || !message) {
      return NextResponse.json(
        { error: "Missing required fields: to, phoneNumberId, message" },
        { status: 400 }
      );
    }

    // Get phone number
    const { data: phoneNumber, error: phoneError } = await supabase
      .from("phone_numbers")
      .select("*")
      .eq("id", phoneNumberId)
      .single();

    if (phoneError || !phoneNumber) {
      return NextResponse.json(
        { error: "Phone number not found" },
        { status: 404 }
      );
    }

    // Get provider
    const { data: providerData, error: providerError } = await supabase
      .from("providers")
      .select("*")
      .eq("id", phoneNumber.provider_id)
      .single();

    if (providerError || !providerData) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    // Find or create contact
    let { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", user.id)
      .eq("phone", to)
      .single();

    if (!contact) {
      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({ user_id: user.id, phone: to })
        .select()
        .single();
      if (contactError) throw contactError;
      contact = newContact;
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", user.id)
      .eq("contact_id", contact!.id)
      .eq("phone_number_id", phoneNumberId)
      .single();

    if (!conversation) {
      const { data: newConvo, error: convoError } = await supabase
        .from("conversations")
        .insert({
          user_id: user.id,
          contact_id: contact!.id,
          phone_number_id: phoneNumberId,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (convoError) throw convoError;
      conversation = newConvo;
    }

    // Send via provider with retry logic
    const retryResult = await withRetry(
      async () => {
        const result = await sendSMS({
          to,
          from: phoneNumber.number,
          body: message,
          provider: providerData.type,
          credentials: {
            apiKey: providerData.api_key,
            apiSecret: providerData.api_secret,
          },
          mediaUrl,
        });
        if (!result.success) {
          throw new Error(result.error || "Send failed");
        }
        return result;
      },
      { maxAttempts: 3, baseDelayMs: 1000 }
    );

    if (!retryResult.success) {
      // Save as failed with retry count
      await supabase.from("messages").insert({
        conversation_id: conversation!.id,
        direction: "outbound",
        body: message,
        status: "failed",
        provider: providerData.type,
        retry_count: retryResult.attempts,
        media_url: mediaUrl || null,
      });

      return NextResponse.json(
        { error: retryResult.error || "Send failed", retryAttempts: retryResult.attempts },
        { status: 500 }
      );
    }

    // Save message
    const { data: savedMessage, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation!.id,
        direction: "outbound",
        body: message,
        status: "sent",
        provider: providerData.type,
        provider_message_id: retryResult.data?.messageId || null,
        retry_count: retryResult.attempts - 1, // successful on Nth attempt = N-1 retries
        media_url: mediaUrl || null,
      })
      .select()
      .single();

    if (msgError) throw msgError;

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation!.id);

    return NextResponse.json({ message: savedMessage });
  } catch (error) {
    console.error("Send SMS error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
