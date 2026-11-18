import type { Metadata } from "next";
import Link from "next/link";
import { priceUsdPerMonth } from "@/lib/plans";
import { CHECKOUT_WINDOW_MINUTES } from "@/lib/coinpay/window";
import { MCP_URL, NPM_PACKAGE } from "@/lib/developer-api";
import { getBrandSiteUrl } from "@/lib/brand-server";
import { SisterSimLink } from "@/components/sister-sim-link";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const price = priceUsdPerMonth();
  return {
    title: "An SMS inbox for your AI agent | SMSHub",
    description: `Give your AI agent its own US phone number for $${price}/month. It reads incoming texts and one-time codes through MCP, the REST API or the CLI, not through your personal phone. Receive-only.`,
    alternates: { canonical: "/agents" },
  };
}

export default async function AgentsPage() {
  const price = priceUsdPerMonth();
  const site = await getBrandSiteUrl();

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-12">
      <section className="text-center space-y-6">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Give your AI agent an SMS inbox, not your personal phone
        </h1>
        <p className="text-lg text-gray-400">
          A dedicated US number for ${price} a month. Your agent reads the texts sent to it through MCP, the REST
          API or the CLI, with one-time codes already pulled out. The number receives texts only.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/numbers"
            className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold text-lg transition-colors"
          >
            Get your agent a number · ${price}/mo
          </Link>
          <Link
            href="/docs/api#mcp"
            className="px-8 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg font-semibold text-lg transition-colors"
          >
            Read the API docs
          </Link>
        </div>
      </section>

      <Section title="Why a separate number">
        <ul className="list-disc pl-6 space-y-2">
          <li>Your agent never sees your own texts, bank codes or contacts.</li>
          <li>Each agent or workflow can have its own number, so you can tell which one a text was meant for.</li>
          <li>Texts arrive as structured data with the code in an <code>otp</code> field, so there are no screenshots and no copy-paste.</li>
          <li>You can stop a number by letting it lapse, without changing your own.</li>
        </ul>
      </Section>

      <Section title="Set it up in five minutes">
        <ol className="list-decimal pl-6 space-y-4">
          <li>
            <Link href="/register?next=/settings" className="text-blue-400 hover:text-blue-300">Create a free account</Link>{" "}
            and make an API key under Settings &gt; API Keys.
          </li>
          <li>
            Connect the MCP server (Streamable HTTP):
            <Code>{`claude mcp add --transport http smshub ${site}${MCP_URL} --header "X-API-Key: smshub_..."`}</Code>
            Or run it over stdio from any MCP client: <code>npx -y {NPM_PACKAGE} mcp</code> with{" "}
            <code>SMSHUB_API_KEY</code> set.
          </li>
          <li>
            Ask your agent to rent a number. <code>rent_number</code> returns a <code>pay_url</code>; you open it and pay
            ${price} for a month. The agent polls <code>order_status</code> until the number is active.
          </li>
          <li>
            Text the number from your own phone to test it. The agent reads it with <code>get_messages</code>, or calls{" "}
            <code>wait_for_code</code> to block until the next one-time code arrives.
          </li>
        </ol>
      </Section>

      <Section title="The same thing from a script">
        <Code>{`npx ${NPM_PACKAGE} login --key smshub_...
npx ${NPM_PACKAGE} rent --area 415          # prints an order and its pay link
npx ${NPM_PACKAGE} order <order-id>         # active once the payment confirms
npx ${NPM_PACKAGE} otp <number> --wait 60   # prints the next code, nothing else
npx ${NPM_PACKAGE} messages <number>        # every text, newest first`}</Code>
        <p>
          Prefer push to polling? Add a webhook and every incoming text is sent to your endpoint as a signed{" "}
          <code>message.received</code> event: <code>npx {NPM_PACKAGE} webhook add https://your.app/hook</code>. The
          full REST reference is in the <Link href="/docs/api" className="text-blue-400 hover:text-blue-300">API docs</Link>.
        </p>
      </Section>

      <Section title="Before you pay">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-white">Receive-only.</strong> Rented numbers receive texts. They do not send texts or
            take calls. To send texts, connect a Twilio or Telnyx number you already own (free on SMSHub; that
            provider&apos;s fees and carrier rules apply).
          </li>
          <li>
            <strong className="text-white">Virtual (VoIP) numbers.</strong> Some services refuse VoIP numbers for sign-up
            codes. We cannot promise that any particular site will accept the number or send to it.{" "}
            <SisterSimLink lead="For those sites:" />
          </li>
          <li>
            Payment is crypto or PayPal through CoinPay. For crypto, send the exact amount within{" "}
            {CHECKOUT_WINDOW_MINUTES} minutes. The number is set up once the payment confirms.
          </li>
          <li>Numbers are US only for now, ${price} per number per month. Renew any time before it expires.</li>
          <li>
            If you do not renew, the number is released after a short grace period and may later go to someone else.
          </li>
          <li>
            Use it for accounts and services you are allowed to use. Fraud, creating accounts in bulk, collecting
            other people&apos;s codes and evading another service&apos;s bans or limits are against our{" "}
            <Link href="/terms" className="text-blue-400 hover:text-blue-300">terms</Link>.
          </li>
        </ul>
      </Section>

      <div className="text-center space-y-3">
        <Link
          href="/numbers"
          className="inline-block px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold text-lg transition-colors"
        >
          Get your agent a number · ${price}/mo
        </Link>
        <p className="text-sm text-gray-500">
          Building something that needs several numbers? Rent one per agent; each is ${price}/month.
        </p>
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

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-4 text-sm text-gray-200">
      <code>{children}</code>
    </pre>
  );
}
