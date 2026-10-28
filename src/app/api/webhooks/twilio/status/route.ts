import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { emitDeliveryStatus } from "@/lib/webhooks/events";

// Twilio status callback: updates message delivery status
// Maps Twilio MessageStatus to our internal status enum
const STATUS_MAP: Record<string, string> = {
  queued: "queued",
  sent: "sent",
  delivered: "delivered",
  undelivered: "failed",
  failed: "failed",
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const params: Record<string, string> = {};
    new URLSearchParams(rawBody).forEach((v, k) => {
      params[k] = v;
    });

    const messageSid = params.MessageSid;
    const messageStatus = params.MessageStatus;

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const mappedStatus = STATUS_MAP[messageStatus];
    if (!mappedStatus) {
      // Unknown status, just acknowledge
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("messages")
      .update({ status: mappedStatus })
      .eq("provider_message_id", messageSid)
      .eq("provider", "twilio");

    if (error) {
      console.error("Twilio status update error:", error);
    } else {
      await emitDeliveryStatus(supabase, "twilio", messageSid, mappedStatus);
    }

    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Twilio status webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
