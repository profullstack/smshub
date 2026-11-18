import type { Metadata } from "next";
import Link from "next/link";
import { priceUsdPerMonth } from "@/lib/plans";
import { CHECKOUT_WINDOW_MINUTES } from "@/lib/coinpay/window";
import { MCP_URL, NPM_PACKAGE } from "@/lib/developer-api";
import { getBrandSiteUrl } from "@/lib/brand-server";

export const dynamic = "force-dynamic";

const EXAMPLE_URL = "https://github.com/profullstack/smshub/tree/master/examples/agent-inbox";
const CTA = "/agents?utm_source=smshub_blog&utm_medium=content&utm_campaign=ai_agent_sms_inbox";

export function generateMetadata(): Metadata {
  return {
    title: "How to give an AI agent its own SMS inbox | SMSHub",
    description:
      "Connect an AI agent to a dedicated US phone number over MCP: rent the number, pay the checkout link, and let the agent read one-time codes with wait_for_code. Receive-only; limits up front.",
    alternates: { canonical: "/blog/ai-agent-sms-inbox" },
    openGraph: {
      title: "How to give an AI agent its own SMS inbox",
      description: "A dedicated number for your agent over MCP, REST or the CLI, with one-time codes as structured data.",
      type: "article",
      publishedTime: "2026-11-18T00:00:00.000Z",
    },
  };
}

