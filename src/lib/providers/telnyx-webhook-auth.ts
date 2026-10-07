import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTelnyxPublicKey } from "./telnyx-api";

/**
 * The Ed25519 key a bring-your-own Telnyx account signs its webhooks with,
 * kept as the provider's api_secret. Providers saved before smshub fetched it
 * automatically have none: fetch it once with their API key and keep it, so
 * their webhooks stop being refused without the user doing anything.
 */
export async function telnyxProviderPublicKey(db: SupabaseClient, providerId: string): Promise<string | null> {
  const { data: prov } = await db
    .from("providers")
    .select("type, api_key, api_secret")
    .eq("id", providerId)
    .maybeSingle();
  if (!prov || prov.type !== "telnyx") return null;
  if (prov.api_secret) return prov.api_secret;
  if (!prov.api_key) return null;

  const fetched = await fetchTelnyxPublicKey(prov.api_key);
  if (!fetched.ok) return null;
  await db.from("providers").update({ api_secret: fetched.data }).eq("id", providerId);
  return fetched.data;
}
