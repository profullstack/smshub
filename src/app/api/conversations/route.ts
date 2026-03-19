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

    const { data: conversations, error } = await supabase
      .from("conversations")
      .select(
        `
        *,
        contacts (id, phone, name),
        phone_numbers (id, number, friendly_name),
        messages (id, body, direction, status, created_at)
      `
      )
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(1, { referencedTable: "messages" });

    if (error) throw error;

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("Get conversations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
