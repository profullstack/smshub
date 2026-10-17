import type { Metadata } from "next";
import Link from "next/link";
import { priceUsdPerMonth } from "@/lib/plans";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const price = priceUsdPerMonth();
  return {
    title: "Phone number for SMS verification codes | SMSHub",
    description: `Rent your own US phone number for $${price}/month and receive SMS verification codes (OTP) in your inbox, by API, CLI or MCP. Pay with crypto through CoinPay.`,
    alternates: { canonical: "/verification-numbers" },
  };
}

export default function VerificationNumbersPage() {
  const price = priceUsdPerMonth();

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-12">
      <section className="text-center space-y-6">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          A phone number for SMS verification codes
        </h1>
        <p className="text-lg text-gray-400">
          Rent your own US number for ${price} a month. Texts and one-time codes arrive in your SMSHub inbox
          within seconds, with the code pulled out and ready to copy. Pay with crypto through CoinPay.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/numbers"
            className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold text-lg transition-colors"
          >
            Rent a number · ${price}/mo
          </Link>
          <Link
            href="/login?next=/numbers"
            className="px-8 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg font-semibold text-lg transition-colors"
          >
            I have an account
          </Link>
        </div>
      </section>

      <Section title="How it works">
        <ol className="list-decimal pl-6 space-y-2">
          <li>Create a free SMSHub account with your email and confirm it.</li>
          <li>
            Pick an area code (or take any), choose 1, 3, 6 or 12 months, and pay ${price}/month in USDC, USDT,
            BTC, ETH, SOL or POL through CoinPay.
          </li>
          <li>Your number is set up as soon as the payment confirms. Use it wherever a site asks for a phone number.</li>
          <li>The text with your code shows up in your inbox and on the Numbers page. Renew any time before it expires.</li>
        </ol>
      </Section>

      <Section title="What you get">
        <ul className="list-disc pl-6 space-y-2">
          <li>A real US phone number on the Telnyx network, assigned to you alone while it is paid. It is not shared with other users.</li>
          <li>Every incoming text kept in your inbox, not only the latest code.</li>
          <li>
            Codes from a script or an AI agent: <code>npx @profullstack/smshub otp &lt;number-id&gt; --wait 60</code>,
            the REST API, or the MCP server.
          </li>
          <li>Pro limits on your account while the number is active: more numbers, API keys and AI replies.</li>
        </ul>
      </Section>

      <Section title="Before you pay">
        <ul className="list-disc pl-6 space-y-2">
          <li>Rented numbers receive texts. They do not send texts or take calls.</li>
          <li>
            Some services refuse virtual (VoIP) numbers for sign-up codes. We cannot promise that any particular
            site will accept the number or send to it.
          </li>
          <li>Numbers are US only for now.</li>
          <li>
            If you do not renew, the number is released after a short grace period and may later go to someone else.
            Move anything important, such as account recovery, off it before then.
          </li>
          <li>
            Use it for your own accounts. Fraud, creating accounts in bulk, and evading another service&apos;s bans
            or limits are against our <Link href="/terms" className="text-blue-400 hover:text-blue-300">terms</Link>.
          </li>
        </ul>
      </Section>

      <Section title="Already have Twilio or Telnyx?">
        <p>
          Bring your own number for free instead: connect it in Settings and its texts land in the same inbox.{" "}
          <Link href="/register" className="text-blue-400 hover:text-blue-300">Create a free account</Link>.
        </p>
      </Section>

      <div className="text-center">
        <Link
          href="/numbers"
          className="inline-block px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold text-lg transition-colors"
        >
          Rent a number · ${price}/mo
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 text-gray-300">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}
