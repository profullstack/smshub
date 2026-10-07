"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface NumberRow {
  id: string;
  number: string;
  friendly_name: string | null;
  managed: boolean;
  expires_at: string | null;
  release_at: string | null;
}

interface OrderRow {
  id: string;
  kind: "new" | "renew";
  area_code: string | null;
  months: number;
  amount_usd: number | string;
  chain: string;
  status: "pending" | "paid" | "active" | "failed" | "expired";
  pay_url: string | null;
  number: string | null;
  error: string | null;
  created_at: string;
}

interface Overview {
  ordering: { open: boolean; mode: string; reason?: string };
  pricing: { usd_per_month: number; chains: string[]; default_chain: string; grace_days: number };
  plan: { plan: "free" | "pro"; limits: Record<string, number | boolean>; usage: Record<string, number> };
  numbers: NumberRow[];
  orders: OrderRow[];
}

interface Text {
  id: string;
  from: string | null;
  body: string;
  otp: string | null;
  received_at: string;
}

const CHAIN_LABELS: Record<string, string> = {
  USDC_POL: "USDC (Polygon)",
  USDC_SOL: "USDC (Solana)",
  USDT_POL: "USDT (Polygon)",
  USDT_SOL: "USDT (Solana)",
  USDC_ETH: "USDC (Ethereum)",
  USDT_ETH: "USDT (Ethereum)",
  POL: "POL",
  SOL: "SOL",
  ETH: "ETH",
  BTC: "BTC",
};

const STATUS_TEXT: Record<OrderRow["status"], string> = {
  pending: "Waiting for payment",
  paid: "Paid, setting up your number",
  active: "Done",
  failed: "Failed, we will refund or fix it",
  expired: "Checkout expired",
};

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
}

