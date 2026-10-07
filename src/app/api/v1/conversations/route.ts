import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateApiKey, checkApiKeyRateLimit } from "@/lib/api-auth";
import { lineFilter, listConversations } from "@/lib/conversations";

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

    // ?phone_number_id=<uuid> narrows the list to one line (one of your numbers).
    const phoneNumberId = lineFilter(new URL(request.url).searchParams);
    if (phoneNumberId === undefined) {
      return NextResponse.json({ error: "phone_number_id must be a number id (uuid)" }, { status: 400 });
    }

    const conversations = await listConversations(createServiceClient(), auth.userId, { phoneNumberId });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("API v1 conversations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
