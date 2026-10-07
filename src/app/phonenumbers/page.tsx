import Link from "next/link";
import { WaitlistForm } from "@/components/waitlist-form";
import { priceUsdPerMonth } from "@/lib/plans";
import { managedMode } from "@/lib/telnyx/numbers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rent a phone number for SMS and verification codes | SMSHub",
  description:
    "Rent a US phone number, receive SMS and one-time codes in your inbox, by API, CLI or MCP. Pay with crypto through CoinPay.",
};

export default function PhoneNumbersPage() {
  const price = priceUsdPerMonth();
  const open = managedMode() === "live";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="space-y-4">
          <div className="text-6xl">📱</div>
          <h1 className="text-4xl font-bold text-white">Rent a number</h1>
          <p className="text-xl text-gray-400">
            A US number that receives texts and verification codes, ${price}/month.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-4 text-left">
          <Feature emoji="📥" title="Codes land in your inbox" desc="Texts appear the moment they arrive, with the one-time code pulled out." />
          <Feature emoji="🪙" title="Pay with crypto" desc="USDC, USDT, BTC, ETH, SOL or POL through CoinPay. No card, no account at a carrier." />
          <Feature emoji="⚡" title="Ready on payment" desc="The number is set up as soon as the payment confirms. Renew any time before it expires." />
          <Feature emoji="🤖" title="API, CLI and MCP" desc="Wait for a code from a script, a terminal or an AI agent with one call." />
          <Feature emoji="ℹ️" title="Receive only" desc="Rented numbers receive texts. Some services refuse virtual numbers for sign-up codes." />
        </div>

        <div className="space-y-4">
          <Link
            href="/numbers"
            className="inline-flex items-center justify-center rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-700"
          >
            {open ? "Rent a number" : "See plans"}
          </Link>
          {!open && (
            <>
              <p className="text-sm text-gray-500">Opening soon. Get an email when it does:</p>
              <WaitlistForm product="managed-numbers" />
            </>
          )}
          <p className="text-sm text-gray-500">
            Already have Twilio or Telnyx? <Link href="/settings" className="underline">Bring your own number</Link>.
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
