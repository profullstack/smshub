import type { Metadata } from "next";
import Link from "next/link";
import { getBrand } from "@/lib/brand-server";
import { CONSENT_TEXT } from "@/lib/alerts/consent";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getBrand();
  return {
    title: `Alerts by text and call — ${name}`,
    description: `How ${name} account alerts work, how you opt in, and how to stop them.`,
  };
}

/**
 * Public description of the alerts program, including the opt-in form exactly
 * as it appears in Settings > Alerts. Carriers and Telnyx's toll-free
 * verification review this page as the opt-in evidence.
 */
export default function AlertsDocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <div className="space-y-2">
        <Link href="/docs" className="text-sm text-blue-400">← Setup guides</Link>
        <h1 className="text-4xl font-bold">Alerts by text and call</h1>
        <p className="text-gray-400">
          SMSHub account holders can have their own servers, scripts and AI agents alert them about failures: a backup that
          did not run, a payment processor that stopped, a credit balance that ran out. Alerts go only to a mobile number
          the account holder entered and agreed to in their own account settings.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">How you opt in</h2>
        <p className="text-gray-400">
          Signed in to SMSHub, open <strong>Settings &gt; Alerts</strong> (smshub.dev/settings/alerts), enter your mobile
          number and tick the consent box. Nothing is sent until the box is ticked and saved; the box is never pre-ticked,
          and changing the number clears it. The wording you agreed to and the time are kept with your account.
        </p>
        <figure className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-4" aria-label="The opt-in form in Settings > Alerts">
          <div className="text-xs uppercase tracking-wide text-gray-500">Settings &gt; Alerts</div>
          <label className="block text-sm text-gray-300">
            Mobile number for alerts
            <input
              className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
              type="tel"
              placeholder="+14155550123"
              disabled
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-300">
            <input type="checkbox" className="mt-1" disabled />
            <span>{CONSENT_TEXT}</span>
          </label>
          <div className="flex justify-end">
            <span className="px-4 py-2 text-sm bg-blue-600 rounded opacity-60">Save</span>
          </div>
          <figcaption className="text-xs text-gray-500">The form as it appears to a signed-in account holder.</figcaption>
        </figure>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">What you receive</h2>
        <ul className="list-disc pl-6 text-gray-400 space-y-1">
          <li>Only alerts your own account sends: no marketing, no promotions, no shared or purchased lists.</li>
          <li>Frequency varies with your systems; the same alert is sent at most once per 10 minutes and at most 30 an hour.</li>
          <li>
            Example: <em>&ldquo;SMSHub alert: fleet-db-backup failed on dev2: pg_dump exited 1. Reply STOP to opt out.&rdquo;</em>
          </li>
          <li>When a text cannot be delivered, or the alert is critical, a phone call reads the alert to you twice.</li>
          <li>Msg&amp;data rates may apply.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">How to stop</h2>
        <p className="text-gray-400">
          Reply <strong>STOP</strong> to any alert text, or clear the number in Settings &gt; Alerts. Either ends texts
          and calls at once. Reply <strong>HELP</strong> for help, or email{" "}
          <a href="mailto:anthony@profullstack.com" className="text-blue-400">anthony@profullstack.com</a>.
        </p>
        <p className="text-gray-400">
          See the <Link href="/privacy" className="text-blue-400">privacy policy</Link> and{" "}
          <Link href="/terms" className="text-blue-400">terms</Link>. Mobile numbers are never sold or shared for marketing.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Sending an alert</h2>
        <pre className="rounded-lg bg-gray-900 border border-gray-800 p-4 text-sm overflow-x-auto">{`curl -X POST https://smshub.dev/api/v1/alerts \\
  -H "X-API-Key: $SMSHUB_API_KEY" -H "Content-Type: application/json" \\
  -d '{"message":"nightly backup failed","severity":"warning"}'

smshub-cli alert "nightly backup failed" [--severity critical]`}</pre>
        <p className="text-gray-400">MCP clients use the <code>send_alert</code> tool at https://smshub.dev/api/mcp.</p>
      </section>
    </div>
  );
}
