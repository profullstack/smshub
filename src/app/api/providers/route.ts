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
      .from("providers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ providers: data });
  } catch (error) {
    console.error("List providers error:", error);
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
    const { type, api_key, api_secret } = body;

    if (!type || !api_key) {
      return NextResponse.json({ error: "type and api_key are required" }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("providers")
      .insert({
        user_id: user.id,
        type,
        api_key,
        api_secret: api_secret || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ provider: data }, { status: 201 });
  } catch (error) {
    console.error("Create provider error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
