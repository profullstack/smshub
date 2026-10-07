import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { findActiveNumber, recordInbound } from "@/lib/inbound";
import { getSiteUrl } from "@/lib/site-url";

const WEBHOOK_RATE_LIMIT = { limit: 100, windowMs: 60 * 1000 };
const EMPTY_TWIML = () =>
  new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

export async function POST(request: Request) {
  try {
    // Rate limit: 100 per minute per IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = checkRateLimit(`webhook:twilio:${ip}`, WEBHOOK_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs || 1000) / 1000)) },
        }
      );
    }

    const rawBody = await request.text();
    const headers = request.headers;
    // Twilio signs the public URL it called; behind the proxy request.url is
    // the container's localhost.
    const incoming = new URL(request.url);
    const url = new URL(incoming.pathname + incoming.search, getSiteUrl()).toString();

    const provider = getProvider("twilio");
    const params: Record<string, string> = {};
    new URLSearchParams(rawBody).forEach((v, k) => {
      params[k] = v;
    });

    const inbound = provider.parseWebhook(params, headers);
    const supabase = createServiceClient();
    const phoneNumber = await findActiveNumber(supabase, inbound.to);

    // Our account's token first, then the bring-your-own account's own token.
    let valid = provider.validateWebhook(rawBody, headers, url);
    if (!valid && phoneNumber) {
      const { data: owner } = await supabase
        .from("providers")
        .select("api_secret")
        .eq("id", phoneNumber.provider_id)
        .maybeSingle();
      if (owner?.api_secret) valid = provider.validateWebhook(rawBody, headers, url, owner.api_secret);
    }
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    if (!phoneNumber) {
      console.error("No phone number found for:", inbound.to);
      return EMPTY_TWIML();
    }

    await recordInbound(supabase, phoneNumber, inbound);
    return EMPTY_TWIML();
  } catch (error) {
    console.error("Twilio webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
