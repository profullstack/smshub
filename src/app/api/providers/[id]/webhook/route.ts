import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { configureTelnyxWebhooks } from "@/lib/providers/telnyx-api";
import { configureTwilioWebhooks, telnyxWebhookUrl } from "@/lib/providers/provider-check";
import { loadOwnedProvider } from "@/lib/providers/owned-provider";
import { toE164 } from "@/lib/providers/phone";

// "Fix webhook": point the provider's numbers at smshub. For Telnyx this
// PATCHes the messaging profiles owning the numbers saved in smshub; with
// force it also takes over a profile whose webhook goes somewhere else.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const serviceClient = createServiceClient();
    const provider = await loadOwnedProvider(serviceClient, user.id, id);
    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    if (provider.type === "telnyx") {
      const onlyNumbers = provider.numbers.map((n) => toE164(n) ?? n);
      const result = await configureTelnyxWebhooks(provider.api_key, telnyxWebhookUrl(), {
        // Never force across the whole account: only numbers saved in smshub.
        force: body.force === true && onlyNumbers.length > 0,
        onlyNumbers,
      });
      return NextResponse.json({ type: "telnyx", ...result });
    }
    if (provider.type === "twilio") {
      const result = await configureTwilioWebhooks({
        type: provider.type,
        apiKey: provider.api_key,
        apiSecret: provider.api_secret,
        numbers: provider.numbers,
      });
      return NextResponse.json({ type: "twilio", ...result });
    }
    return NextResponse.json({ error: "Nothing to configure for this provider" }, { status: 400 });
  } catch (error) {
    console.error("Configure webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
