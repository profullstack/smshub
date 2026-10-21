"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LineNameEditor } from "@/components/line-name-editor";
import { CHECKOUT_WINDOW_MINUTES, checkoutWindowOpen } from "@/lib/coinpay/window";
import { safePayUrl, unfinishedOrder } from "@/lib/managed-numbers/recovery";

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
  phone_number_id?: string | null;
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
  PAYPAL: "PayPal",
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
  USDC_BASE: "USDC (Base)",
  USDT_TRON: "USDT (TRON)",
  BCH: "Bitcoin Cash (BCH)",
  DOGE: "Dogecoin (DOGE)",
  XRP: "XRP",
  ADA: "Cardano (ADA)",
  BNB: "BNB (BNB Smart Chain)",
};

const STATUS_TEXT: Record<OrderRow["status"], string> = {
  pending: "Waiting for payment",
  paid: "Paid, setting up your number",
  active: "Done",
  failed: "Failed, we will refund or fix it",
  expired: "Checkout expired",
};

/**
 * CoinPay's pay page dies CHECKOUT_WINDOW_MINUTES after the order is made, but
 * our row stays `pending` until the sweeper runs. Never offer a dead pay link.
 */
function payable(o: OrderRow, now: Date): boolean {
  return o.status === "pending" && checkoutWindowOpen(o.created_at, now);
}

function minutesLeft(o: OrderRow, now: Date): number {
  const end = new Date(o.created_at).getTime() + CHECKOUT_WINDOW_MINUTES * 60_000;
  return Math.max(1, Math.ceil((end - now.getTime()) / 60_000));
}

