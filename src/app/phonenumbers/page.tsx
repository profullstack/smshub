"use client";

import Link from "next/link";

export default function PhoneNumbersBotPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="space-y-4">
          <div className="text-6xl">📱</div>
          <h1 className="text-4xl font-bold text-white">
            phonenumbers.bot
          </h1>
          <p className="text-xl text-gray-400">
            Real SIM phone numbers with a developer-first API
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6">
          <div className="inline-block bg-blue-600/20 text-blue-400 text-sm font-semibold px-4 py-1.5 rounded-full">
            Coming Soon
          </div>

          <div className="space-y-4 text-left">
            <Feature
              emoji="🔌"
              title="REST API"
              desc="Send & receive SMS programmatically with real SIM numbers"
            />
            <Feature
              emoji="🌍"
              title="Global Numbers"
              desc="Local numbers in 50+ countries — no carrier contracts"
            />
            <Feature
              emoji="⚡"
              title="Instant Provisioning"
              desc="Get a number and start sending in under 60 seconds"
            />
            <Feature
              emoji="💰"
              title="Pay-as-you-go"
              desc="No monthly minimums — pay only for what you use"
            />
            <Feature
              emoji="🔒"
              title="Real SIM, Not VoIP"
              desc="Bypass VoIP detection — works with 2FA, verifications, and more"
            />
            <Feature
              emoji="🔗"
              title="SMSHub Integration"
              desc="Use as a provider alongside Twilio & Telnyx in SMSHub"
            />
          </div>
        </div>

        <div className="space-y-4">
          <form className="flex gap-2 max-w-sm mx-auto">
            <input
              type="email"
              placeholder="you@example.com"
              className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
            />
            <button
              type="button"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold transition-colors whitespace-nowrap"
            >
              Notify Me
            </button>
          </form>
          <p className="text-sm text-gray-500">
            Be first to get access when we launch
          </p>
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

function Feature({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-xl mt-0.5">{emoji}</span>
      <div>
        <div className="font-medium text-white">{title}</div>
        <div className="text-sm text-gray-400">{desc}</div>
      </div>
    </div>
  );
}
