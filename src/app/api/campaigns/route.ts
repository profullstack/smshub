import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: campaigns, error } = await supabase
      .from("campaigns")
      .select(`
        *,
        phone_numbers(id, number, friendly_name),
        campaign_recipients(id, status)
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Compute stats
    const campaignsWithStats = (campaigns || []).map((c) => {
      const recipients = (c.campaign_recipients as { id: string; status: string }[]) || [];
      return {
        ...c,
        campaign_recipients: undefined,
        total_recipients: recipients.length,
        sent_count: recipients.filter((r) => r.status === "sent").length,
        failed_count: recipients.filter((r) => r.status === "failed").length,
        pending_count: recipients.filter((r) => r.status === "pending").length,
      };
    });

    return NextResponse.json({ campaigns: campaignsWithStats });
  } catch (error) {
    console.error("Get campaigns error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
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

    const { name, message_template, phone_number_id, contact_ids } =
      await request.json();

    if (!name || !message_template || !phone_number_id || !contact_ids?.length) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: name, message_template, phone_number_id, contact_ids",
        },
        { status: 400 }
      );
    }

    // Verify phone number ownership
    const { data: phoneNumber } = await supabase
      .from("phone_numbers")
      .select("id")
      .eq("id", phone_number_id)
      .eq("user_id", user.id)
      .single();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number not found" },
        { status: 404 }
      );
    }

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        user_id: user.id,
        name,
        message_template,
        phone_number_id,
        status: "draft",
      })
      .select()
      .single();

    if (campaignError) throw campaignError;

    // Add recipients
    const recipients = (contact_ids as string[]).map((contact_id: string) => ({
      campaign_id: campaign.id,
      contact_id,
      status: "pending" as const,
    }));

    const { error: recipientError } = await supabase
      .from("campaign_recipients")
      .insert(recipients);

    if (recipientError) throw recipientError;

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("Create campaign error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
