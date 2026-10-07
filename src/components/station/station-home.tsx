import Link from "next/link";
import { priceUsdPerMonth } from "@/lib/plans";
import { StationMark } from "./station-logo";
import { InstallButton } from "./install-button";

const FEED = [
  { from: "Bank", line: "··0137", body: "Your sign-in code is", code: "482 913", ago: "now" },
  { from: "+1 415 555 0142", line: "··9471", body: "Running 10 late, still on for 7?", code: null, ago: "2m" },
  { from: "Marketplace", line: "··0137", body: "Verification code", code: "7051", ago: "9m" },
  { from: "Kim", line: "··9471", body: "Missed call · 0:42 recording", code: null, ago: "1h" },
];

const STEPS = [
  {
    n: "01",
    title: "Rent a number",
    body: "Pick a US area code and pay in USDC, USDT, BTC, ETH, SOL or POL. The number is yours as soon as the payment settles.",
  },
  {
    n: "02",
    title: "Hand it out",
    body: "Use it for sign-ups, listings, two-factor codes, or give one to each person in the family. Your own number stays private.",
  },
  {
    n: "03",
    title: "Watch it land",
    body: "Texts appear live on the receiver the instant they arrive. Codes are pulled out and copied with one tap.",
  },
];

const FEATURES = [
  { title: "Codes, lifted out", body: "One-time codes are spotted in every text and shown big, ready to copy. No squinting at a notification." },
  { title: "Every line, one inbox", body: "Run several numbers side by side, name each one, and filter the receiver to a single line." },
  { title: "Live, not polled", body: "A streaming connection keeps the receiver on air, so a new sender shows up without a refresh." },
  { title: "An app, without a store", body: "Install it to your home screen on iPhone, Android or desktop. It opens full-screen like any app." },
  { title: "Built for agents too", body: "A REST API, a CLI and an MCP server can rent a number and wait for the code, so automations finish sign-ups." },
  { title: "Bring your own carrier", body: "Already on Telnyx or Twilio? Connect your keys and your existing numbers join the same receiver." },
];

export function StationHome() {
  const price = priceUsdPerMonth();

  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:pt-20">
        <div className="space-y-7">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.25em] text-emerald-300">
            <span className="station-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />
            On air
          </p>
          <h1 className="text-5xl font-bold leading-[1.02] tracking-tight text-gray-50 sm:text-6xl">
            Private numbers,
            <br />
            <span className="text-blue-400">live on one receiver.</span>
          </h1>
          <p className="max-w-xl text-lg text-gray-400">
            Rent a phone number in a minute and watch every text, one-time code and call land in a single app. Pay in
            crypto. No card, no SIM, no contract.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="rounded-full bg-blue-600 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Get a number
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-gray-700 px-7 py-3.5 text-base font-semibold text-gray-200 transition-colors hover:border-gray-500"
            >
              Open the receiver
            </Link>
          </div>
          <p className="font-mono text-xs text-gray-500">
            From ${price}/month per number · US local numbers · cancel by not renewing
          </p>
        </div>

        {/* The receiver, as a phone */}
        <div className="relative mx-auto w-full max-w-sm">
          <div className="absolute -inset-10 -z-10 rounded-full bg-blue-600/15 blur-3xl" aria-hidden="true" />
          <div className="rounded-[2.4rem] border border-gray-700 bg-gray-950 p-2.5 shadow-2xl shadow-black/60">
            <div className="station-scanlines overflow-hidden rounded-[1.9rem] border border-gray-800 bg-gray-950">
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                <span className="flex items-center gap-2">
                  <StationMark className="h-6 w-6" />
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-200">Receiver</span>
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">
                  <span className="station-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  On air
                </span>
              </div>
              <ul className="divide-y divide-gray-800/70" aria-label="Example messages">
                {FEED.map((m, i) => (
                  <li key={i} className="station-rise space-y-1.5 px-4 py-3" style={{ animationDelay: `${i * 120}ms` }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-gray-100">{m.from}</span>
                      <span className="font-mono text-[10px] text-gray-500">
                        {m.line} · {m.ago}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">{m.body}</p>
                    {m.code && (
                      <div className="flex items-center justify-between rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-1.5">
                        <span className="font-mono text-xl font-semibold tracking-[0.18em] text-blue-200">{m.code}</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-300">Copy</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-4 border-t border-gray-800 py-2.5 text-center font-mono text-[9px] uppercase tracking-wider text-gray-500">
                <span className="text-blue-400">Receiver</span>
                <span>Numbers</span>
                <span>Lines</span>
                <span>Settings</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-gray-800 bg-gray-900/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-blue-400">How it works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-gray-800 bg-gray-950 p-6">
                <span className="font-mono text-3xl font-semibold text-gray-700">{s.n}</span>
                <h3 className="mt-4 text-xl font-semibold text-gray-100">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-gray-50 sm:text-4xl">
          Made for the moment a code is on its way.
        </h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-gray-800 bg-gray-800 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-gray-950 p-6">
              <h3 className="font-semibold text-gray-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid items-center gap-10 rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-950 p-8 md:grid-cols-2 md:p-12">
          <div className="space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-blue-400">One price</h2>
            <p className="text-6xl font-bold tracking-tight text-gray-50">
              ${price}
              <span className="text-xl font-medium text-gray-500"> / number / month</span>
            </p>
            <p className="text-gray-400">
              Pay for as many months as you like up front. No subscription to cancel: a number you stop renewing is
              released after a short grace period.
            </p>
          </div>
          <ul className="space-y-3 text-sm text-gray-300">
            {[
              "Unlimited incoming texts and codes",
              "Live receiver on every device you sign in on",
              "Name your lines and filter by each",
              "API keys, webhooks and AI reply drafts while a number is active",
              "Paid in crypto through CoinPay, no card on file",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                {item}
              </li>
            ))}
            <li className="pt-3">
              <Link
                href="/register"
                className="inline-block rounded-full bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get a number
              </Link>
            </li>
          </ul>
        </div>
      </section>

      {/* Install */}
      <section className="border-t border-gray-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-16 text-center sm:px-6">
          <StationMark className="h-14 w-14" />
          <h2 className="text-2xl font-bold text-gray-50">Keep the receiver on your home screen.</h2>
          <p className="max-w-md text-sm text-gray-400">
            Number Station installs straight from the browser on iPhone, Android, Mac and Windows. No app store.
          </p>
          <InstallButton />
        </div>
      </section>
    </div>
  );
}
