import type { Metadata } from "next";
import Link from "next/link";
import { priceUsdPerMonth } from "@/lib/plans";
import { NPM_PACKAGE } from "@/lib/developer-api";
import { getBrandSiteUrl } from "@/lib/brand-server";

export const dynamic = "force-dynamic";

const EXAMPLE_URL = "https://github.com/profullstack/smshub/tree/master/examples/agent-inbox";
const CTA = "/agents?utm_source=smshub_blog&utm_medium=content&utm_campaign=sms_webhook_workflow";

// Tested against deliveries signed by @profullstack/webhooks (the library smshub sends with), on Node and Bun.
const HANDLER = `import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const key = Buffer.from(process.env.SMSHUB_WEBHOOK_SECRET.slice("whsec_".length), "base64");
const seen = new Set(); // webhook-id is the same on every retry

createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const raw = Buffer.concat(chunks); // verify the raw bytes, not re-serialised JSON
    const id = req.headers["webhook-id"], ts = req.headers["webhook-timestamp"];
    const mac = createHmac("sha256", key).update(\`\${id}.\${ts}.\`).update(raw).digest();
    const ok = String(req.headers["webhook-signature"] ?? "").split(" ").some((s) => {
      const b = Buffer.from(s.slice(3), "base64");
      return s.startsWith("v1,") && b.length === mac.length && timingSafeEqual(b, mac);
    });
    if (!ok || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.writeHead(401).end();
    res.writeHead(204).end(); // answer within 10 s; do the work after
    if (seen.has(id)) return;
    seen.add(id);
    const event = JSON.parse(raw);
    if (event.type === "message.received") await onText(event.data);
  });
}).listen(process.env.PORT || 8787);

async function onText({ number, from, body, otp }) {
  console.log(\`text to \${number} from \${from}: \${otp ? \`code \${otp}\` : body}\`);
}`;

export function generateMetadata(): Metadata {
  return {
    title: "Inbound SMS into a workflow with a signed webhook | SMSHub",
    description:
      "Send every text that reaches an SMSHub number to your own server as a signed message.received event: add the webhook, verify the Standard Webhooks signature in Node, handle the event, or poll the REST API instead.",
    alternates: { canonical: "/blog/sms-webhook-agent-workflow" },
    openGraph: {
      title: "Inbound SMS into a workflow with a signed webhook",
      description: "Add a webhook, verify the signature, and route message.received events into your agent or job queue.",
      type: "article",
      publishedTime: "2026-11-18T00:00:00.000Z",
    },
  };
}

