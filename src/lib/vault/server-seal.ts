/**
 * Server side of the key vault (node:crypto, synchronous). Every function here
 * needs a DEK the user sent for an unlocked session; the server never stores one.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { DEK_BYTES, IV_BYTES, KEY_CHECK_TEXT, TAG_BYTES, vaultAad, type CipherBlob, type SealRecord } from "./seal-format";

function assertDek(dek: Uint8Array) {
  if (!(dek instanceof Uint8Array) || dek.length !== DEK_BYTES) throw new Error(`data key must be ${DEK_BYTES} bytes`);
}

export function sealString(dek: Uint8Array, plaintext: string, aad: string): CipherBlob {
  assertDek(dek);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dek, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function unsealString(dek: Uint8Array, blob: CipherBlob, aad: string): string {
  assertDek(dek);
  const decipher = createDecipheriv("aes-256-gcm", dek, Buffer.from(blob.iv, "base64"), { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(blob.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function sealJson(dek: Uint8Array, value: unknown, aad: string): CipherBlob {
  return sealString(dek, JSON.stringify(value), aad);
}

export function unsealJson<T>(dek: Uint8Array, blob: CipherBlob, aad: string): T {
  return JSON.parse(unsealString(dek, blob, aad)) as T;
}

/** True when this DEK opens the vault's key check, i.e. it is the user's real data key. */
export function dekMatchesSeal(dek: Uint8Array, seal: SealRecord, userId: string): boolean {
  try {
    return unsealString(dek, seal.key_check, vaultAad(userId, "key_check")) === KEY_CHECK_TEXT;
  } catch {
    return false;
  }
}

export function decodeDek(b64: unknown): Buffer | null {
  if (typeof b64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const raw = Buffer.from(b64, "base64");
  return raw.length === DEK_BYTES ? raw : null;
}
