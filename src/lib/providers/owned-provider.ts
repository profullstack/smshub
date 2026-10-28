import type { SupabaseClient } from "@supabase/supabase-js";
import { isManagedProvider } from "@/lib/managed-numbers/service";
import { openProvider, PROVIDER_COLS } from "@/lib/vault/provider-credentials";

export interface OwnedProvider {
  id: string;
  type: string;
  api_key: string;
  api_secret: string | null;
  metadata: Record<string, unknown> | null;
  numbers: string[];
}

/**
 * A provider the user owns, with the numbers saved under it and its keys opened;
 * null if not theirs. Throws VaultLockedError when its keys are sealed and locked.
 */
export async function loadOwnedProvider(
  serviceClient: SupabaseClient,
  userId: string,
  providerId: string
): Promise<OwnedProvider | null> {
  const { data: provider } = await serviceClient
    .from("providers")
    .select(PROVIDER_COLS)
    .eq("id", providerId)
    .eq("user_id", userId)
    .single();
  if (!provider || isManagedProvider(provider)) return null;
  const opened = openProvider(provider);

  const { data: numbers } = await serviceClient
    .from("phone_numbers")
    .select("number")
    .eq("provider_id", providerId)
    .eq("status", "active");

  return { ...opened, numbers: (numbers ?? []).map((n: { number: string }) => n.number) } as OwnedProvider;
}

/** Telnyx: keep the account's webhook signing key, which lives in api_secret. */
export async function savePublicKey(serviceClient: SupabaseClient, provider: OwnedProvider, publicKey: string) {
  if (provider.type !== "telnyx" || provider.api_secret === publicKey) return;
  await serviceClient.from("providers").update({ api_secret: publicKey }).eq("id", provider.id);
}
