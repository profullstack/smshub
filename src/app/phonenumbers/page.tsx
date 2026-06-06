"use client";

import Link from "next/link";
import { useState } from "react";

export default function PhoneNumbersBotPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatus("error");
      setMessage("Please enter a valid email address");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, product: "phonenumbers-bot" }),
      });

      if (res.ok) {
        setStatus("success");
        setMessage("You're on the list! We'll notify you when we launch.");
        setEmail("");
      } else {
        const data = await res.json();
        setStatus("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="space-y-4">
          <div className="text-6xl">📱</div>
          <h1 className="text-4xl font-bold text-white">
            phonenumbers.bot
          </h1>
          <p className="text-xl text-gray-400">
            Buy managed phone numbers with CoinPay
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6">
          <div className="inline-block bg-green-600/20 text-green-400 text-sm font-semibold px-4 py-1.5 rounded-full">
            Managed Numbers Live!
          </div>

          <div className="space-y-4 text-left">
            <Feature
              emoji="🪙"
              title="CoinPay Checkout"
              badge="Live!"
              desc="Connect CoinPay once and buy numbers without provider setup"
            />
            <Feature
              emoji="🛒"
              title="Managed Inventory"
              badge="Live!"
              desc="Buy from Twilio, Telnyx, or phonenumbers.bot inside SMSHub"
            />
            <Feature
              emoji="💵"
              title="Simple Pricing"
              desc="Numbers are sold at provider cost plus a 200% markup"
            />
            <Feature
              emoji="⚡"
              title="Instant Setup"
              desc="No Twilio or Telnyx credentials required"
            />
            <Feature
              emoji="🔒"
              title="Real SIM, Not VoIP"
              desc="Use phonenumbers.bot when a real SIM source is required"
            />
            <Feature
              emoji="🔗"
              title="SMSHub Integration"
              badge="Live!"
              desc="Purchased numbers land in your SMSHub inbox"
            />
          </div>
        </div>

        <div className="space-y-4">
          <a
            href="/api/coinpay/connect"
            className="inline-flex items-center justify-center rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-700"
          >
            Connect CoinPay
          </a>
          <p className="text-sm text-gray-500">
            Available on the $15/mo plan for managed number purchases.
          </p>

          {status === "success" ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <p className="text-green-400 font-medium">✅ {message}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                placeholder="you@example.com"
                disabled={status === "loading"}
                className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl font-semibold transition-colors whitespace-nowrap"
              >
                {status === "loading" ? "Joining..." : "Notify Me"}
              </button>
            </form>
          )}
          {status === "error" && (
            <p className="text-sm text-red-400">{message}</p>
          )}
          {status !== "success" && <p className="text-sm text-gray-500">Join the rollout list for bulk inventory access.</p>}
        </div>

        <div className="pt-4 border-t border-gray-800">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Back to SMSHub
          </Link>
        </div>
      </div>
    </div>
  );
}

function Feature({
  emoji,
  title,
  desc,
  badge,
}: {
  emoji: string;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-xl mt-0.5">{emoji}</span>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{title}</span>
          {badge && (
            <span className="rounded-full bg-green-600/20 px-2 py-0.5 text-xs font-semibold text-green-400">
              {badge}
            </span>
          )}
        </div>
        <div className="text-sm text-gray-400">{desc}</div>
      </div>
    </div>
  );
}
