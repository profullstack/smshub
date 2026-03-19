import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name } = body;

    if (name !== undefined && name !== null && typeof name !== "string") {
      return NextResponse.json({ error: "name must be a string or null" }, { status: 400 });
    }

    const { data: contact, error } = await supabase
      .from("contacts")
      .update({ name: name ?? null })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error("Update contact error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
