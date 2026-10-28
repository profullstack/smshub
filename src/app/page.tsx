import Link from "next/link";
import { SisterSimLink } from "@/components/sister-sim-link";
import { PLANS, priceUsdPerMonth } from "@/lib/plans";
import { getBrand } from "@/lib/brand-server";
import { StationHome } from "@/components/station/station-home";

export const dynamic = "force-dynamic";

export const metadata = { alternates: { canonical: "/" } };

export default async function LandingPage() {
  if ((await getBrand()).id === "numberstation") return <StationHome />;
  const price = priceUsdPerMonth();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-block bg-green-600/10 border border-green-600/20 text-green-400 text-sm font-medium px-4 py-1.5 rounded-full">
            Real US phone numbers · ${price}/month
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
            A real number for
            <br />
            <span className="text-blue-500">your verification codes</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto">
            Rent your own US phone number and receive SMS and one-time codes in your inbox, by API, CLI or MCP.
            ${price} a month, paid in crypto through CoinPay. No card, no carrier contract.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/numbers"
              className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold text-lg transition-colors"
            >
              Rent a number · ${price}/mo
            </Link>
            <Link
              href="/verification-numbers"
              className="px-8 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg font-semibold text-lg transition-colors"
            >
              How it works
            </Link>
          </div>

          <p className="text-sm text-gray-500">
            Receive only. The number is yours alone while it is paid. Some services refuse virtual numbers for
            sign-up codes.
          </p>
          <p className="text-xs text-gray-600">
            <SisterSimLink />
          </p>
        </div>
      </section>

      {/* How renting works */}
      <section className="py-16 px-4 border-t border-gray-800">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
          <FeatureCard
            emoji="1️⃣"
            title="Create an account"
            desc="Sign up with your email. Free, and you can bring your own Twilio or Telnyx number later."
          />
          <FeatureCard
            emoji="2️⃣"
            title={`Pay $${price} in crypto`}
            desc="Pick an area code if you want one, then pay with USDC, USDT, BTC, ETH, SOL or POL through CoinPay."
          />
          <FeatureCard
            emoji="3️⃣"
            title="Receive your codes"
            desc="The number is set up as soon as the payment confirms. Texts show up in seconds with the code pulled out."
          />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 border-t border-gray-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything you need for SMS</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              A complete messaging platform that works across every device and integrates with your favorite providers.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              emoji="💬"
              title="Unified Inbox"
              desc="All your conversations in one place. Threaded messages with real-time updates across every device."
            />
            <FeatureCard
              emoji="⚡"
              title="Real-time Messaging"
              desc="Sub-second delivery with live status updates. See when messages are sent, delivered, or failed."
            />
            <FeatureCard
              emoji="🔌"
              title="Multi-Provider"
              desc="Connect Twilio, Telnyx, or phonenumbers.bot. Switch providers without changing your workflow."
            />
            <FeatureCard
              emoji="🤖"
              title="AI Auto-Replies"
              desc="Let AI suggest replies based on conversation context. Powered by OpenAI, customizable per conversation."
            />
            <FeatureCard
              emoji="📊"
              title="Campaigns & Analytics"
              desc="Send bulk messages, track delivery rates, and analyze messaging performance from your dashboard."
            />
            <FeatureCard
              emoji="👥"
              title="Team Inbox"
              desc="Share phone numbers with your team. Collaborate on conversations with role-based access."
            />
            <FeatureCard
              emoji="🔗"
              title="Webhooks & API"
              desc="White-label API with API key auth. Outbound webhooks for message events with HMAC signing."
            />
            <FeatureCard
              emoji="📱"
              title="Every Platform"
              desc="Web, iOS, Android, desktop (Electron), and PWA. Offline support with message queuing."
            />
            <FeatureCard
              emoji="🖼️"
              title="MMS Support"
              desc="Send and receive images and media. Inline image preview right in your conversations."
            />
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section className="py-20 px-4 bg-gray-900/50 border-t border-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-12">Available everywhere</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <PlatformBadge emoji="🌐" label="Web" status="live" />
            <PlatformBadge emoji="📲" label="PWA" status="live" />
            <PlatformBadge emoji="📱" label="iOS" status="coming-soon" />
            <PlatformBadge emoji="🤖" label="Android" status="coming-soon" />
            <PlatformBadge emoji="🖥" label="Desktop" status="live" />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 border-t border-gray-800">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Pricing</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Bring your own provider for free, or rent a number from us for ${price} a month.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <PricingCard
              name="Free"
              price="$0"
              period="/mo"
              features={[
                "Bring your own Twilio or Telnyx",
                `${PLANS.free.byoNumbers} phone numbers`,
                `${PLANS.free.apiKeys} API keys, ${PLANS.free.webhooks} webhook`,
                "Web, PWA, desktop, API, CLI, MCP",
              ]}
              cta="Get Started"
              href="/register"
            />
            <PricingCard
              name="Rented number"
              price={`$${price}`}
              period="/mo per number"
              features={[
                "A US number for SMS and verification codes",
                "Codes in your inbox, API, CLI and MCP",
                "Pay with crypto through CoinPay, 1 to 12 months",
                `Unlocks Pro: ${PLANS.pro.byoNumbers} numbers, ${PLANS.pro.apiKeys} API keys, AI replies`,
              ]}
              cta="Rent a number"
              href="/numbers"
              featured
            />
          </div>
        </div>
      </section>

      {/* API */}
      <section id="api" className="py-20 px-4 bg-gray-900/50 border-t border-gray-800">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Developer-first API</h2>
            <p className="text-gray-400 text-lg">
              Integrate SMS into your app with a simple REST API.
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-x-auto">
            <pre className="text-sm text-gray-300">
              <code>{`curl -X POST https://smshub.dev/api/v1/messages/send \\
  -H "X-API-Key: your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+1234567890",
    "from": "+0987654321",
    "message": "Hello from SMSHub!"
  }'`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 border-t border-gray-800">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold">Need a number for a code?</h2>
          <p className="text-gray-400 text-lg">
            Create your account, pay ${price} in crypto, and your number is ready once the payment confirms.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/numbers"
              className="inline-block px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold text-lg transition-colors"
            >
              Rent a number · ${price}/mo
            </Link>
            <Link
              href="/register"
              className="inline-block px-8 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg font-semibold text-lg transition-colors"
            >
              Start free with your own provider
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
      <span className="text-3xl">{emoji}</span>
      <h3 className="text-lg font-semibold mt-3 mb-2">{title}</h3>
      <p className="text-sm text-gray-400">{desc}</p>
    </div>
  );
}

