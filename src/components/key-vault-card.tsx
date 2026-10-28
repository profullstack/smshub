"use client";

import { useCallback, useEffect, useState } from "react";
import {
  bytesToBase64,
  checkPassphrase,
  createVault,
  openVault,
  openVaultWithRecovery,
  rewrapVault,
  wipe,
} from "@/lib/vault/client-seal";
import type { SealRecord } from "@/lib/vault/seal-format";

interface VaultState {
  user_id: string;
  exists: boolean;
  seal: SealRecord | null;
  state: "no_vault" | "locked" | "unlocked";
  expires_at: string | null;
  providers: { sealed: number; legacy_plaintext: number; needs_reentry: number };
  legacy_migration: "on" | "off";
}

const TTLS: Array<{ label: string; seconds: number }> = [
  { label: "1 hour", seconds: 3600 },
  { label: "8 hours", seconds: 8 * 3600 },
  { label: "1 day", seconds: 24 * 3600 },
  { label: "3 days", seconds: 3 * 24 * 3600 },
  { label: "7 days (max)", seconds: 7 * 24 * 3600 },
];

async function post(path: string, body?: unknown, method = "POST") {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/**
 * Settings > Key vault. Provider keys are sealed under a passphrase that never
 * leaves this browser. Unlocking sends only the derived data key, which smshub
 * keeps in memory for the time picked here so campaigns and the API can send.
 */
export function KeyVaultCard({ onChange }: { onChange?: () => void }) {
  const [v, setV] = useState<VaultState | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [ttl, setTtl] = useState(8 * 3600);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [shownRecovery, setShownRecovery] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/vault").catch(() => null);
    if (r?.ok) setV(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const finishUnlock = async (dek: Uint8Array) => {
    try {
      await post("/api/vault/unlock", { dek: bytesToBase64(dek), ttl_seconds: ttl });
    } finally {
      wipe(dek);
    }
    const state = (await post("/api/vault/migrate").catch(() => null)) as { sealed?: number } | null;
    setMsg({ ok: true, text: state?.sealed ? `Unlocked. Sealed ${state.sealed} provider key${state.sealed === 1 ? "" : "s"} that were stored unencrypted.` : "Unlocked." });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setPass("");
      setPass2("");
      setRecovery("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    }
    setBusy(false);
    await load();
    onChange?.();
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!v) return;
      const problem = checkPassphrase(pass);
      if (problem) throw new Error(problem);
      if (pass !== pass2) throw new Error("The passphrases do not match");
      const { seal, dek, recoveryKey } = await createVault(v.user_id, pass);
      await post("/api/vault", { seal });
      setShownRecovery(recoveryKey);
      await finishUnlock(dek);
    });
  };

  const unlock = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!v?.seal) return;
      if (useRecovery) {
        const problem = checkPassphrase(pass);
        if (problem) throw new Error(`New passphrase: ${problem}`);
        const dek = await openVaultWithRecovery(v.user_id, recovery, v.seal);
        const seal = await rewrapVault(v.user_id, dek, pass, v.seal);
        await post("/api/vault", { seal, dek: bytesToBase64(dek) });
        setUseRecovery(false);
        await finishUnlock(dek);
      } else {
        await finishUnlock(await openVault(v.user_id, pass, v.seal));
      }
    });
  };

  const lock = () => run(async () => void (await post("/api/vault/lock")));
  const migrate = () =>
    run(async () => {
      const r = await post("/api/vault/migrate");
      setMsg({ ok: true, text: `Sealed ${r.sealed} provider key${r.sealed === 1 ? "" : "s"}.` });
    });
  const reset = () => {
    if (!confirm("Forget your vault? Every sealed provider key is lost for good and you will re-enter them. Only do this if you lost both your passphrase and your recovery key.")) return;
    run(async () => void (await post("/api/vault?confirm=forget-my-keys", undefined, "DELETE")));
  };

  if (!v) return null;
  const legacy = v.providers.legacy_plaintext;

  return (
    <section className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3" id="key-vault">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Key vault</h2>
        <span className={`text-xs px-2 py-0.5 rounded ${v.state === "unlocked" ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"}`}>
          {v.state === "no_vault" ? "not set up" : v.state}
        </span>
      </div>
      <p className="text-sm text-gray-400">
        Your Twilio / Telnyx keys are sealed under a passphrase that never leaves this browser; smshub stores only the
        sealed copy. To send (inbox, campaigns, the API, the CLI) you unlock for a while: smshub keeps the unlocked key in
        memory only, until the time you pick, Lock, or a restart. While locked, sends fail with a &ldquo;locked&rdquo;
        error and your voice menu and alerts on your own numbers pause.
      </p>
      {legacy > 0 && (
        <p className="text-sm text-yellow-400">
          {legacy} provider key{legacy === 1 ? " is" : "s are"} still stored unencrypted from before sealing.{" "}
          {v.state === "unlocked" ? "Seal them now." : v.exists ? "Unlock to seal them." : "Create your vault to seal them."}
        </p>
      )}
      {v.providers.needs_reentry > 0 && (
        <p className="text-sm text-yellow-400">
          {v.providers.needs_reentry} provider key{v.providers.needs_reentry === 1 ? "" : "s"} must be re-entered (below).
        </p>
      )}

      {shownRecovery && (
        <div className="border border-blue-800 rounded p-3 space-y-2">
          <p className="text-sm font-medium">Your recovery key (shown once)</p>
          <code className="block text-sm break-all bg-gray-950 p-2 rounded">{shownRecovery}</code>
          <p className="text-xs text-gray-400">
            Save it somewhere safe. If you forget your passphrase, it is the only way back in. Lose both and your
            sealed keys are gone: you would re-enter them.
          </p>
          <button onClick={() => setShownRecovery(null)} className="text-blue-400 hover:text-blue-300 text-sm">
            I saved it
          </button>
        </div>
      )}

      {v.state === "no_vault" && (
        <form onSubmit={create} className="space-y-2">
          <input type="password" autoComplete="new-password" placeholder="New passphrase (10+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} className="w-full bg-gray-800 rounded px-3 py-2 text-sm" />
          <input type="password" autoComplete="new-password" placeholder="Repeat passphrase" value={pass2} onChange={(e) => setPass2(e.target.value)} className="w-full bg-gray-800 rounded px-3 py-2 text-sm" />
          <TtlPicker ttl={ttl} setTtl={setTtl} />
          <button disabled={busy} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-4 py-2 text-sm">
            {busy ? "Working..." : "Create vault and unlock"}
          </button>
          <p className="text-xs text-gray-500">Forgotten passphrase + lost recovery key = your sealed keys are gone; you re-enter them.</p>
        </form>
      )}

      {v.state === "locked" && (
        <form onSubmit={unlock} className="space-y-2">
          {useRecovery && (
            <input placeholder="Recovery key" value={recovery} onChange={(e) => setRecovery(e.target.value)} className="w-full bg-gray-800 rounded px-3 py-2 text-sm font-mono" />
          )}
          <input type="password" autoComplete={useRecovery ? "new-password" : "current-password"} placeholder={useRecovery ? "New passphrase" : "Passphrase"} value={pass} onChange={(e) => setPass(e.target.value)} className="w-full bg-gray-800 rounded px-3 py-2 text-sm" />
          <TtlPicker ttl={ttl} setTtl={setTtl} />
          <div className="flex gap-4 items-center">
            <button disabled={busy} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-4 py-2 text-sm">
              {busy ? "Unlocking..." : "Unlock"}
            </button>
            <button type="button" onClick={() => setUseRecovery(!useRecovery)} className="text-sm text-gray-400 hover:text-gray-200">
              {useRecovery ? "Use passphrase" : "Forgot passphrase?"}
            </button>
            <button type="button" onClick={reset} className="text-sm text-red-400 hover:text-red-300 ml-auto">
              Lost both: reset vault
            </button>
          </div>
        </form>
      )}

      {v.state === "unlocked" && (
        <div className="flex gap-4 items-center text-sm">
          <span className="text-gray-400">Unlocked until {v.expires_at ? new Date(v.expires_at).toLocaleString() : "?"}</span>
          {legacy > 0 && v.legacy_migration === "on" && (
            <button disabled={busy} onClick={migrate} className="text-blue-400 hover:text-blue-300">
              Seal {legacy} unencrypted key{legacy === 1 ? "" : "s"}
            </button>
          )}
          <button disabled={busy} onClick={lock} className="text-red-400 hover:text-red-300 ml-auto">
            Lock now
          </button>
        </div>
      )}

      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
    </section>
  );
}

function TtlPicker({ ttl, setTtl }: { ttl: number; setTtl: (n: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-400">
      Stay unlocked for
      <select value={ttl} onChange={(e) => setTtl(Number(e.target.value))} className="bg-gray-800 rounded px-2 py-1">
        {TTLS.map((t) => (
          <option key={t.seconds} value={t.seconds}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
