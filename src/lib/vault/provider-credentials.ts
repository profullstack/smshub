/**
 * Bring-your-own provider credentials (Twilio / Telnyx / phonenumbers.bot keys).
 *
 * seal_version 2: api_key holds the SEALED_API_KEY placeholder, the real key (and
 * any real secret) is in sealed_credentials under the user's vault DEK. They open
 * only while the user has an unlocked session in this process.
 *
 * seal_version 0 (legacy): stored in plaintext before 2026-10-28. Still usable
 * until LEGACY_KEY_MIGRATION=off, and sealed in place the first time the user
 * unlocks their vault (POST /api/vault/migrate). Nothing here falls back to
 * smshub's own env keys for a user's line; rented (managed) numbers are handled
 * by their callers as before.
 *
 * Telnyx: api_secret holds the account's Ed25519 webhook PUBLIC key, which is not
 * a secret and is needed to verify inbound webhooks while the user is away, so it
 * stays readable. Anything else typed into "API Secret" is sealed.
 */
import { MANAGED_API_KEY } from "@/lib/providers";
import { looksLikeEd25519Key } from "@/lib/providers/telnyx-webhook-auth";
import { isCipherBlob, providerAad, SEAL_VERSION, type CipherBlob } from "./seal-format";
import { sealJson, unsealJson } from "./server-seal";
import { getSessionKey } from "./unlock-store";

export const SEALED_API_KEY = "__sealed__";

/** Columns every provider read needs so a sealed row can be opened. */
export const PROVIDER_COLS = "id, user_id, type, api_key, api_secret, metadata, seal_version, sealed_credentials";

export const LOCKED_MESSAGE = "locked: your smshub key vault is locked. Unlock it in Settings (or `smshub-cli vault unlock`) to resume sending.";

export class VaultLockedError extends Error {
  readonly code = "vault_locked";
  readonly status = 423;
  constructor(message = LOCKED_MESSAGE) {
    super(message);
    this.name = "VaultLockedError";
  }
}

export interface ProviderRowLike {
  id?: string | null;
  user_id?: string | null;
  type?: string | null;
  api_key?: string | null;
  api_secret?: string | null;
  metadata?: unknown;
  seal_version?: number | null;
  sealed_credentials?: unknown;
}

interface SealedPayload {
  api_key: string;
  api_secret: string | null;
}

/** Read at call time, never inlined at build. Anything but "off" keeps legacy rows usable. */
export function legacyMigrationEnabled(): boolean {
  const env = process.env as Record<string, string | undefined>;
  return (env["LEGACY_KEY_MIGRATION"] ?? "on").trim().toLowerCase() !== "off";
}

export function isSealedProvider(p: ProviderRowLike | null | undefined): boolean {
  return !!p && (p.api_key === SEALED_API_KEY || (p.seal_version ?? 0) >= SEAL_VERSION);
}

export function isLegacyPlaintextProvider(p: ProviderRowLike | null | undefined): boolean {
  return !!p && !!p.api_key && p.api_key !== MANAGED_API_KEY && !isSealedProvider(p);
}

/**
 * The provider row with its real api_key / api_secret filled in.
 * Managed rows come back unchanged. Throws VaultLockedError when the row is
 * sealed and the owner has no unlocked session, or is legacy plaintext after the
 * cutoff.
 */
export function openProvider<T extends ProviderRowLike>(row: T): T {
  if (!row || row.api_key === MANAGED_API_KEY) return row;
  if (!isSealedProvider(row)) {
    if (!legacyMigrationEnabled()) {
      throw new VaultLockedError("locked: these provider keys were stored before sealing and must be re-entered. Open Settings, unlock your key vault and re-enter them.");
    }
    return row;
  }
  if (!row.id || !row.user_id || !isCipherBlob(row.sealed_credentials)) {
    throw new VaultLockedError("locked: these provider keys need to be re-entered (Settings > Bring Your Own Provider).");
  }
  const dek = getSessionKey(row.user_id);
  if (!dek) throw new VaultLockedError();
  const payload = unsealJson<SealedPayload>(dek, row.sealed_credentials as CipherBlob, providerAad(row.user_id, row.id));
  return {
    ...row,
    api_key: payload.api_key,
    api_secret: payload.api_secret ?? (looksLikeEd25519Key(row.api_secret) ? row.api_secret : null),
  };
}

/** openProvider, but null instead of throwing (for paths that already treat "no key" as "skip"). */
export function tryOpenProvider<T extends ProviderRowLike>(row: T | null | undefined): T | null {
  if (!row) return null;
  try {
    return openProvider(row);
  } catch (e) {
    if (e instanceof VaultLockedError) return null;
    throw e;
  }
}

export function maskSecret(s: string): string {
  return s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : `${s.slice(0, 4)}…`;
}

/**
 * The columns to write for a sealed provider row. `dek` is the user's unlocked
 * session key. Nothing secret is left in a plaintext column.
 */
export function sealedProviderColumns(
  dek: Uint8Array,
  userId: string,
  providerId: string,
  type: string,
  creds: { api_key: string; api_secret: string | null }
): { api_key: string; api_secret: string | null; api_key_hint: string; seal_version: number; sealed_credentials: CipherBlob } {
  const publicKey = type === "telnyx" && looksLikeEd25519Key(creds.api_secret) ? creds.api_secret!.trim() : null;
  const payload: SealedPayload = { api_key: creds.api_key, api_secret: publicKey ? null : creds.api_secret || null };
  return {
    api_key: SEALED_API_KEY,
    api_secret: publicKey,
    api_key_hint: maskSecret(creds.api_key),
    seal_version: SEAL_VERSION,
    sealed_credentials: sealJson(dek, payload, providerAad(userId, providerId)),
  };
}
