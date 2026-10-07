import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { isManagedProvider } from "@/lib/managed-numbers/service";
import { MANAGED_API_KEY } from "@/lib/providers";

function maskSecret(s: string): string {
  return s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : `${s.slice(0, 4)}…`;
}

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

    // The row that holds rented numbers is internal; secrets never go back to the browser.
    const providers = (data ?? [])
      .filter((p) => !isManagedProvider(p))
      .map((p) => ({ ...p, api_key: maskSecret(p.api_key), api_secret: p.api_secret ? "set" : null }));

    return NextResponse.json({ providers });
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
    if (!["twilio", "telnyx", "phonenumbers-bot"].includes(type)) {
      return NextResponse.json({ error: "type must be twilio, telnyx or phonenumbers-bot" }, { status: 400 });
    }
    if (api_key === MANAGED_API_KEY) {
      return NextResponse.json({ error: "Invalid api_key" }, { status: 400 });
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

    return NextResponse.json(
      { provider: { ...data, api_key: maskSecret(data.api_key), api_secret: data.api_secret ? "set" : null } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create provider error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
