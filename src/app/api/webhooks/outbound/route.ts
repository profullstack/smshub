import { getPlanUsage, limitReached } from "@/lib/plans";
import { isPublicHttpsUrl } from "@/lib/webhooks/url-guard";
import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { generateWebhookSecret } from "@/lib/webhooks/outbound";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: webhooks, error } = await supabase
      .from("user_webhooks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ webhooks });
  } catch (error) {
    console.error("Get webhooks error:", error);
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

    const { url, events } = await request.json();

    if (!url || !events?.length) {
      return NextResponse.json(
        { error: "Missing required fields: url, events" },
        { status: 400 }
      );
    }

    const validEvents = [
      "message.sent",
      "message.received",
      "message.failed",
      "message.delivered",
    ];
    const invalidEvents = (events as string[]).filter(
      (e) => !validEvents.includes(e)
    );
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalidEvents.join(", ")}` },
        { status: 400 }
      );
    }

    if (!(await isPublicHttpsUrl(url))) {
      return NextResponse.json(
        { error: "Webhook URL must be a public https:// address" },
        { status: 400 }
      );
    }

    const limit = limitReached(await getPlanUsage(createServiceClient(), user.id), "webhooks");
    if (limit) {
      return NextResponse.json({ error: limit }, { status: 403 });
    }

    const secret = generateWebhookSecret();

    const { data: webhook, error } = await supabase
      .from("user_webhooks")
      .insert({
        user_id: user.id,
        url,
        events,
        secret,
        active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ webhook }, { status: 201 });
  } catch (error) {
    console.error("Create webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