export default async function AiAgentSmsInboxPage() {
  const price = priceUsdPerMonth();
  const site = await getBrandSiteUrl();

  return (
    <article className="max-w-3xl mx-auto px-4 py-16 space-y-10">
      <header className="space-y-5">
        <Link href="/blog" className="text-sm text-blue-400 hover:text-blue-300">
          ← SMSHub guides
        </Link>
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-400">Tutorial</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">How to give an AI agent its own SMS inbox</h1>
          <p className="text-lg text-gray-400">
            When an agent signs in to something on your behalf, the one-time code usually lands on your phone and you
            end up copying it across. This guide gives the agent a phone number of its own and lets it read the code
            itself, over MCP, the REST API or the CLI.
          </p>
          <time dateTime="2026-11-18" className="block text-sm text-gray-500">November 18, 2026</time>
        </div>
      </header>

      <div className="space-y-9 text-gray-300 leading-7">
        <aside className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6 sm:p-8 space-y-3">
          <h2 className="text-2xl font-semibold text-white">What this can and cannot do</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong className="text-white">Receive-only.</strong> A rented number receives texts. It cannot send texts
              or make or take calls. Sending needs your own Twilio or Telnyx number connected to SMSHub.
            </li>
            <li>
              <strong className="text-white">US numbers only</strong>, ${price} per number per month.
            </li>
            <li>
              <strong className="text-white">Some services reject VoIP numbers.</strong> The service sending the code
              decides which numbers it accepts. We cannot promise that any particular site will accept the number or
              send a code to it.
            </li>
            <li>
              <strong className="text-white">Crypto payment.</strong> You pay on a CoinPay checkout page (USDC, USDT,
              BTC, ETH and others) within {CHECKOUT_WINDOW_MINUTES} minutes; the number is set up once the payment
              confirms.
            </li>
            <li>
              <strong className="text-white">Your own accounts only.</strong> Bulk account creation, collecting other
              people&apos;s codes and getting around another service&apos;s limits are against our{" "}
              <Link href="/terms" className="text-blue-400 hover:text-blue-300">terms</Link>.
            </li>
          </ul>
        </aside>

        <Section title="Why a separate number">
          <ul className="list-disc pl-6 space-y-2">
            <li>The agent never sees your own texts, bank codes or contacts.</li>
            <li>One number per agent or workflow tells you which one a text was meant for.</li>
            <li>
              Each text arrives as data with the code already pulled out into an <code>otp</code> field, so the agent
              does not parse message wording.
            </li>
            <li>You can retire the number by letting it lapse, without touching your own.</li>
          </ul>
        </Section>

        <Section title="1. Create an API key">
          <p>
            <Link href="/register?next=/settings" className="text-blue-400 hover:text-blue-300">Create an account</Link>,
            then make a key under Settings &gt; API Keys. It starts with <code>smshub_</code>. The same key works for MCP,
            REST and the CLI; keep it out of your repository.
          </p>
        </Section>

        <Section title="2. Connect the MCP server">
          <p>Claude Code, over Streamable HTTP:</p>
          <Code>{`claude mcp add --transport http smshub ${site}${MCP_URL} --header "X-API-Key: smshub_..."`}</Code>
          <p>
            Cursor, Claude Desktop or any client that takes an <code>mcpServers</code> block can run the stdio bridge
            from npm instead:
          </p>
          <Code>{`{
  "mcpServers": {
    "smshub": {
      "command": "npx",
      "args": ["-y", "${NPM_PACKAGE}", "mcp"],
      "env": { "SMSHUB_API_KEY": "smshub_..." }
    }
  }
}`}</Code>
          <p>
            The tools this guide uses are <code>rent_number</code>, <code>order_status</code>, <code>list_numbers</code>,{" "}
            <code>get_messages</code> and <code>wait_for_code</code>.
          </p>
        </Section>

        <Section title="3. Rent a number with rent_number">
          <p>
            Ask the agent to rent a number (optionally in an area code). <code>rent_number</code> creates an order and
            returns it with a <code>pay_url</code>, a CoinPay checkout link. The agent cannot pay for you: it hands you
            the link.
          </p>
          <Code>{`{
  "id": "<order-id>",
  "kind": "new",
  "area_code": "415",
  "months": 1,
  "amount_usd": ${price},
  "chain": "USDC_POL",
  "status": "pending",
  "pay_url": "https://<coinpay-checkout-link>"
}`}</Code>
          <p className="text-sm text-gray-500">Example shape, trimmed; values redacted.</p>
        </Section>

        <Section title="4. Pay, then wait for order_status to say active">
          <p>
            Open the link and pay within {CHECKOUT_WINDOW_MINUTES} minutes. The agent polls <code>order_status</code>{" "}
            with the order id; the status goes <code>pending</code> (unpaid), <code>paid</code> (setting up),{" "}
            <code>active</code> (done, with the number on the order). <code>failed</code> and <code>expired</code> are
            the other outcomes. Once it is active, <code>list_numbers</code> shows the number and its id.
          </p>
        </Section>

        <Section title="5. Read the code with wait_for_code">
          <p>
            Have the agent start the sign-in that sends the code, then call <code>wait_for_code</code> with the
            number&apos;s id. It waits up to 55 seconds for a new text that contains a code and returns it; if nothing
            arrives it returns <code>timed_out</code>, and the agent calls it again to keep waiting. Only texts that
            arrive after the call starts count, so an old code is never returned.
          </p>
          <Code>{`{
  "code": "123456",
  "message": {
    "id": "<message-id>",
    "from": "+1XXXXXXXXXX",
    "body": "Your verification code is 123456",
    "otp": "123456",
    "received_at": "2026-11-18T00:00:00.000Z"
  }
}`}</Code>
          <p className="text-sm text-gray-500">Example shape; values redacted.</p>
          <p>
            To test without signing up for anything, text the number from your own phone with a message such as{" "}
            <code>Your code is 123456</code>. <code>get_messages</code> lists every text on the number, newest first,
            each with its <code>otp</code> (or <code>null</code>).
          </p>
        </Section>

        <Section title="The same steps without MCP">
          <p>From a shell, with the CLI from npm:</p>
          <Code>{`export SMSHUB_API_KEY=smshub_...
npx -y ${NPM_PACKAGE} rent --area 415          # prints the order and its pay link, then waits
npx -y ${NPM_PACKAGE} order <order-id>         # check on it later
npx -y ${NPM_PACKAGE} numbers                  # your numbers and their ids
npx -y ${NPM_PACKAGE} otp <number> --wait 60   # prints the next code, nothing else
npx -y ${NPM_PACKAGE} messages <number>        # every text, newest first`}</Code>
          <p>
            <code>&lt;number&gt;</code> is the number id or the number itself in +1 format. Over plain REST, the call
            behind <code>otp</code> is <code>GET /api/v1/numbers/&#123;id&#125;/messages?since=&lt;iso&gt;&amp;wait=55</code>{" "}
            with an <code>X-API-Key</code> header; the server holds the request open until a text arrives. The{" "}
            <a href={EXAMPLE_URL} className="text-blue-400 hover:text-blue-300">examples/agent-inbox</a> folder has a
            dependency-free Node script that does exactly this, and the{" "}
            <Link href="/docs/api" className="text-blue-400 hover:text-blue-300">API docs</Link> list every endpoint.
          </p>
        </Section>

        <Section title="Keeping the number">
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Renew before it expires with <code>renew_number</code> (MCP) or{" "}
              <code>npx -y {NPM_PACKAGE} renew &lt;number&gt;</code>; both return a new pay link.
            </li>
            <li>
              If you do not renew, the number is released after a short grace period and may later go to someone else.
              Move any account that depends on it to a number you keep before then.
            </li>
            <li>Prefer push over waiting? A webhook sends every incoming text to your server as it arrives.</li>
          </ul>
        </Section>

        <aside className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6 sm:p-8 space-y-4">
          <h2 className="text-2xl font-semibold text-white">Give your agent a number</h2>
          <p>
            A dedicated, receive-only US number for ${price} a month, readable over MCP, REST and the CLI. Check that the
            service you need accepts virtual numbers before you pay.
          </p>
          <Link
            href={CTA}
            className="inline-flex rounded-lg bg-green-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-green-700"
          >
            SMS inboxes for AI agents
          </Link>
        </aside>
      </div>

      <footer className="border-t border-gray-800 pt-6 text-sm text-gray-500">
        <Link href="/blog/sms-webhook-agent-workflow" className="inline-flex text-blue-400 hover:text-blue-300">
          Next: send inbound texts into a workflow with a webhook <span aria-hidden="true" className="ml-2">→</span>
        </Link>
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-4 text-sm text-gray-200">
      <code>{children}</code>
    </pre>
  );
}