export default function NumbersPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState("");
  const [months, setMonths] = useState(1);
  const [chain, setChain] = useState("");
  const [busy, setBusy] = useState(false);
  const [texts, setTexts] = useState<Record<string, Text[]>>({});
  const [watchOrder, setWatchOrder] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/numbers");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) {
      setError("Could not load your numbers");
      return;
    }
    const d = (await res.json()) as Overview;
    setData(d);
    setChain((c) => c || d.pricing.default_chain);
  }, []);

  useEffect(() => {
    load();
    setWatchOrder(new URLSearchParams(window.location.search).get("order"));
  }, [load]);

  // Coming back from CoinPay: follow the order until it settles.
  const watched = data?.orders.find((o) => o.id === watchOrder);
  useEffect(() => {
    if (!watchOrder || (watched && (watched.status === "active" || watched.status === "failed"))) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [watchOrder, watched, load]);

  // Latest texts on each rented number, refreshed every few seconds.
  const managedIds = (data?.numbers ?? []).filter((n) => n.managed).map((n) => n.id).join(",");
  useEffect(() => {
    if (!managedIds) return;
    const ids = managedIds.split(",");
    const pull = async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const r = await fetch(`/api/numbers/${id}/messages?limit=5`);
          return [id, r.ok ? ((await r.json()).messages as Text[]) : []] as const;
        })
      );
      setTexts(Object.fromEntries(entries));
    };
    pull();
    const t = setInterval(pull, 5000);
    return () => clearInterval(t);
  }, [managedIds]);

  const checkout = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Checkout failed");
      if (j.order?.pay_url) window.location.href = j.order.pay_url;
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">{error || "Loading..."}</div>;
  }

  const price = data.pricing.usd_per_month;
  const rented = data.numbers.filter((n) => n.managed);

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rented numbers</h1>
        <Link href="/inbox" className="text-sm text-gray-400 hover:text-white">
          ← Back to Inbox
        </Link>
      </div>

      {watched && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-200">
          Order for {watched.number || (watched.area_code ? `a ${watched.area_code} number` : "a number")}:{" "}
          <strong>{STATUS_TEXT[watched.status]}</strong>
          {watched.status === "pending" && watched.pay_url && (
            <>
              {" "}
              <a href={watched.pay_url} className="underline">
                Open the payment page
              </a>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
      )}

      <section className="space-y-4">
        {rented.length === 0 && <p className="text-gray-400">You have no rented numbers yet.</p>}
        {rented.map((n) => (
          <div key={n.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono text-lg">{n.number}</div>
                <div className="text-xs text-gray-500">
                  Paid until {fmtDate(n.expires_at)}; released {fmtDate(n.release_at)} if not renewed
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy || !data.ordering.open}
                  onClick={() => checkout(`/api/numbers/${n.id}/renew`, { months, chain })}
                  className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  Renew {months} mo (${(price * months).toFixed(2)})
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {(texts[n.id] ?? []).length === 0 && (
                <div className="text-sm text-gray-500">No texts yet. They show up here and in your inbox as they arrive.</div>
              )}
              {(texts[n.id] ?? []).map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="text-gray-500">{t.from}</span> <span className="text-gray-200">{t.body}</span>
                  </div>
                  {t.otp && (
                    <button
                      onClick={() => navigator.clipboard?.writeText(t.otp!)}
                      title="Copy code"
                      className="shrink-0 rounded bg-green-600/20 px-2 py-0.5 font-mono text-green-300"
                    >
                      {t.otp}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Rent a number</h2>
        <p className="text-sm text-gray-400">
          A US number that receives texts and verification codes, ${price}/month, paid in crypto through CoinPay.
          It is set up as soon as the payment confirms. Rented numbers receive only; some services refuse
          virtual numbers.
        </p>
        {!data.ordering.open ? (
          <p className="text-sm text-yellow-300">{data.ordering.reason}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              checkout("/api/numbers/orders", { area_code: areaCode, months, chain });
            }}
            className="grid gap-3 sm:grid-cols-4"
          >
            <input
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="Area code (any)"
              inputMode="numeric"
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2"
            />
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2"
            >
              {[1, 3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  {m} month{m > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2"
            >
              {data.pricing.chains.map((c) => (
                <option key={c} value={c}>
                  {CHAIN_LABELS[c] || c}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-green-600 px-4 py-2 font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Opening..." : `Pay $${(price * months).toFixed(2)}`}
            </button>
          </form>
        )}
        <p className="text-xs text-gray-500">
          Plan: {data.plan.plan === "pro" ? "Pro" : "Free"}. Renting a number unlocks Pro limits while it is active.
        </p>
      </section>

      {data.orders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Orders</h2>
          <div className="divide-y divide-gray-800 rounded-xl border border-gray-800">
            {data.orders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  {o.kind === "renew" ? "Renew" : "Rent"} {o.number || (o.area_code ? `(${o.area_code})` : "")} ·{" "}
                  {o.months} mo · ${Number(o.amount_usd).toFixed(2)} · {CHAIN_LABELS[o.chain] || o.chain}
                  <div className="text-xs text-gray-500">{fmtDate(o.created_at)}</div>
                </div>
                <div className="text-right">
                  <span className={o.status === "active" ? "text-green-400" : o.status === "failed" ? "text-red-400" : "text-gray-300"}>
                    {STATUS_TEXT[o.status]}
                  </span>
                  {o.status === "pending" && o.pay_url && (
                    <a href={o.pay_url} className="ml-2 underline">
                      Pay
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-gray-800 p-6 space-y-2 text-sm text-gray-400">
        <h2 className="text-base font-semibold text-gray-200">From a script or an agent</h2>
        <p>
          Create an API key in <Link href="/settings/api-keys" className="underline">Settings → API Keys</Link>, then:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-300">{`npx @profullstack/smshub numbers
npx @profullstack/smshub otp <number-id> --wait 60
curl -H "X-API-Key: $SMSHUB_API_KEY" https://smshub.dev/api/v1/numbers`}</pre>
        <p>
          MCP: <code>https://smshub.dev/api/mcp</code> with header <code>X-API-Key</code>.
        </p>
      </section>
    </div>
  );
}
