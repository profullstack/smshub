import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { telnyxProviderPublicKey } from "@/lib/providers/telnyx-webhook-auth";
import { lineApiKey } from "@/lib/lines/credentials";
import { decodeState, telnyxCallCommand } from "@/lib/voice/telnyx-voice";
import { handleCallEvent, type CallState } from "@/lib/voice/ivr";

const WEBHOOK_RATE_LIMIT = { limit: 200, windowMs: 60 * 1000 };

type LineRow = {
  id: string;
  user_id: string;
  number: string;
  provider_id: string;
  managed: boolean | null;
  providers: { type: string; api_key: string | null; metadata: unknown } | null;
};

const LINE_COLUMNS = "id, user_id, number, provider_id, managed, providers(type, api_key, metadata)";

/**
 * Telnyx Call Control events for numbers whose voice connection is the
 * "smshub voice menu" application. See src/lib/voice/ivr.ts for the flow.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = checkRateLimit(`webhook:telnyx-voice:${ip}`, WEBHOOK_RATE_LIMIT);
    if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

    const rawBody = await request.text();
    let body: { data?: { event_type?: string; payload?: Record<string, unknown> } };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const eventType = String(body.data?.event_type ?? "");
    const payload = body.data?.payload ?? {};
    const state = decodeState(payload.client_state) as CallState | null;

    // Which line: the one we put in client_state, or for a new call the number dialled.
    const db = createServiceClient();
    let line: LineRow | null = null;
    if (typeof state?.l === "string" && /^[0-9a-f-]{36}$/i.test(state.l)) {
      const { data } = await db.from("phone_numbers").select(LINE_COLUMNS).eq("id", state.l).eq("status", "active").maybeSingle();
      line = data as unknown as LineRow | null;
    } else if (eventType === "call.initiated" && typeof payload.to === "string") {
      const { data } = await db
        .from("phone_numbers")
        .select(LINE_COLUMNS)
        .eq("number", payload.to)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      line = data as unknown as LineRow | null;
    }

    // Same signing rule as SMS: our account's key, else the line owner's own key.
    const provider = getProvider("telnyx");
    const env = process.env;
    let valid =
      provider.validateWebhook(rawBody, request.headers, "") ||
      (!env["TELNYX_PUBLIC_KEY"] && env.NODE_ENV !== "production");
    if (!valid && line) {
      const key = await telnyxProviderPublicKey(db, line.provider_id);
      if (key) valid = provider.validateWebhook(rawBody, request.headers, "", key);
    }
    if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    if (!line) return NextResponse.json({ ok: true, result: "no line" });

    const apiKey = lineApiKey(line.providers, Boolean(line.managed));
    if (!apiKey) return NextResponse.json({ ok: true, result: "no Telnyx key for this line" });

    const result = await handleCallEvent(
      { db, command: telnyxCallCommand(apiKey) },
      { id: line.id, user_id: line.user_id, number: line.number },
      { event_type: eventType, payload },
      state
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Telnyx voice webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
