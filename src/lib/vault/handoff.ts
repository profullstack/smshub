/**
 * Deploy handoff for vault unlocks.
 *
 * Unlocks live in process memory only (./unlock-store), so every redeploy used
 * to lock every vault: BYO-provider sends, and Anthony's fleet `alert` calls,
 * failed with 423 until each owner unlocked again. Now the outgoing process
 * hands its unlocks to the incoming one: deploy-app.sh asks the old container
 * before `compose up` and gives them to the new container once it is healthy
 * (scripts/vault-handoff.sh).
 *
 * The channel is a Unix socket in a private 0700 directory inside the
 * container (socket 0600), so only `docker exec` reaches it: nothing on HTTP,
 * disk or env. Whoever can docker exec can already read this process's memory.
 * Imported unlocks keep their ORIGINAL expiry and are never extended.
 *
 * Protocol: one JSON line in, one JSON line out.
 *   {"op":"export"}                  -> {"ok":true,"sessions":[{userId,dek,expiresAt}]}
 *   {"op":"import","sessions":[...]} -> {"ok":true,"imported":n,"skipped":m}
 */
import { chmodSync, lstatSync, mkdirSync, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { exportSessions, importSession } from "./unlock-store";

export const DEFAULT_HANDOFF_SOCKET = join(homedir(), ".smshub-vault", "handoff.sock");
const MAX_LINE = 4 * 1024 * 1024;
const SERVER_KEY = Symbol.for("smshub.vault.handoffServer");

type Reply =
  | { ok: true; sessions: ReturnType<typeof exportSessions> }
  | { ok: true; imported: number; skipped: number }
  | { ok: false; error: string };

export function handleHandoffRequest(line: string): Reply {
  let req: { op?: string; sessions?: Array<{ userId?: string; dek?: string; expiresAt?: number }> };
  try {
    req = JSON.parse(line);
  } catch {
    return { ok: false, error: "bad json" };
  }
  if (req.op === "export") return { ok: true, sessions: exportSessions() };
  if (req.op === "import") {
    if (!Array.isArray(req.sessions)) return { ok: false, error: "sessions missing" };
    let imported = 0;
    let skipped = 0;
    for (const s of req.sessions) {
      const dek = Buffer.from(String(s?.dek ?? ""), "base64");
      if (importSession(String(s?.userId ?? ""), dek, Number(s?.expiresAt))) imported += 1;
      else skipped += 1;
      dek.fill(0);
    }
    console.log(`[vault] ${imported} unlock(s) handed over from the previous process (${skipped} skipped)`);
    return { ok: true, imported, skipped };
  }
  return { ok: false, error: "unknown op" };
}

/** Listen on the handoff socket (once per process). VAULT_HANDOFF=off disables it. */
export function startVaultHandoffSocket(path: string = process.env.VAULT_HANDOFF_SOCKET || DEFAULT_HANDOFF_SOCKET): Server | null {
  if (process.env[String("VAULT_HANDOFF")] === "off") return null;
  const g = globalThis as unknown as Record<symbol, Server | undefined>;
  if (g[SERVER_KEY]) return g[SERVER_KEY]!;
  // A private directory, never a shared one like /tmp: refuse a symlink or a
  // directory someone else owns or can reach.
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = lstatSync(dir);
  const uid = process.getuid?.();
  if (!st.isDirectory() || st.isSymbolicLink() || (uid !== undefined && st.uid !== uid) || (st.mode & 0o077) !== 0) {
    console.error(`[vault] handoff socket NOT started: ${dir} is not a private directory`);
    return null;
  }
  try {
    unlinkSync(path);
  } catch {
    /* no stale socket */
  }
  const server = createServer((conn) => {
    let buf = "";
    conn.setEncoding("utf8");
    conn.setTimeout(10_000, () => conn.destroy());
    conn.on("data", (chunk: string) => {
      buf += chunk;
      if (buf.length > MAX_LINE) return conn.destroy();
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const line = buf.slice(0, nl);
      buf = "";
      conn.end(`${JSON.stringify(handleHandoffRequest(line))}\n`);
    });
    conn.on("error", () => conn.destroy());
  });
  server.on("error", (err) => console.error("[vault] handoff socket error", err.message));
  server.listen(path, () => {
    try {
      chmodSync(path, 0o600);
    } catch {
      /* the directory is 0700 already */
    }
  });
  server.unref();
  g[SERVER_KEY] = server;
  return server;
}
