/**
 * Browser / CLI side of the key vault (WebCrypto only). The passphrase and the
 * recovery key are used here and nowhere else; what leaves this module is the
 * public SealRecord (to store) and, for an unlock, the raw DEK.
 */
import {
  DEK_BYTES,
  IV_BYTES,
  KEY_CHECK_TEXT,
  MIN_PASSPHRASE_LENGTH,
  MIN_PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS,
  TAG_BYTES,
  vaultAad,
  type CipherBlob,
  type SealKdf,
  type SealRecord,
} from "./seal-format";

const enc = new TextEncoder();

type Bytes = Uint8Array<ArrayBuffer>;

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto (crypto.subtle) is not available");
  return c.subtle;
};

function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function base64ToBytes(b64: string): Bytes {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Bytes {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function wipe(bytes: Uint8Array | null | undefined): void {
  if (bytes) bytes.fill(0);
}

async function gcmEncrypt(key: CryptoKey, plaintext: Uint8Array, ad: string): Promise<CipherBlob> {
  const iv = randomBytes(IV_BYTES);
  const sealed = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv, additionalData: buf(enc.encode(ad)), tagLength: TAG_BYTES * 8 }, key, buf(plaintext))
  );
  return {
    ciphertext: bytesToBase64(sealed.slice(0, sealed.length - TAG_BYTES)),
    iv: bytesToBase64(iv),
    tag: bytesToBase64(sealed.slice(sealed.length - TAG_BYTES)),
  };
}

async function gcmDecrypt(key: CryptoKey, blob: CipherBlob, ad: string): Promise<Bytes> {
  const ct = base64ToBytes(blob.ciphertext);
  const tag = base64ToBytes(blob.tag);
  const joined = new Uint8Array(ct.length + tag.length);
  joined.set(ct, 0);
  joined.set(tag, ct.length);
  const out = await subtle().decrypt(
    { name: "AES-GCM", iv: base64ToBytes(blob.iv), additionalData: buf(enc.encode(ad)), tagLength: TAG_BYTES * 8 },
    key,
    buf(joined)
  );
  return new Uint8Array(out);
}

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== DEK_BYTES) throw new Error(`data key must be ${DEK_BYTES} bytes`);
  return subtle().importKey("raw", buf(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function hkdfAesKey(ikm: Uint8Array, salt: Uint8Array, info: string): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", buf(ikm), "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(enc.encode(info)) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Passphrase -> KEK: PBKDF2-SHA256 (>= 600k) then HKDF, as OpenCreds does. */
export async function deriveKek(passphrase: string, kdf: SealKdf): Promise<CryptoKey> {
  if (kdf.alg !== "PBKDF2-SHA256") throw new Error(`unsupported kdf ${kdf.alg}`);
  if (kdf.iterations < MIN_PBKDF2_ITERATIONS) throw new Error("kdf iterations below policy");
  const salt = base64ToBytes(kdf.salt);
  const pw = await subtle().importKey("raw", buf(enc.encode(passphrase.normalize("NFKC"))), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(
    await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: buf(salt), iterations: kdf.iterations }, pw, 256)
  );
  try {
    return await hkdfAesKey(bits, salt, "smshub/kek/v2");
  } finally {
    wipe(bits);
  }
}

async function deriveRecoveryKek(recoveryKey: string): Promise<CryptoKey> {
  const raw = decodeRecoveryKey(recoveryKey);
  try {
    return await hkdfAesKey(raw, enc.encode("smshub/recovery"), "smshub/recovery-kek/v2");
  } finally {
    wipe(raw);
  }
}

const B32 = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";

export function encodeRecoveryKey(raw: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of raw) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join("-");
}

export function decodeRecoveryKey(text: string): Bytes {
  const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("invalid recovery key");
    value = ((value << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (out.length < 32) throw new Error("invalid recovery key");
  return new Uint8Array(out.slice(0, 32));
}

export function checkPassphrase(passphrase: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) return `Use at least ${MIN_PASSPHRASE_LENGTH} characters`;
  return null;
}

/**
 * A new vault. Returns the record to store, the DEK (for an immediate unlock) and
 * the recovery key, which the caller shows exactly once.
 */
export async function createVault(
  userId: string,
  passphrase: string,
  iterations = PBKDF2_ITERATIONS
): Promise<{ seal: SealRecord; dek: Bytes; recoveryKey: string }> {
  const problem = checkPassphrase(passphrase);
  if (problem) throw new Error(problem);
  const kdf: SealKdf = { alg: "PBKDF2-SHA256", iterations, salt: bytesToBase64(randomBytes(16)) };
  const dek = randomBytes(DEK_BYTES);
  const recoveryRaw = randomBytes(32);
  const recoveryKey = encodeRecoveryKey(recoveryRaw);
  wipe(recoveryRaw);
  const kek = await deriveKek(passphrase, kdf);
  const rkek = await deriveRecoveryKek(recoveryKey);
  const seal: SealRecord = {
    v: 2,
    kdf,
    wrapped_dek: await gcmEncrypt(kek, dek, vaultAad(userId, "wrapped_dek")),
    recovery_wrapped_dek: await gcmEncrypt(rkek, dek, vaultAad(userId, "recovery_wrapped_dek")),
    key_check: await gcmEncrypt(await aesKey(dek), enc.encode(KEY_CHECK_TEXT), vaultAad(userId, "key_check")),
  };
  return { seal, dek, recoveryKey };
}

/** Passphrase -> DEK. Throws "Wrong passphrase" when it does not open. */
export async function openVault(userId: string, passphrase: string, seal: SealRecord): Promise<Bytes> {
  const kek = await deriveKek(passphrase, seal.kdf);
  try {
    return await gcmDecrypt(kek, seal.wrapped_dek, vaultAad(userId, "wrapped_dek"));
  } catch {
    throw new Error("Wrong passphrase");
  }
}

export async function openVaultWithRecovery(userId: string, recoveryKey: string, seal: SealRecord): Promise<Bytes> {
  if (!seal.recovery_wrapped_dek) throw new Error("This vault has no recovery key");
  const rkek = await deriveRecoveryKek(recoveryKey);
  try {
    return await gcmDecrypt(rkek, seal.recovery_wrapped_dek, vaultAad(userId, "recovery_wrapped_dek"));
  } catch {
    throw new Error("Wrong recovery key");
  }
}

/** New passphrase for the same DEK (after a recovery, or a change). Sealed rows stay as they are. */
export async function rewrapVault(userId: string, dek: Uint8Array, passphrase: string, seal: SealRecord): Promise<SealRecord> {
  const problem = checkPassphrase(passphrase);
  if (problem) throw new Error(problem);
  const kdf: SealKdf = { alg: "PBKDF2-SHA256", iterations: Math.max(seal.kdf.iterations, PBKDF2_ITERATIONS), salt: bytesToBase64(randomBytes(16)) };
  const kek = await deriveKek(passphrase, kdf);
  return { ...seal, kdf, wrapped_dek: await gcmEncrypt(kek, dek, vaultAad(userId, "wrapped_dek")) };
}
