import type { SupabaseClient } from "@supabase/supabase-js";

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
  if (!provider) return null;

  const { data: numbers } = await serviceClient
    .from("phone_numbers")
    .select("number")
    .eq("provider_id", providerId);

  return { ...provider, numbers: (numbers ?? []).map((n: { number: string }) => n.number) } as OwnedProvider;
}

export async function savePublicKey(serviceClient: SupabaseClient, provider: OwnedProvider, publicKey: string) {
  if (provider.metadata?.public_key === publicKey) return;
  await serviceClient
    .from("providers")
    .update({ metadata: { ...(provider.metadata ?? {}), public_key: publicKey } })
    .eq("id", provider.id);
}
