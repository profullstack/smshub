import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — SMSHub",
  description: "SMSHub terms of service. Rules and conditions for using our platform.",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <h1 className="text-4xl font-bold">Terms of Service</h1>
      <p className="text-gray-400">Last updated: March 19, 2026</p>

      <Section title="1. Acceptance of Terms">
        <p>
          By accessing or using SMSHub (&quot;the Service&quot;), you agree to be bound by these
          Terms of Service. If you do not agree, do not use the Service.
        </p>
      </Section>

      <Section title="2. Description of Service">
        <p>
          SMSHub is a multi-platform SMS messaging platform that allows you to send and receive
          text messages through third-party SMS providers (Twilio, Telnyx, phonenumbers.bot).
          The Service is available via web, mobile (iOS/Android), desktop, and API.
        </p>
      </Section>

      <Section title="3. Account Registration">
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li>You must provide a valid email address to create an account</li>
          <li>You are responsible for maintaining the security of your account credentials</li>
          <li>You must be at least 18 years old to use the Service</li>
          <li>One person or entity may not maintain more than one account</li>
        </ul>
      </Section>

      <Section title="4. Acceptable Use">
        <p>You agree NOT to use SMSHub to:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li>Send spam, unsolicited messages, or bulk promotional content without recipient consent</li>
          <li>Harass, threaten, or abuse any person</li>
          <li>Send messages that violate any applicable law or regulation</li>
          <li>Impersonate any person or entity</li>
          <li>Transmit malware, phishing links, or fraudulent content</li>
          <li>Violate A2P 10DLC, TCPA, GDPR, or other messaging compliance regulations</li>
          <li>Attempt to circumvent rate limits or abuse the API</li>
          <li>Resell access to the Service without authorization</li>
        </ul>
      </Section>

      <Section title="5. SMS Provider Terms">
        <p>
          SMSHub connects to third-party SMS providers. You are responsible for complying with
          each provider&apos;s terms of service, acceptable use policies, and messaging regulations.
          This includes but is not limited to:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li>Twilio Acceptable Use Policy</li>
          <li>Telnyx Acceptable Use Policy</li>
          <li>A2P 10DLC registration requirements (US)</li>
          <li>Carrier filtering and compliance rules</li>
        </ul>
      </Section>

      <Section title="6. API Usage">
        <p>
          API access is subject to rate limits based on your plan. Exceeding rate limits may
          result in temporary throttling (HTTP 429). Abuse of the API may result in key
          revocation or account suspension.
        </p>
      </Section>

      <Section title="7. Pricing & Payment">
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li>Free tier: 1 phone number, 100 messages/month</li>
          <li>Paid tiers: Billed monthly, cancel anytime</li>
          <li>SMS costs from providers (Twilio, Telnyx) are billed separately by those providers</li>
          <li>We reserve the right to change pricing with 30 days notice</li>
        </ul>
      </Section>

      <Section title="8. Data & Privacy">
        <p>
          Your use of SMSHub is also governed by our{" "}
          <a href="/privacy" className="text-blue-400 hover:text-blue-300">
            Privacy Policy
          </a>
          . We take data security seriously and store all data with encryption at rest and in transit.
        </p>
      </Section>

      <Section title="9. Service Availability">
        <p>
          We strive for high availability but do not guarantee 100% uptime. The Service may be
          temporarily unavailable for maintenance or due to factors beyond our control (provider
          outages, carrier issues). We are not liable for message delivery failures caused by
          third-party providers.
        </p>
      </Section>

      <Section title="10. Intellectual Property">
        <p>
          SMSHub and its original content, features, and functionality are owned by SMSHub and
          are protected by copyright and other intellectual property laws. Your content (messages,
          contacts) remains yours.
        </p>
      </Section>

      <Section title="11. Termination">
        <p>
          We may suspend or terminate your account if you violate these terms. You may delete
          your account at any time. Upon termination, your data will be deleted in accordance
          with our Privacy Policy.
        </p>
      </Section>

      <Section title="12. Limitation of Liability">
        <p>
          SMSHub is provided &quot;as is&quot; without warranties of any kind. We are not liable for
          any indirect, incidental, or consequential damages arising from your use of the Service.
          Our total liability is limited to the amount you paid for the Service in the 12 months
          preceding the claim.
        </p>
      </Section>

      <Section title="13. Changes to Terms">
        <p>
          We reserve the right to modify these terms at any time. Continued use of the Service
          after changes constitutes acceptance. We will notify you of material changes via email
          or in-app notification.
        </p>
      </Section>

      <Section title="14. Contact">
        <p>
          Questions about these terms? Contact us at{" "}
          <a href="mailto:legal@smshub.dev" className="text-blue-400 hover:text-blue-300">
            legal@smshub.dev
          </a>
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="text-gray-400 space-y-2">{children}</div>
    </section>
  );
}
