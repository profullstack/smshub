import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { isManagedProvider } from "@/lib/managed-numbers/service";
import { LOCKED_MESSAGE, sealedProviderColumns } from "@/lib/vault/provider-credentials";
import { getSessionKey } from "@/lib/vault/unlock-store";
import { fetchTelnyxPublicKey } from "@/lib/providers/telnyx-api";

export const runtime = "nodejs";

/**
 * Re-enter a provider's keys (after a vault reset, the legacy cutoff, or a key
 * rotation at Twilio/Telnyx). Sealed under the unlocked vault; numbers stay put.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dek = getSessionKey(user.id);
  if (!dek) return NextResponse.json({ error: LOCKED_MESSAGE, code: "vault_locked" }, { status: 423 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { api_key?: unknown; api_secret?: unknown };
  const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
  if (!apiKey) return NextResponse.json({ error: "api_key is required" }, { status: 400 });
  let apiSecret = typeof body.api_secret === "string" && body.api_secret.trim() ? body.api_secret.trim() : null;

  const db = createServiceClient();
  const { data: provider } = await db.from("providers").select("id, type, api_key, metadata").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  if (isManagedProvider(provider)) return NextResponse.json({ error: "Rented numbers have no keys of yours" }, { status: 400 });

  if (provider.type === "telnyx" && !apiSecret) {
    const key = await fetchTelnyxPublicKey(apiKey);
    if (!key.ok && (key.error.status === 401 || key.error.status === 403)) {
      return NextResponse.json({ error: `Telnyx rejected this API key: ${key.error.message}` }, { status: 400 });
    }
    apiSecret = key.ok ? key.data : null;
  }

  const { error } = await db
    .from("providers")
    .update(sealedProviderColumns(dek, user.id, provider.id, provider.type, { api_key: apiKey, api_secret: apiSecret }))
    .eq("id", provider.id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not save the keys" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
