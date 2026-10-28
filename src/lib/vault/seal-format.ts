/**
 * smshub key vault: shared wire format (browser + server).
 *
 *   passphrase --PBKDF2-SHA256 600k, 16-byte salt--> ikm --HKDF "smshub/kek/v2"--> KEK
 *   KEK wraps a random 32-byte data key (DEK)              -> seal.wrapped_dek
 *   recovery key --HKDF--> RKEK wraps the same DEK          -> seal.recovery_wrapped_dek
 *   DEK seals a fixed string                                -> seal.key_check
 *   DEK seals each provider's credentials (AAD: user + provider + field)
 *
 * The passphrase and recovery key never leave the user's browser or CLI. To let
 * smshub send while the user is away, the client unlocks a session by sending the
 * DEK (never the passphrase); the server keeps it in process memory only, with a
 * TTL the user picks. Nothing stored on our servers can open a sealed row.
 *
 * CipherBlob: base64 ciphertext, 12-byte IV and 16-byte GCM tag kept apart, so the
 * WebCrypto (browser) and node:crypto (server) sides read each other's output.
 */

export const SEAL_VERSION = 2;
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 10;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const DEK_BYTES = 32;
export const KEY_CHECK_TEXT = "smshub-key-check-v2";

export interface CipherBlob {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface SealKdf {
  alg: "PBKDF2-SHA256";
  iterations: number;
  /** base64, 16 random bytes */
  salt: string;
}

/** user_vaults.seal (jsonb). Nothing in here opens without the passphrase or the recovery key. */
export interface SealRecord {
  v: 2;
  kdf: SealKdf;
  wrapped_dek: CipherBlob;
  recovery_wrapped_dek: CipherBlob | null;
  key_check: CipherBlob;
}

export function vaultAad(userId: string, field: "wrapped_dek" | "recovery_wrapped_dek" | "key_check"): string {
  if (!userId) throw new Error("userId required for AAD");
  return `smshub:vault:${userId}:${field}`;
}

export function providerAad(userId: string, providerId: string): string {
  if (!userId || !providerId) throw new Error("userId and providerId required for AAD");
  return `smshub:providers:${userId}:${providerId}:credentials`;
}

export function isCipherBlob(v: unknown): v is CipherBlob {
  const b = v as CipherBlob | null;
  return !!b && typeof b.ciphertext === "string" && typeof b.iv === "string" && typeof b.tag === "string";
}

export function isSealRecord(v: unknown): v is SealRecord {
  const s = v as SealRecord | null;
  return (
    !!s &&
    s.v === 2 &&
    s.kdf?.alg === "PBKDF2-SHA256" &&
    Number.isInteger(s.kdf.iterations) &&
    s.kdf.iterations >= MIN_PBKDF2_ITERATIONS &&
    typeof s.kdf.salt === "string" &&
    isCipherBlob(s.wrapped_dek) &&
    isCipherBlob(s.key_check) &&
    (s.recovery_wrapped_dek === null || isCipherBlob(s.recovery_wrapped_dek))
  );
}

/** Unlock TTLs: the user picks; default 8h, never more than 7 days. */
export const DEFAULT_UNLOCK_TTL_SECONDS = 8 * 3600;
export const MAX_UNLOCK_TTL_SECONDS = 7 * 24 * 3600;
export const MIN_UNLOCK_TTL_SECONDS = 5 * 60;

export function clampTtlSeconds(ttl: unknown): number {
  const n = typeof ttl === "number" ? ttl : typeof ttl === "string" ? Number(ttl) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_UNLOCK_TTL_SECONDS;
  return Math.max(MIN_UNLOCK_TTL_SECONDS, Math.min(MAX_UNLOCK_TTL_SECONDS, Math.floor(n)));
}
