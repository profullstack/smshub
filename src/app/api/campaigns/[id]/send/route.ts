import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendSMS } from "@/lib/providers";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get campaign with recipients
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select(`
        *,
        phone_numbers(*, providers(*)),
        campaign_recipients(*, contacts(id, phone, name))
      `)
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: "Campaign has already been sent" },
        { status: 400 }
      );
    }

    // Update status to sending
    await supabase
      .from("campaigns")
      .update({ status: "sending" })
      .eq("id", id);

    const phoneNumber = campaign.phone_numbers as {
      number: string;
      providers: { type: string; api_key: string; api_secret: string | null };
    };
    const provider = phoneNumber?.providers;

    if (!provider) {
      await supabase
        .from("campaigns")
        .update({ status: "failed" })
        .eq("id", id);
      return NextResponse.json(
        { error: "Provider not configured" },
        { status: 400 }
      );
    }

    const recipients = (campaign.campaign_recipients || []) as {
      id: string;
      contact_id: string;
      contacts: { id: string; phone: string; name: string | null } | null;
    }[];

    let sentCount = 0;
    let failedCount = 0;

    // Send to each recipient
    for (const recipient of recipients) {
      const phone = recipient.contacts?.phone;
      if (!phone) {
        await supabase
          .from("campaign_recipients")
          .update({ status: "failed", error: "No phone number" })
          .eq("id", recipient.id);
        failedCount++;
        continue;
      }

      try {
        const result = await sendSMS({
          to: phone,
          from: phoneNumber.number,
          body: campaign.message_template,
          provider: provider.type as "twilio" | "telnyx",
          credentials: {
            apiKey: provider.api_key,
            apiSecret: provider.api_secret,
          },
        });

        if (result.success) {
          await supabase
            .from("campaign_recipients")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", recipient.id);
          sentCount++;
        } else {
          await supabase
            .from("campaign_recipients")
            .update({
              status: "failed",
              error: result.error || "Send failed",
            })
            .eq("id", recipient.id);
          failedCount++;
        }
      } catch (error) {
        await supabase
          .from("campaign_recipients")
          .update({
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", recipient.id);
        failedCount++;
      }
    }

    // Update campaign status
    await supabase
      .from("campaigns")
      .update({ status: failedCount === recipients.length ? "failed" : "sent" })
      .eq("id", id);

    return NextResponse.json({
      sent: sentCount,
      failed: failedCount,
      total: recipients.length,
    });
  } catch (error) {
    console.error("Send campaign error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
