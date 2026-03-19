import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateApiKey, hashApiKey } from "@/lib/api-auth";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: keys, error } = await supabase
      .from("api_keys")
      .select("id, name, created_at, last_used_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ keys });
  } catch (error) {
    console.error("Get API keys error:", error);
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

    const { name } = await request.json();

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);

    const { data: apiKey, error } = await supabase
      .from("api_keys")
      .insert({
        user_id: user.id,
        key_hash: keyHash,
        name: name || "Default",
      })
      .select("id, name, created_at")
      .single();

    if (error) throw error;

    // Return the raw key ONCE — it can't be retrieved later
    return NextResponse.json(
      { key: { ...apiKey, raw_key: rawKey } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create API key error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
