import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { archived } = body;

    if (typeof archived !== "boolean") {
      return NextResponse.json(
        { error: "Missing required field: archived (boolean)" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("conversations")
      .update({ archived })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ conversation: data });
  } catch (error) {
    console.error("Update conversation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const url = new URL(request.url);
    const hard = url.searchParams.get("hard") === "true";

    if (hard) {
      // Hard delete: remove messages first, then conversation
      await supabase.from("messages").delete().eq("conversation_id", id);
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    } else {
      // Soft delete: just archive
      const { error } = await supabase
        .from("conversations")
        .update({ archived: true })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete conversation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