function statusText(o: OrderRow, now: Date): string {
  if (o.status === "pending" && !payable(o, now)) return "Checkout window closed";
  return STATUS_TEXT[o.status];
}

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
  const [now, setNow] = useState(() => new Date());

  // Re-render every 15s so a checkout's window closes on screen when CoinPay's does.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/numbers");
    if (res.status === 401) {
      // Most people who reach this signed out are new: sign up, then come back
      // here. The signup page links to sign in with the same `next`.
      window.location.href = `/register?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
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
      const pay = safePayUrl(j.order?.pay_url);
      if (pay) window.location.href = pay;
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

  const renamed = (id: string, friendly_name: string | null) =>
    setData((d) => (d ? { ...d, numbers: d.numbers.map((n) => (n.id === id ? { ...n, friendly_name } : n)) } : d));

  const price = data.pricing.usd_per_month;
  const rented = data.numbers.filter((n) => n.managed);
  // A checkout still inside its window: send people back to it instead of opening another.
  const openCheckout = data.orders.find((o) => payable(o, now) && safePayUrl(o.pay_url));
  // One click: the same number and months, a fresh checkout window.
  const retry = (o: OrderRow, method?: string) =>
    checkout(`/api/numbers/orders/${o.id}/reopen`, method ? { chain: method } : {});
  const unfinished = !openCheckout && data.ordering.open ? unfinishedOrder(data.orders, now) : null;
  const coins = data.pricing.chains.filter((c) => c !== "PAYPAL");
  const payByPaypal = chain === "PAYPAL";

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
          <strong>{statusText(watched, now)}</strong>
          {payable(watched, now) && safePayUrl(watched.pay_url) && (
            <>
              {" "}
              <a href={safePayUrl(watched.pay_url)!} className="underline">
                Open the payment page ({minutesLeft(watched, now)} min left)
              </a>
            </>
          )}
        </div>
      )}

      {openCheckout && openCheckout.id !== watched?.id && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-200">
          You have a checkout open for ${Number(openCheckout.amount_usd).toFixed(2)} in{" "}
          {CHAIN_LABELS[openCheckout.chain] || openCheckout.chain}.{" "}
          <a href={safePayUrl(openCheckout.pay_url)!} className="font-semibold underline">
            Continue paying ({minutesLeft(openCheckout, now)} min left)
          </a>
        </div>
      )}

      {unfinished && unfinished.id !== watched?.id && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100 space-y-3">
          <div>
            Your order for {unfinished.kind === "renew" ? "a renewal" : unfinished.area_code ? `a ${unfinished.area_code} number` : "a US number"}{" "}
            (${Number(unfinished.amount_usd).toFixed(2)}, {unfinished.months} mo) was not paid before the checkout closed.
            Nothing was charged. Pick it up where you left off:
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => retry(unfinished)}
              className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              Finish your order ({CHAIN_LABELS[unfinished.chain] || unfinished.chain})
            </button>
            {unfinished.chain !== "PAYPAL" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => retry(unfinished, "PAYPAL")}
                className="rounded-lg bg-[#ffc439] px-4 py-2 font-semibold text-gray-900 hover:bg-[#f2b92f] disabled:opacity-50"
              >
                Pay with PayPal instead
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
      )}

      {data.numbers.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Your lines</h2>
          <p className="text-sm text-gray-400">
            Every number lands in one inbox. Name each line (one per family member, say) and filter the inbox by it.
          </p>
          <div className="divide-y divide-gray-800 rounded-xl border border-gray-800">
            {data.numbers.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <LineNameEditor
                  numberId={n.id}
                  number={n.number}
                  name={n.friendly_name}
                  onSaved={(name) => renamed(n.id, name)}
                  onError={setError}
                />
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="font-mono">{n.number}</span>
                  <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs">{n.managed ? "rented" : "your provider"}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        {rented.length === 0 && <p className="text-gray-400">You have no rented numbers yet.</p>}
        {rented.map((n) => (
          <div key={n.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono text-lg">
                  {n.number}
                  {n.friendly_name && <span className="ml-2 font-sans text-base text-gray-400">{n.friendly_name}</span>}
                </div>
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
          A US number that receives texts and verification codes, ${price}/month, paid with PayPal or in
          any of {coins.length} cryptocurrencies through CoinPay.
          It is set up as soon as the payment confirms. Rented numbers receive only; some services refuse
          virtual numbers.
        </p>
        <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 text-sm text-gray-300 space-y-2">
          <div className="font-semibold text-gray-200">How paying works</div>
          <ol className="list-decimal pl-5 space-y-1 text-gray-400">
            <li>
              Have the coins in a wallet first (MetaMask, Trust Wallet, Exodus, Phantom...). An exchange
              withdrawal can take longer than the checkout stays open.
            </li>
            <li>
              Press Pay: CoinPay shows an address and an exact amount (a few cents over ${price} covers the network
              fee). Send exactly that, on the network you picked. USDC on Polygon costs the least to send.
            </li>
            <li>
              No crypto? Pick <strong className="text-gray-300">PayPal</strong> and pay ${price} a month on
              PayPal&apos;s page. The number is set up once PayPal confirms the payment.
            </li>
            <li>
              The payment page stays open for {CHECKOUT_WINDOW_MINUTES} minutes. If it closes before you pay, press
              Finish your order here and you get a fresh one in one click. If you already sent the coins, do not pay again: a late payment is still credited,
              it only takes longer.
            </li>
          </ol>
        </div>
        {!data.ordering.open ? (
          <p className="text-sm text-yellow-300">{data.ordering.reason}</p>
        ) : (
          <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How to pay">
            <button
              type="button"
              role="radio"
              aria-checked={payByPaypal}
              onClick={() => setChain("PAYPAL")}
              className={`rounded-lg border px-4 py-3 text-left ${payByPaypal ? "border-[#ffc439] bg-[#ffc439]/10" : "border-gray-700 bg-gray-950 hover:border-gray-500"}`}
            >
              <div className="font-semibold text-white">PayPal</div>
              <div className="text-xs text-gray-400">No crypto needed. Pay on PayPal&apos;s own page.</div>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!payByPaypal}
              onClick={() => setChain(data.pricing.default_chain)}
              className={`rounded-lg border px-4 py-3 text-left ${!payByPaypal ? "border-green-500 bg-green-500/10" : "border-gray-700 bg-gray-950 hover:border-gray-500"}`}
            >
              <div className="font-semibold text-white">Crypto</div>
              <div className="text-xs text-gray-400">
                {coins.length} coins: USDC, USDT, BTC, ETH, SOL and more.
              </div>
            </button>
          </div>
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
            {payByPaypal ? (
              <div className="flex items-center rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-gray-300">
                PayPal
              </div>
            ) : (
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value)}
                aria-label="Coin"
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2"
              >
                {coins.map((c) => (
                  <option key={c} value={c}>
                    {CHAIN_LABELS[c] || c}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-green-600 px-4 py-2 font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Opening..." : `Pay $${(price * months).toFixed(2)}${payByPaypal ? " with PayPal" : ""}`}
            </button>
          </form>
          </div>
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
                    {statusText(o, now)}
                  </span>
                  {payable(o, now) && safePayUrl(o.pay_url) && (
                    <a href={safePayUrl(o.pay_url)!} className="ml-2 underline">
                      Pay ({minutesLeft(o, now)} min left)
                    </a>
                  )}
                  {(o.status === "expired" || (o.status === "pending" && !payable(o, now))) &&
                    data.ordering.open &&
                    !openCheckout && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => retry(o)}
                        className="ml-2 underline disabled:opacity-50"
                      >
                        Finish this order
                      </button>
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
          MCP: <code>https://smshub.dev/api/mcp</code> with header <code>X-API-Key</code>. <Link href="/docs/api" className="underline">Full API, CLI and MCP docs</Link>.
        </p>
      </section>
    </div>
  );
}
