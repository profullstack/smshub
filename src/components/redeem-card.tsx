"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// "Have a code?": redeem a credit code for store credit that pays for rented
// numbers. Reads and writes /api/v1/credits and /api/v1/redeem.
export function RedeemCard() {
  const [code, setCode] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setBalance(typeof b?.balance_usd === "number" ? b.balance_usd : null))
      .catch(() => null);
  }, []);

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setMessage(null);
    const r = await fetch("/api/v1/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    const b = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && b.ok) {
      setBalance(b.balance_usd);
      setCode("");
      setMessage({ ok: true, text: `Added $${Number(b.credit_usd).toFixed(2)} of credit. You now have $${Number(b.balance_usd).toFixed(2)}.` });
    } else {
      setMessage({ ok: false, text: b.error || "Could not redeem the code." });
    }
    setBusy(false);
  };

  return (
    <section id="redeem" className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Have a code?</h2>
        {balance !== null && (
          <span className="text-sm text-gray-400">
            Store credit: <strong className="text-emerald-300">${balance.toFixed(2)}</strong>
          </span>
        )}
      </div>
      <p className="text-sm text-gray-400">
        Credit pays for rented numbers: pick &quot;Pay with store credit&quot; on{" "}
        <Link href="/numbers" className="underline">Rented numbers</Link>. Got invites to give?{" "}
        <Link href="/invites" className="underline">Invite friends</Link>.
      </p>
      <form onSubmit={redeem} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CR-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          aria-label="Credit code"
          className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono uppercase"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {busy ? "Redeeming..." : "Redeem"}
        </button>
      </form>
      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-300" : "text-red-400"}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
