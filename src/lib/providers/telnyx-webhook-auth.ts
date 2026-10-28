import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTelnyxPublicKey } from "./telnyx-api";

/** A raw 32-byte Ed25519 key or its 44-byte DER SPKI form, base64-encoded. */
export function looksLikeEd25519Key(value: string | null | undefined): value is string {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.trim())) return false;
  const len = Buffer.from(value.trim(), "base64").length;
  return len === 32 || len === 44;
}

/**
 * The Ed25519 key a bring-your-own Telnyx account signs its webhooks with,
 * kept as the provider's api_secret. Providers saved before smshub fetched it
 * automatically have none, or whatever was typed into "API Secret": fetch it
 * once with their API key and keep it, so their webhooks stop being refused
 * without the user doing anything.
 */
export async function telnyxProviderPublicKey(db: SupabaseClient, providerId: string): Promise<string | null> {
  const { data: prov } = await db
    .from("providers")
    .select("id, user_id, type, api_key, api_secret, metadata, seal_version, sealed_credentials")
    .eq("id", providerId)
    .maybeSingle();
  if (!prov || prov.type !== "telnyx") return null;
  if (looksLikeEd25519Key(prov.api_secret)) return prov.api_secret;
  // Fetching needs the API key; a sealed one opens only while its owner is unlocked.
  const { tryOpenProvider } = await import("@/lib/vault/provider-credentials");
  const apiKey = tryOpenProvider(prov)?.api_key;
  if (!apiKey || apiKey === "__managed__") return null;

  const fetched = await fetchTelnyxPublicKey(apiKey);
  if (!fetched.ok) return null;
  await db.from("providers").update({ api_secret: fetched.data }).eq("id", providerId);
  return fetched.data;
}
