import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GROUPCALL_API_KEY_NAME } from "@/lib/groupcall";

export const dynamic = "force-dynamic";

/** Connection status only; the integration credential is never returned. */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, created_at")
    .eq("user_id", user.id)
    .eq("name", GROUPCALL_API_KEY_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });

  return NextResponse.json({ connected: Boolean(data), connected_at: data?.created_at ?? null }, {
    headers: { "cache-control": "no-store" },
  });
}
