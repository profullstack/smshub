// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import { createVault, openVault, openVaultWithRecovery, rewrapVault, bytesToBase64 } from "../client-seal";
import { dekMatchesSeal, decodeDek, sealJson, unsealJson } from "../server-seal";
import { clampTtlSeconds, isSealRecord, providerAad, MAX_UNLOCK_TTL_SECONDS } from "../seal-format";
import { __resetUnlockStore, __setClock, getSessionKey, lockSession, sessionStatus, unlockSession } from "../unlock-store";
import {
  openProvider,
  sealedProviderColumns,
  SEALED_API_KEY,
  VaultLockedError,
  isLegacyPlaintextProvider,
} from "../provider-credentials";
import { createVaultRecord, migrateLegacyProviders, resetVault, unlockVault, vaultStatus, VaultError } from "../service";
import { lineApiKey, lineLocked } from "@/lib/lines/credentials";
import { sendSMS } from "@/lib/providers";

const U = "user-1";
const PASS = "correct horse battery";
const TELNYX_PUB = Buffer.alloc(32, 7).toString("base64");

let vault: Awaited<ReturnType<typeof createVault>>;

beforeEach(async () => {
  __resetUnlockStore();
  __setClock(null);
  delete process.env.LEGACY_KEY_MIGRATION;
  vault ??= await createVault(U, PASS);
});
afterEach(() => {
  __setClock(null);
  delete process.env.LEGACY_KEY_MIGRATION;
});

describe("seal / unseal", () => {
  it("creates a valid public record that opens with the passphrase or the recovery key, not otherwise", async () => {
    expect(isSealRecord(vault.seal)).toBe(true);
    expect(JSON.stringify(vault.seal)).not.toContain(PASS);
    expect(Buffer.from(await openVault(U, PASS, vault.seal)).equals(Buffer.from(vault.dek))).toBe(true);
    await expect(openVault(U, "wrong passphrase!", vault.seal)).rejects.toThrow("Wrong passphrase");
    await expect(openVault("someone-else", PASS, vault.seal)).rejects.toThrow("Wrong passphrase");
    const viaRecovery = await openVaultWithRecovery(U, vault.recoveryKey.toLowerCase(), vault.seal);
    expect(Buffer.from(viaRecovery).equals(Buffer.from(vault.dek))).toBe(true);
  });

  it("rewraps under a new passphrase without changing the data key", async () => {
    const seal2 = await rewrapVault(U, vault.dek, "a brand new passphrase", vault.seal);
    expect(Buffer.from(await openVault(U, "a brand new passphrase", seal2)).equals(Buffer.from(vault.dek))).toBe(true);
    await expect(openVault(U, PASS, seal2)).rejects.toThrow();
  });

  it("the server checks a DEK against the key check and seals with AAD bound to user + provider", () => {
    expect(dekMatchesSeal(vault.dek, vault.seal, U)).toBe(true);
    expect(dekMatchesSeal(Buffer.alloc(32, 1), vault.seal, U)).toBe(false);
    const blob = sealJson(vault.dek, { api_key: "KEY123" }, providerAad(U, "p1"));
    expect(unsealJson(vault.dek, blob, providerAad(U, "p1"))).toEqual({ api_key: "KEY123" });
    expect(() => unsealJson(vault.dek, blob, providerAad(U, "p2"))).toThrow();
    expect(() => unsealJson(vault.dek, blob, providerAad("u2", "p1"))).toThrow();
    expect(decodeDek(bytesToBase64(vault.dek))?.length).toBe(32);
    expect(decodeDek("short")).toBeNull();
  });
});

describe("unlock store", () => {
  it("clamps the TTL: default 8h, max 7 days", () => {
    expect(clampTtlSeconds(undefined)).toBe(8 * 3600);
    expect(clampTtlSeconds(30 * 24 * 3600)).toBe(MAX_UNLOCK_TTL_SECONDS);
    expect(clampTtlSeconds(10)).toBe(300);
  });

  it("expires after the TTL, locks on demand, and a restart forgets every unlock", () => {
    let t = 1_000_000;
    __setClock(() => t);
    unlockSession(U, vault.dek, 3600);
    expect(getSessionKey(U)).not.toBeNull();
    expect(sessionStatus(U).unlocked).toBe(true);
    t += 3600 * 1000;
    expect(getSessionKey(U)).toBeNull();

    unlockSession(U, vault.dek, 3600);
    lockSession(U);
    expect(getSessionKey(U)).toBeNull();

    unlockSession(U, vault.dek, 3600);
    __resetUnlockStore(); // process restart
    expect(getSessionKey(U)).toBeNull();
  });

  it("keeps its own copy: wiping the caller's buffer does not affect it, locking wipes it", () => {
    const copy = new Uint8Array(vault.dek);
    unlockSession(U, copy);
    copy.fill(0);
    const held = getSessionKey(U)!;
    expect(Buffer.from(held).equals(Buffer.from(vault.dek))).toBe(true);
    lockSession(U);
    expect(held.every((b) => b === 0)).toBe(true);
  });
});

