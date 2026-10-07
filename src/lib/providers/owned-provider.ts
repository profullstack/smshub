import type { SupabaseClient } from "@supabase/supabase-js";
import { isManagedProvider } from "@/lib/managed-numbers/service";

export interface OwnedProvider {
  id: string;
  type: string;
  api_key: string;
  api_secret: string | null;
  metadata: Record<string, unknown> | null;
  numbers: string[];
}

/** A provider the user owns, with the numbers saved under it; null if not theirs. */
export async function loadOwnedProvider(
  serviceClient: SupabaseClient,
  userId: string,
  providerId: string
): Promise<OwnedProvider | null> {
  const { data: provider } = await serviceClient
    .from("providers")
    .select("id, type, api_key, api_secret, metadata")
    .eq("id", providerId)
    .eq("user_id", userId)
    .single();
  if (!provider || isManagedProvider(provider)) return null;

  const { data: numbers } = await serviceClient
    .from("phone_numbers")
    .select("number")
    .eq("provider_id", providerId)
    .eq("status", "active");

  return { ...provider, numbers: (numbers ?? []).map((n: { number: string }) => n.number) } as OwnedProvider;
}

/** Telnyx: keep the account's webhook signing key, which lives in api_secret. */
export async function savePublicKey(serviceClient: SupabaseClient, provider: OwnedProvider, publicKey: string) {
  if (provider.type !== "telnyx" || provider.api_secret === publicKey) return;
  await serviceClient.from("providers").update({ api_secret: publicKey }).eq("id", provider.id);
}
