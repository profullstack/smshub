import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { suggestReply } from "@/lib/ai/auto-reply";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversation_id } = await request.json();

    if (!conversation_id) {
      return NextResponse.json(
        { error: "conversation_id is required" },
        { status: 400 }
      );
    }

    // Verify ownership and get conversation with contact
    const { data: conversation } = await supabase
      .from("conversations")
      .select("*, contacts(id, phone, name)")
      .eq("id", conversation_id)
      .eq("user_id", user.id)
      .single();

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get recent messages
    const { data: messages } = await supabase
      .from("messages")
      .select("direction, body, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages in conversation" },
        { status: 400 }
      );
    }

    const contact = conversation.contacts as { id: string; phone: string; name: string | null } | null;

    const result = await suggestReply({
      messages: messages as { direction: "inbound" | "outbound"; body: string; created_at: string }[],
      contactName: contact?.name,
      contactPhone: contact?.phone,
    });

    return NextResponse.json({ suggestion: result.suggestion });
  } catch (error) {
    console.error("Suggest reply error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
