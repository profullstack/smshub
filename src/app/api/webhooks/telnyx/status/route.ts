import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Telnyx delivery status events
const STATUS_MAP: Record<string, string> = {
  "message.sent": "sent",
  "message.delivered": "delivered",
  "message.finalized": "delivered",
  "message.failed": "failed",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const eventType: string = body.data?.event_type || "";
    const mappedStatus = STATUS_MAP[eventType];

    if (!mappedStatus) {
      // Not a delivery status event, acknowledge
      return NextResponse.json({ ok: true });
    }

    const messageId: string = body.data?.payload?.id || body.data?.id || "";

    if (!messageId) {
      return NextResponse.json({ error: "Missing message ID" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("messages")
      .update({ status: mappedStatus })
      .eq("provider_message_id", messageId)
      .eq("provider", "telnyx");

    if (error) {
      console.error("Telnyx status update error:", error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telnyx status webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