export default async function SmsWebhookWorkflowPage() {
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
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Inbound SMS into a workflow with a signed webhook
          </h1>
          <p className="text-lg text-gray-400">
            Instead of having an agent wait on a number, let SMSHub push each incoming text to your server the moment it
            arrives. You check the signature, then hand the text, and any one-time code in it, to whatever runs next: an
            agent, a job queue or a script.
          </p>
          <time dateTime="2026-11-18" className="block text-sm text-gray-500">November 18, 2026</time>
        </div>
      </header>

      <div className="space-y-9 text-gray-300 leading-7">
        <aside className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6 sm:p-8 space-y-3">
          <h2 className="text-2xl font-semibold text-white">Before you start</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong className="text-white">Rented numbers are receive-only.</strong> They cannot send texts or make or
              take calls. Replying needs your own Twilio or Telnyx number connected to SMSHub.
            </li>
            <li>
              <strong className="text-white">US numbers only</strong>, ${price} per number per month, paid in crypto on a
              CoinPay checkout page.
            </li>
            <li>
              <strong className="text-white">Some services reject VoIP numbers</strong>, and we cannot promise that a
              particular site will send a code to one.
            </li>
            <li>
              <strong className="text-white">Your own accounts only.</strong> No bulk account creation and no collecting
              other people&apos;s codes; see the{" "}
              <Link href="/terms" className="text-blue-400 hover:text-blue-300">terms</Link>.
            </li>
            <li>
              You need a number on your account (the{" "}
              <Link href="/blog/ai-agent-sms-inbox" className="text-blue-400 hover:text-blue-300">first tutorial</Link>{" "}
              covers renting one), an API key from Settings &gt; API Keys, and a public <code>https://</code> URL for your
              server. SMSHub refuses plain http and private addresses and does not follow redirects.
            </li>
          </ul>
        </aside>

        <Section title="1. Add the webhook">
          <Code>{`export SMSHUB_API_KEY=smshub_...
npx -y ${NPM_PACKAGE} webhook add https://your.host/smshub --event message.received`}</Code>
          <p>
            It prints the endpoint and, once, its signing secret: <code>Signing secret (keep it on your server):
            whsec_...</code>. Store that in your server&apos;s environment as <code>SMSHUB_WEBHOOK_SECRET</code>. If you
            lose it, <code>npx -y {NPM_PACKAGE} webhook secret &lt;id&gt;</code> shows it again and{" "}
            <code>webhook rotate &lt;id&gt;</code> replaces it.
          </p>
          <p>The same thing over REST:</p>
          <Code>{`curl -X POST ${site}/api/v1/webhooks \\
  -H "X-API-Key: $SMSHUB_API_KEY" -H "Content-Type: application/json" \\
  -d '{"url":"https://your.host/smshub","events":["message.received"]}'
# 201 { "endpoint": { "id": "wh_...", ... }, "secret": "whsec_..." }`}</Code>
          <p>
            Leave out <code>events</code> to receive every event type, or use a pattern such as <code>message.*</code>.
            The free plan allows one endpoint.
          </p>
        </Section>

        <Section title="2. Verify the signature">
          <p>
            Deliveries follow{" "}
            <a href="https://www.standardwebhooks.com/" className="text-blue-400 hover:text-blue-300">Standard Webhooks</a>.
            Each POST carries three headers:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <code>webhook-id</code>: the event id. It stays the same on every retry, so use it to skip duplicates.
            </li>
            <li>
              <code>webhook-timestamp</code>: unix seconds. Reject anything more than five minutes from your clock, so a
              captured request cannot be replayed later.
            </li>
            <li>
              <code>webhook-signature</code>: <code>v1,</code> followed by the base64 HMAC-SHA256 of{" "}
              <code>{"${webhook-id}.${webhook-timestamp}.${body}"}</code>, keyed with the base64-decoded part of the
              secret after <code>whsec_</code>. During a rotation the header can hold several space-separated
              signatures; accept the request if any <code>v1</code> one matches.
            </li>
          </ul>
          <p>
            Sign over the raw body exactly as it arrived. Parsing the JSON and serialising it again changes the bytes and
            the check fails.
          </p>
        </Section>

        <Section title="3. Handle message.received">
          <p>
            A complete receiver in Node with no dependencies (it also runs under Bun). It verifies, answers{" "}
            <code>204</code> straight away, skips repeats, and passes each incoming text to <code>onText</code>:
          </p>
          <Code>{HANDLER}</Code>
          <p>
            Replace <code>onText</code> with your workflow: put the text on a queue, wake the agent that is waiting for a
            code, or file it against the account it belongs to (the <code>number</code> field says which of your numbers
            received it). Keep slow work after the response, because SMSHub waits 10 seconds for an answer.
          </p>
          <p>The body is a CloudEvents 1.0 envelope. A <code>message.received</code> event looks like this:</p>
          <Code>{`{
  "specversion": "1.0",
  "id": "<event-id>",
  "type": "message.received",
  "source": "${site}",
  "subject": "message:<message-id>",
  "time": "2026-11-18T00:00:00.000Z",
  "datacontenttype": "application/json",
  "data": {
    "message_id": "<message-id>",
    "conversation_id": "<conversation-id>",
    "phone_number_id": "<number-id>",
    "number": "+1XXXXXXXXXX",
    "from": "+1XXXXXXXXXX",
    "body": "Your verification code is 123456",
    "otp": "123456",
    "media_url": null,
    "received_at": "2026-11-18T00:00:00.000Z"
  }
}`}</Code>
          <p className="text-sm text-gray-500">Example shape; values redacted.</p>
          <p>
            <code>otp</code> is the one-time code if the text has one, otherwise <code>null</code>. A longer version of the
            receiver, with a body size limit and its signature check covered by tests, is{" "}
            <a href={`${EXAMPLE_URL}/webhook-receiver.mjs`} className="text-blue-400 hover:text-blue-300">
              webhook-receiver.mjs
            </a>{" "}
            in the examples folder.
          </p>
        </Section>

        <Section title="4. Test it and watch deliveries">
          <Code>{`npx -y ${NPM_PACKAGE} webhooks              # your endpoints and their ids
npx -y ${NPM_PACKAGE} webhook test <id>     # sends a webhook.test event now
npx -y ${NPM_PACKAGE} webhook log <id>      # recent deliveries and the status you answered
npx -y ${NPM_PACKAGE} webhook retry <delivery-id>`}</Code>
          <p>
            <code>webhook.test</code> is signed the same way, so it exercises your check; the handler above simply ignores
            it after verifying. Then text the number from your own phone to see a real <code>message.received</code>.
          </p>
          <p>
            Any answer other than 2xx is retried after 30 seconds, 2 minutes, 10 minutes, 1 hour, 6 hours, 24 hours and 48
            hours. After 20 failures in a row the endpoint is switched off; <code>webhook on &lt;id&gt;</code> turns it
            back on.
          </p>
        </Section>

        <Section title="No public server? Poll instead">
          <p>
            If you cannot expose an https endpoint, read the same texts over REST. This call waits up to 55 seconds for a
            text newer than <code>since</code> and returns it with its <code>otp</code>:
          </p>
          <Code>{`curl -H "X-API-Key: $SMSHUB_API_KEY" \\
  "${site}/api/v1/numbers/<number-id>/messages?since=2026-11-18T00:00:00Z&wait=55"
# 200 { "messages": [ { "id": "...", "from": "+1...", "body": "...", "otp": "123456", "received_at": "..." } ] }`}</Code>
          <p>
            Loop it, moving <code>since</code> to the newest <code>received_at</code> each time. Or use{" "}
            <code>npx -y {NPM_PACKAGE} otp &lt;number&gt; --wait 60</code>, which does that loop and prints only the code.
            The{" "}
            <a href={EXAMPLE_URL} className="text-blue-400 hover:text-blue-300">examples/agent-inbox</a> folder has both
            approaches as runnable scripts.
          </p>
        </Section>

        <aside className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6 sm:p-8 space-y-4">
          <h2 className="text-2xl font-semibold text-white">Get a number for your workflow</h2>
          <p>
            A dedicated, receive-only US number for ${price} a month, with signed webhooks, REST, MCP and a CLI. Check
            that the service you need accepts virtual numbers before you pay.
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
        <Link href="/blog/ai-agent-sms-inbox" className="inline-flex text-blue-400 hover:text-blue-300">
          Previous: give an AI agent its own SMS inbox <span aria-hidden="true" className="ml-2">→</span>
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