describe("provider credentials", () => {
  const sealedRow = () => ({
    id: "p1",
    user_id: U,
    type: "telnyx",
    metadata: null,
    ...sealedProviderColumns(vault.dek, U, "p1", "telnyx", { api_key: "dummy-key-aaaa-0000", api_secret: TELNYX_PUB }),
  });

  it("stores nothing secret in plaintext columns; the Telnyx public key stays readable", () => {
    const row = sealedRow();
    expect(row.api_key).toBe(SEALED_API_KEY);
    expect(row.api_secret).toBe(TELNYX_PUB);
    expect(JSON.stringify(row)).not.toContain("dummy-key-aaaa-0000");
    expect(row.api_key_hint).toBe("dummy-ke…0000");
    const twilio = sealedProviderColumns(vault.dek, U, "p2", "twilio", { api_key: "AC1", api_secret: "authtoken" });
    expect(twilio.api_secret).toBeNull();
    expect(JSON.stringify(twilio)).not.toContain("authtoken");
  });

  it("opens only while unlocked, and is locked again after Lock", () => {
    const row = sealedRow();
    expect(() => openProvider(row)).toThrow(VaultLockedError);
    unlockSession(U, vault.dek);
    expect(openProvider(row).api_key).toBe("dummy-key-aaaa-0000");
    lockSession(U);
    expect(() => openProvider(row)).toThrow(/locked/);
  });

  it("never falls back to smshub's own env key for a user's sealed line", async () => {
    process.env.TELNYX_API_KEY = "OPERATOR_KEY";
    try {
      const row = sealedRow();
      expect(lineApiKey(row, false)).toBeNull();
      expect(lineLocked(row, false)).toBe(true);
      unlockSession(U, vault.dek);
      expect(lineApiKey(row, false)).toBe("dummy-key-aaaa-0000");
      // and the placeholder itself is never sent
      const r = await sendSMS({ to: "+14155550123", from: "+14155550100", body: "x", provider: "telnyx", credentials: { apiKey: SEALED_API_KEY } });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/locked/);
    } finally {
      delete process.env.TELNYX_API_KEY;
    }
  });

  it("legacy plaintext rows keep working until LEGACY_KEY_MIGRATION=off", () => {
    const legacy = { id: "p9", user_id: U, type: "twilio", api_key: "AC9", api_secret: "tok", seal_version: 0 };
    expect(isLegacyPlaintextProvider(legacy)).toBe(true);
    expect(openProvider(legacy).api_key).toBe("AC9");
    process.env.LEGACY_KEY_MIGRATION = "off";
    expect(() => openProvider(legacy)).toThrow(VaultLockedError);
  });
});

describe("vault service + one-shot migration", () => {
  function db() {
    const fdb = new FakeDb();
    fdb.rows("providers").push(
      { id: "a", user_id: U, type: "twilio", api_key: "dummy-twilio-sid", api_secret: "twilio-auth-token", seal_version: 0 },
      { id: "b", user_id: U, type: "telnyx", api_key: "dummy-telnyx-key", api_secret: TELNYX_PUB, seal_version: 0 },
      { id: "m", user_id: U, type: "telnyx", api_key: "__managed__", api_secret: null, seal_version: 0 },
      { id: "o", user_id: "other", type: "twilio", api_key: "ACother", api_secret: "x", seal_version: 0 }
    );
    return fdb;
  }

  it("refuses to migrate while locked, then seals this user's legacy rows in place", async () => {
    const fdb = db();
    const sb = fdb as unknown as SupabaseClient;
    await createVaultRecord(sb, U, vault.seal);
    await expect(migrateLegacyProviders(sb, U)).rejects.toBeInstanceOf(VaultError);
    await expect(unlockVault(sb, U, Buffer.alloc(32, 9))).rejects.toThrow(/does not open/);
    await unlockVault(sb, U, vault.dek, 600);

    expect(await migrateLegacyProviders(sb, U)).toEqual({ sealed: 2, failed: 0 });
    const rows = fdb.rows("providers");
    const a = rows.find((r) => r.id === "a")!;
    const b = rows.find((r) => r.id === "b")!;
    expect(a.api_key).toBe(SEALED_API_KEY);
    expect(a.api_secret).toBeNull();
    expect(JSON.stringify(a)).not.toContain("twilio-auth-token");
    expect(b.api_secret).toBe(TELNYX_PUB);
    expect(rows.find((r) => r.id === "m")!.api_key).toBe("__managed__");
    expect(rows.find((r) => r.id === "o")!.api_key).toBe("ACother");
    expect(openProvider(a as never)).toMatchObject({ api_key: "dummy-twilio-sid", api_secret: "twilio-auth-token" });

    // idempotent
    expect(await migrateLegacyProviders(sb, U)).toEqual({ sealed: 0, failed: 0 });
    const status = await vaultStatus(sb, U);
    expect(status).toMatchObject({ state: "unlocked", providers: { sealed: 2, legacy_plaintext: 0, needs_reentry: 0 } });
  });

  it("migration is closed after the cutoff switch", async () => {
    const fdb = db();
    const sb = fdb as unknown as SupabaseClient;
    await createVaultRecord(sb, U, vault.seal);
    await unlockVault(sb, U, vault.dek);
    process.env.LEGACY_KEY_MIGRATION = "off";
    await expect(migrateLegacyProviders(sb, U)).rejects.toThrow(/closed/);
    expect(fdb.rows("providers").find((r) => r.id === "a")!.api_key).toBe("dummy-twilio-sid"); // not deleted
  });

  it("reset forgets the vault: sealed rows wait for re-entry, nothing else is deleted", async () => {
    const fdb = db();
    const sb = fdb as unknown as SupabaseClient;
    await createVaultRecord(sb, U, vault.seal);
    await unlockVault(sb, U, vault.dek);
    await migrateLegacyProviders(sb, U);
    await resetVault(sb, U);
    expect(getSessionKey(U)).toBeNull();
    const status = await vaultStatus(sb, U);
    expect(status).toMatchObject({ exists: false, state: "no_vault", providers: { sealed: 0, needs_reentry: 2 } });
    expect(fdb.rows("providers")).toHaveLength(4);
    expect(() => openProvider(fdb.rows("providers").find((r) => r.id === "a") as never)).toThrow(/re-entered/);
  });
});
