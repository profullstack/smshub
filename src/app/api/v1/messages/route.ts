import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateApiKey, checkApiKeyRateLimit } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiKey(request);
    if (!auth) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const rateLimit = checkApiKeyRateLimit(auth.keyId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const conversationId = request.nextUrl.searchParams.get("conversation_id");
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversation_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Verify user owns this conversation
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", auth.userId)
      .single();

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("API v1 messages error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