function PlatformBadge({
  emoji,
  label,
  status = "live",
}: {
  emoji: string;
  label: string;
  status?: "live" | "coming-soon";
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center relative">
      <span className="text-3xl">{emoji}</span>
      <div className="text-sm font-medium mt-2">{label}</div>
      {status === "coming-soon" ? (
        <span className="text-[10px] text-yellow-400 font-medium mt-1 block">Coming Soon</span>
      ) : (
        <span className="text-[10px] text-green-400 font-medium mt-1 block">Available</span>
      )}
    </div>
  );
}

function AppCard({
  emoji,
  title,
  desc,
  badge,
  badgeColor = "yellow",
  href,
}: {
  emoji: string;
  title: string;
  desc: string;
  badge: string;
  badgeColor?: "yellow" | "green";
  href?: string;
}) {
  const colors = badgeColor === "green"
    ? "bg-green-500/10 border-green-500/20 text-green-400"
    : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400";

  const content = (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center hover:border-gray-700 transition-colors">
      <span className="text-4xl">{emoji}</span>
      <div className={`inline-block ${colors} border text-xs font-semibold px-3 py-1 rounded-full mt-3`}>
        {badge}
      </div>
      <h3 className="text-lg font-semibold mt-3 mb-2">{title}</h3>
      <p className="text-sm text-gray-400">{desc}</p>
      {href && (
        <span className="text-xs text-blue-400 mt-3 block">Download →</span>
      )}
    </div>
  );

  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer">{content}</a>;
  }
  return content;
}

function PricingCard({
  name,
  price,
  period,
  features,
  cta,
  href,
  featured = false,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  href: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-6 border ${
        featured
          ? "bg-blue-600/10 border-blue-600/30"
          : "bg-gray-900 border-gray-800"
      }`}
    >
      {featured && (
        <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">
          For verification codes
        </div>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-2 mb-4">
        <span className="text-4xl font-bold">{price}</span>
        <span className="text-gray-400">{period}</span>
      </div>
      <ul className="space-y-2 mb-6">
        {features.map((f) => (
          <li key={f} className="text-sm text-gray-300 flex items-center gap-2">
            <span className="text-green-400">✓</span> {f}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`block text-center py-2 rounded-lg font-medium transition-colors ${
          featured
            ? "bg-blue-600 hover:bg-blue-700"
            : "bg-gray-800 hover:bg-gray-700 border border-gray-700"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}
