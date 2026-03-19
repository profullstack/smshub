import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendSMS } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";

const SEND_RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BulkResult {
  to: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit check
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
    const { recipients, phoneNumberId, message, mediaUrl } = body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: recipients (array of phone numbers)" },
        { status: 400 }
      );
    }

    if (!phoneNumberId || !message) {
      return NextResponse.json(
        { error: "Missing required fields: phoneNumberId, message" },
        { status: 400 }
      );
    }

    if (recipients.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 recipients per bulk send" },
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

    const results: BulkResult[] = [];

    for (const to of recipients) {
      // Small delay between sends to avoid provider rate limits
      if (results.length > 0) {
        await sleep(200);
      }

      try {
        // Find or create contact
        let { data: contact } = await supabase
          .from("contacts")
          .select("*")
          .eq("user_id", user.id)
          .eq("phone", to)
          .single();

        if (!contact) {
          const { data: newContact } = await supabase
            .from("contacts")
            .insert({ user_id: user.id, phone: to })
            .select()
            .single();
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
          const { data: newConvo } = await supabase
            .from("conversations")
            .insert({
              user_id: user.id,
              contact_id: contact!.id,
              phone_number_id: phoneNumberId,
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single();
          conversation = newConvo;
        }

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

        // Save message
        await supabase.from("messages").insert({
          conversation_id: conversation!.id,
          direction: "outbound",
          body: message,
          status: result.success ? "sent" : "failed",
          provider: providerData.type,
          provider_message_id: result.messageId || null,
          media_url: mediaUrl || null,
        });

        // Update conversation timestamp
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversation!.id);

        results.push({
          to,
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        });
      } catch (err) {
        results.push({
          to,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      total: results.length,
      sent: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error("Bulk send error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
