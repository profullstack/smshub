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

    const { data: contacts, error } = await supabase
      .from("contacts")
      .select("phone, name")
      .eq("user_id", user.id)
      .order("name", { ascending: true });

    if (error) throw error;

    // Build CSV
    const lines = ["phone,name"];
    for (const c of contacts || []) {
      const name = (c.name || "").replace(/"/g, '""');
      const phone = (c.phone || "").replace(/"/g, '""');
      lines.push(`"${phone}","${name}"`);
    }

    const csv = lines.join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="contacts.csv"',
      },
    });
  } catch (error) {
    console.error("Export contacts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
