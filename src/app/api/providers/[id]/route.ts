import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { isManagedProvider } from "@/lib/managed-numbers/service";

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

    // Check ownership
    const { data: provider } = await serviceClient
      .from("providers")
      .select("id, api_key, metadata")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Deleting it would cascade away the user's rented numbers.
    if (isManagedProvider(provider)) {
      return NextResponse.json({ error: "Rented numbers are managed on the Numbers page" }, { status: 400 });
    }

    // Delete cascades to phone_numbers via FK
    const { error } = await serviceClient
      .from("providers")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete provider error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
