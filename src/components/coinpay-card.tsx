"use client";

import { useEffect, useState } from "react";

type Status = {
  connected: boolean;
  connection: { email: string | null; name: string | null } | null;
  configured: boolean;
  canDisconnect?: boolean;
};

const NOTICES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "CoinPay connected. You can sign in with it from now on." },
  welcome: { ok: true, text: "Welcome. You signed in with CoinPay, which is how you get back in." },
};

const REASONS: Record<string, string> = {
  linked_elsewhere: "That CoinPay account is already connected to another smshub account.",
  already_connected: "This account is already connected to a different CoinPay account. Disconnect it first.",
  not_signed_in: "Sign in first, then connect CoinPay.",
  cancelled: "CoinPay was cancelled.",
  token_exchange: "CoinPay couldn't be reached. Try again.",
  not_configured: "CoinPay is not configured on this server.",
};

// Connect / Disconnect CoinPay: a connected CoinPay account is also a way to
// sign in. Reads /api/coinpay/status; disconnect is POST /api/coinpay/disconnect,
// which refuses when CoinPay is the only way into the account.
export function CoinpayCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/coinpay/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setStatus(b))
      .catch(() => null);

  useEffect(() => {
    void load();
    const q = new URLSearchParams(window.location.search);
    const flag = q.get("coinpay");
    if (flag && NOTICES[flag]) setMessage(NOTICES[flag]);
    else if (flag === "error") setMessage({ ok: false, text: REASONS[q.get("reason") ?? ""] ?? "CoinPay did not connect." });
  }, []);

  const disconnect = async () => {
    setBusy(true);
    setMessage(null);
    const r = await fetch("/api/coinpay/disconnect", { method: "POST" }).catch(() => null);
    const b = r ? await r.json().catch(() => ({})) : {};
    setMessage(r?.ok ? { ok: true, text: "CoinPay disconnected." } : { ok: false, text: b.error || "Could not disconnect CoinPay." });
    await load();
    setBusy(false);
  };

  if (!status) return null;

  return (
    <section id="coinpay" className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3">
      <h2 className="text-lg font-semibold">CoinPay</h2>
      {status.connected ? (
        <>
          <p className="text-sm text-gray-400">
            Connected{status.connection?.email ? ` (${status.connection.email})` : ""}. You can sign in with CoinPay.
          </p>
          {status.canDisconnect ? (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
            >
              {busy ? "Disconnecting..." : "Disconnect CoinPay"}
            </button>
          ) : (
            <p className="text-sm text-gray-500">CoinPay is the only way into this account, so it can&apos;t be disconnected.</p>
          )}
        </>
      ) : status.configured ? (
        <>
          <p className="text-sm text-gray-400">Connect your CoinPay account to sign in with it.</p>
          <a
            href="/api/coinpay/connect"
            className="inline-block rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600"
          >
            Connect CoinPay
          </a>
        </>
      ) : (
        <p className="text-sm text-gray-500">Sign in with CoinPay is not available on this server.</p>
      )}
      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-300" : "text-red-400"}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
