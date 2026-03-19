import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

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
    const { number, provider_id, friendly_name } = body;

    if (!number || !provider_id) {
      return NextResponse.json({ error: "number and provider_id are required" }, { status: 400 });
    }

    // Verify the provider belongs to the user
    const serviceClient = createServiceClient();
    const { data: provider } = await serviceClient
      .from("providers")
      .select("id")
      .eq("id", provider_id)
      .eq("user_id", user.id)
      .single();

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
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

    return NextResponse.json({ phone_number: data }, { status: 201 });
  } catch (error) {
    console.error("Create phone number error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
