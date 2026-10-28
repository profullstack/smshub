/**
 * Key vault operations shared by the API routes (web session or API key / CLI).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MANAGED_API_KEY } from "@/lib/providers";
import { isSealRecord, type SealRecord } from "./seal-format";
import { dekMatchesSeal } from "./server-seal";
import { getSessionKey, lockSession, sessionStatus, unlockSession } from "./unlock-store";
import { isLegacyPlaintextProvider, legacyMigrationEnabled, SEALED_API_KEY, sealedProviderColumns } from "./provider-credentials";

export async function loadSeal(db: SupabaseClient, userId: string): Promise<SealRecord | null> {
  const { data } = await db.from("user_vaults").select("seal").eq("user_id", userId).maybeSingle();
  const seal = (data as { seal?: unknown } | null)?.seal;
  return isSealRecord(seal) ? seal : null;
}

export async function vaultStatus(db: SupabaseClient, userId: string) {
  const seal = await loadSeal(db, userId);
  const { data: rows } = await db
    .from("providers")
    .select("id, api_key, seal_version, sealed_credentials")
    .eq("user_id", userId);
  const list = (rows ?? []) as Array<{ api_key: string; seal_version: number | null; sealed_credentials: unknown }>;
  const legacy = list.filter((p) => isLegacyPlaintextProvider(p)).length;
  const sealed = list.filter((p) => p.api_key === SEALED_API_KEY && p.sealed_credentials).length;
  const needsReentry = list.filter((p) => p.api_key === SEALED_API_KEY && !p.sealed_credentials).length;
  const session = sessionStatus(userId);
  return {
    user_id: userId,
    exists: !!seal,
    seal,
    state: !seal ? "no_vault" : session.unlocked ? "unlocked" : "locked",
    unlocked: session.unlocked,
    expires_at: session.expiresAt,
    unlocked_at: session.unlockedAt,
    providers: { sealed, legacy_plaintext: legacy, needs_reentry: needsReentry },
    legacy_migration: legacyMigrationEnabled() ? "on" : "off",
  };
}

export class VaultError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function createVaultRecord(db: SupabaseClient, userId: string, seal: unknown) {
  if (!isSealRecord(seal)) throw new VaultError("Invalid vault record", 400);
  const existing = await loadSeal(db, userId);
  if (existing) throw new VaultError("You already have a key vault. Unlock it, or reset it to start over.", 409);
  const { error } = await db.from("user_vaults").insert({ user_id: userId, seal });
  if (error) throw new VaultError("Could not save the vault", 500);
}

/** Replace the passphrase wrap (after recovery or a change). The DEK must be the same one. */
export async function updateVaultRecord(db: SupabaseClient, userId: string, seal: unknown, dek: Uint8Array) {
  if (!isSealRecord(seal)) throw new VaultError("Invalid vault record", 400);
  if (!dekMatchesSeal(dek, seal, userId)) throw new VaultError("That key does not open this vault", 403);
  const existing = await loadSeal(db, userId);
  if (!existing || !dekMatchesSeal(dek, existing, userId)) throw new VaultError("That key does not open this vault", 403);
  const { error } = await db.from("user_vaults").update({ seal, updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (error) throw new VaultError("Could not save the vault", 500);
}

export async function unlockVault(db: SupabaseClient, userId: string, dek: Uint8Array, ttlSeconds?: number) {
  const seal = await loadSeal(db, userId);
  if (!seal) throw new VaultError("No key vault yet: create one in Settings", 404);
  if (!dekMatchesSeal(dek, seal, userId)) throw new VaultError("That key does not open this vault", 403);
  return unlockSession(userId, dek, ttlSeconds);
}

export function lockVault(userId: string) {
  lockSession(userId);
}

/**
 * One-shot migration: seal every legacy plaintext provider row of this user under
 * their unlocked data key, clearing the plaintext in the same update.
 */
export async function migrateLegacyProviders(db: SupabaseClient, userId: string): Promise<{ sealed: number; failed: number }> {
  if (!legacyMigrationEnabled()) throw new VaultError("Legacy key migration is closed: re-enter your provider keys", 410);
  const dek = getSessionKey(userId);
  if (!dek) throw new VaultError("Unlock your key vault first", 423);
  const { data } = await db.from("providers").select("id, user_id, type, api_key, api_secret, seal_version").eq("user_id", userId);
  let sealed = 0;
  let failed = 0;
  for (const p of (data ?? []) as Array<{ id: string; type: string; api_key: string; api_secret: string | null; seal_version: number | null }>) {
    if (p.api_key === MANAGED_API_KEY || !isLegacyPlaintextProvider(p)) continue;
    const cols = sealedProviderColumns(dek, userId, p.id, p.type, { api_key: p.api_key, api_secret: p.api_secret });
    // Only touch the row if it is still the plaintext we just read.
    const { data: updated, error } = await db
      .from("providers")
      .update(cols)
      .eq("id", p.id)
      .eq("user_id", userId)
      .eq("api_key", p.api_key)
      .select("id");
    if (error || !updated?.length) failed++;
    else sealed++;
  }
  return { sealed, failed };
}

/**
 * Lost passphrase and recovery key: drop the vault. Sealed provider rows cannot
 * be opened by anyone any more; they stay (their numbers hang off them) and
 * wait for the keys to be re-entered.
 */
export async function resetVault(db: SupabaseClient, userId: string) {
  lockSession(userId);
  await db.from("providers").update({ sealed_credentials: null }).eq("user_id", userId).eq("api_key", SEALED_API_KEY);
  await db.from("user_vaults").delete().eq("user_id", userId);
}
