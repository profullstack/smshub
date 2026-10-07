import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { cleanLineName, isUuid, MAX_LINE_NAME } from "@/lib/conversations";

/**
 * Renames a line: sets the number's friendly_name ("Mom", "Kid's phone").
 * Runs on the caller's session so RLS applies, and only the owner may rename;
 * a teammate who can see a shared number gets a 404 like anyone else.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const friendlyName = cleanLineName(body?.friendly_name);
    if (friendlyName === undefined) {
      return NextResponse.json(
        { error: `friendly_name must be text of at most ${MAX_LINE_NAME} characters` },
        { status: 400 }
      );
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

    const { data: phoneNumber, error } = await supabase
      .from("phone_numbers")
      .update({ friendly_name: friendlyName })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, number, friendly_name")
      .maybeSingle();

    if (error) throw error;
    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

    return NextResponse.json({ phone_number: phoneNumber });
  } catch (error) {
    console.error("Rename phone number error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
