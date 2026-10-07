import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { isManagedProvider } from "@/lib/managed-numbers/service";
import { getPlanUsage, limitReached } from "@/lib/plans";
import { normalizeE164 } from "@/lib/phone";
import { configureTelnyxWebhooks } from "@/lib/providers/telnyx-api";
import { telnyxWebhookUrl } from "@/lib/providers/provider-check";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("phone_numbers")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ phone_numbers: data });
  } catch (error) {
    console.error("List phone numbers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { provider_id, friendly_name } = body;
    const number = normalizeE164(body.number);

    if (!body.number || !provider_id) {
      return NextResponse.json({ error: "number and provider_id are required" }, { status: 400 });
    }
    if (!number) {
      return NextResponse.json(
        { error: "Enter the number in international format, e.g. +14155550123" },
        { status: 400 }
      );
    }

    // Verify the provider belongs to the user
    const serviceClient = createServiceClient();
    const { data: provider } = await serviceClient
      .from("providers")
      .select("id, type, api_key, metadata")
      .eq("id", provider_id)
      .eq("user_id", user.id)
      .single();

    if (!provider || isManagedProvider(provider)) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const plan = await getPlanUsage(serviceClient, user.id);
    const limit = limitReached(plan, "byoNumbers");
    if (limit) {
      return NextResponse.json({ error: limit }, { status: 403 });
    }

    // Inbound texts are routed by number, so a number has one owner at a time.
    const { data: taken } = await serviceClient
      .from("phone_numbers")
      .select("id")
      .eq("number", number)
      .eq("status", "active")
      .limit(1);
    if (taken?.length) {
      return NextResponse.json({ error: "That number is already connected to an account" }, { status: 409 });
    }

    const { data, error } = await serviceClient
      .from("phone_numbers")
      .insert({
        user_id: user.id,
        provider_id,
        number,
        friendly_name: friendly_name || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Telnyx: make sure this number's messaging profile sends webhooks here.
    // A profile already pointing elsewhere is reported, not overwritten.
    if (provider.type === "telnyx") {
      const webhook = await configureTelnyxWebhooks(provider.api_key, telnyxWebhookUrl(), { onlyNumbers: [number] });
      return NextResponse.json({ phone_number: data, webhook }, { status: 201 });
    }

    return NextResponse.json({ phone_number: data }, { status: 201 });
  } catch (error) {
    console.error("Create phone number error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
