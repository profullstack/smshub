import { isManagedProvider } from "@/lib/managed-numbers/service";
import { isSealedProvider, tryOpenProvider, type ProviderRowLike } from "@/lib/vault/provider-credentials";

/**
 * The Telnyx API key that controls a line's number: the customer's own for a
 * bring-your-own provider, smshub's account key for a rented number. A sealed
 * key opens only while its owner's vault is unlocked; null when locked (select
 * PROVIDER_COLS so a sealed row can be opened).
 */
export function lineApiKey(provider: ProviderRowLike | null | undefined, managed = false): string | null {
  if (!provider || provider.type !== "telnyx") return null;
  if (managed || isManagedProvider(provider)) return process.env.TELNYX_API_KEY || null;
  return tryOpenProvider(provider)?.api_key || null;
}

/** True when the line has a key of the user's own that is sealed and their vault is locked. */
export function lineLocked(provider: ProviderRowLike | null | undefined, managed = false): boolean {
  if (!provider || managed || isManagedProvider(provider)) return false;
  return isSealedProvider(provider) && !tryOpenProvider(provider);
}
