import { isManagedProvider } from "@/lib/managed-numbers/service";

/**
 * The Telnyx API key that controls a line's number: the customer's own for a
 * bring-your-own provider, smshub's account key for a rented number.
 */
export function lineApiKey(
  provider: { type?: string | null; api_key?: string | null; metadata?: unknown } | null | undefined,
  managed = false
): string | null {
  if (!provider || provider.type !== "telnyx") return null;
  if (managed || isManagedProvider(provider)) return process.env.TELNYX_API_KEY || null;
  return provider.api_key || null;
}
