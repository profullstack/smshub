import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const serviceClient = createServiceClient();

    const { data: phoneNumber } = await serviceClient
      .from("phone_numbers")
      .select("id, managed")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

    // A rented number is paid for until it expires; it is released by the sweep.
    if (phoneNumber.managed) {
      return NextResponse.json(
        { error: "Rented numbers stay yours until they expire" },
        { status: 400 }
      );
    }

    const { error } = await serviceClient
      .from("phone_numbers")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete phone number error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
