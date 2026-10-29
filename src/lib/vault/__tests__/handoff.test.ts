// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetUnlockStore, __setClock, getSessionKey, sessionStatus, unlockSession } from "../unlock-store";
import { handleHandoffRequest, startVaultHandoffSocket } from "../handoff";

/**
 * Deploy handoff: export gives every live unlock with its original expiry,
 * import restores them in a fresh process without extending any, and an
 * unlock about to expire or a malformed key is skipped.
 */
const T0 = Date.parse("2026-10-29T04:00:00Z");

afterEach(() => {
  __resetUnlockStore();
  __setClock(null);
});

describe("vault deploy handoff", () => {
  it("round-trips unlocks across a restart, keeping their expiry", () => {
    __setClock(() => T0);
    const dek = new Uint8Array(32).fill(7);
    const { expiresAt } = unlockSession("u1", dek, 3600);
    const out = handleHandoffRequest('{"op":"export"}');
    expect(out.ok && "sessions" in out && out.sessions.length).toBe(1);

    __resetUnlockStore(); // the new process
    __setClock(() => T0 + 600_000);
    expect(getSessionKey("u1")).toBeNull();
    const sessions = (out as { sessions: unknown[] }).sessions;
    expect(handleHandoffRequest(JSON.stringify({ op: "import", sessions }))).toEqual({ ok: true, imported: 1, skipped: 0 });
    expect(Buffer.from(getSessionKey("u1")!).equals(Buffer.from(dek))).toBe(true);
    expect(sessionStatus("u1").expiresAt).toBe(expiresAt);
  });

  it("skips nearly expired or malformed unlocks", () => {
    __setClock(() => T0);
    const sessions = [
      { userId: "late", dek: Buffer.alloc(32, 1).toString("base64"), expiresAt: T0 + 30_000 },
      { userId: "short", dek: Buffer.alloc(16, 1).toString("base64"), expiresAt: T0 + 3600_000 },
      { userId: "", dek: Buffer.alloc(32, 1).toString("base64"), expiresAt: T0 + 3600_000 },
    ];
    expect(handleHandoffRequest(JSON.stringify({ op: "import", sessions }))).toEqual({ ok: true, imported: 0, skipped: 3 });
    expect(getSessionKey("late")).toBeNull();
  });

  it("rejects junk", () => {
    expect(handleHandoffRequest("nope")).toEqual({ ok: false, error: "bad json" });
    expect(handleHandoffRequest('{"op":"dump"}')).toEqual({ ok: false, error: "unknown op" });
    expect(handleHandoffRequest('{"op":"import"}')).toEqual({ ok: false, error: "sessions missing" });
  });

  it("serves the protocol on a Unix socket in a private directory", async () => {
    unlockSession("u2", new Uint8Array(32).fill(3), 3600);
    const path = join(mkdtempSync(join(tmpdir(), "smshub-handoff-")), "private", "s.sock");
    const server = startVaultHandoffSocket(path)!;
    await new Promise((r) => (server.listening ? r(null) : server.once("listening", r)));
    const reply = await new Promise<string>((resolve, reject) => {
      let out = "";
      const c = connect(path, () => c.write('{"op":"export"}\n'));
      c.setEncoding("utf8");
      c.on("data", (d) => (out += d));
      c.on("end", () => resolve(out));
      c.on("error", reject);
    });
    server.close();
    expect(JSON.parse(reply).sessions.map((s: { userId: string }) => s.userId)).toEqual(["u2"]);
  });
});
