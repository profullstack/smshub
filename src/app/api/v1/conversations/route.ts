import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateApiKey, checkApiKeyRateLimit } from "@/lib/api-auth";

export async function GET(request: Request) {
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

    const supabase = createServiceClient();

    const { data: conversations, error } = await supabase
      .from("conversations")
      .select(`
        *,
        contacts(id, phone, name),
        phone_numbers(id, number, friendly_name)
      `)
      .eq("user_id", auth.userId)
      .order("last_message_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("API v1 conversations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
