/**
 * Unlocked sessions: user id -> data key, in this process's memory only.
 *
 * Never written to the database, Redis, disk, logs, error reports or process.env.
 * A restart or deploy drops every unlock, so that user's sends fail with
 * "locked: unlock to resume" until they unlock again. Kept on globalThis because
 * Next bundles each route separately and they must share one store.
 */
import { clampTtlSeconds } from "./seal-format";

interface Entry {
  dek: Buffer;
  unlockedAt: number;
  expiresAt: number;
}

type Store = Map<string, Entry>;

const KEY = Symbol.for("smshub.vault.unlockStore");
let now: () => number = () => Date.now();

function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  if (!g[KEY]) g[KEY] = new Map();
  return g[KEY]!;
}

function drop(userId: string) {
  const s = store();
  const e = s.get(userId);
  if (e) e.dek.fill(0);
  s.delete(userId);
}

/** Keep a copy of `dek` for `ttlSeconds` (clamped to 5 min .. 7 days, default 8h). */
export function unlockSession(userId: string, dek: Uint8Array, ttlSeconds?: number): { expiresAt: string; ttlSeconds: number } {
  drop(userId);
  const ttl = clampTtlSeconds(ttlSeconds);
  const t = now();
  store().set(userId, { dek: Buffer.from(dek), unlockedAt: t, expiresAt: t + ttl * 1000 });
  return { expiresAt: new Date(t + ttl * 1000).toISOString(), ttlSeconds: ttl };
}

export function lockSession(userId: string): void {
  drop(userId);
}

/** The user's data key, or null when locked or expired. Callers must not keep it. */
export function getSessionKey(userId: string): Buffer | null {
  const e = store().get(userId);
  if (!e) return null;
  if (now() >= e.expiresAt) {
    drop(userId);
    return null;
  }
  return e.dek;
}

export function sessionStatus(userId: string): { unlocked: boolean; expiresAt: string | null; unlockedAt: string | null } {
  const e = getSessionKey(userId) ? store().get(userId)! : null;
  return {
    unlocked: !!e,
    expiresAt: e ? new Date(e.expiresAt).toISOString() : null,
    unlockedAt: e ? new Date(e.unlockedAt).toISOString() : null,
  };
}

/** Tests: simulate a process restart, and control the clock. */
export function __resetUnlockStore() {
  for (const id of [...store().keys()]) drop(id);
}
export function __setClock(fn: (() => number) | null) {
  now = fn ?? (() => Date.now());
}

/**
 * Deploy handoff (see ./handoff.ts): every live unlock with its ORIGINAL
 * expiry, so the outgoing process can pass them to the incoming one.
 */
export function exportSessions(): Array<{ userId: string; dek: string; expiresAt: number }> {
  const out: Array<{ userId: string; dek: string; expiresAt: number }> = [];
  for (const userId of [...store().keys()]) {
    const dek = getSessionKey(userId);
    if (dek) out.push({ userId, dek: dek.toString("base64"), expiresAt: store().get(userId)!.expiresAt });
  }
  return out;
}

/** Take over an unlock from the previous process. Keeps its expiry; never extends it. */
export function importSession(userId: string, dek: Uint8Array, expiresAt: number): boolean {
  if (!userId || dek.length !== 32 || !Number.isFinite(expiresAt) || expiresAt - now() < 60_000) return false;
  drop(userId);
  store().set(userId, { dek: Buffer.from(dek), unlockedAt: now(), expiresAt });
  return true;
}
