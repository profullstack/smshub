import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { testProvider } from "@/lib/providers/provider-check";
import { loadOwnedProvider, savePublicKey } from "@/lib/providers/owned-provider";

// A test can send a real SMS, so keep it to a few a minute per user.
const TEST_RATE_LIMIT = { limit: 6, windowMs: 60 * 1000 };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = checkRateLimit(`provider-test:${user.id}`, TEST_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many tests, wait a minute" }, { status: 429 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { to?: string; from?: string };
    const serviceClient = createServiceClient();
    const provider = await loadOwnedProvider(serviceClient, user.id, id);
    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const result = await testProvider({
      type: provider.type,
      apiKey: provider.api_key,
      apiSecret: provider.api_secret,
      numbers: provider.numbers,
      testTo: body.to?.trim() || null,
      testFrom: body.from?.trim() || null,
    });
    if (result.publicKey) await savePublicKey(serviceClient, provider, result.publicKey);

    return NextResponse.json({ ok: result.ok, checks: result.checks });
  } catch (error) {
    console.error("Test provider error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
