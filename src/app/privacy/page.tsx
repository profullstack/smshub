import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — SMSHub",
  description: "SMSHub privacy policy. How we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <h1 className="text-4xl font-bold">Privacy Policy</h1>
      <p className="text-gray-400">Last updated: March 19, 2026</p>

      <Section title="1. Information We Collect">
        <p>When you use SMSHub, we collect the following information:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li><strong>Account data:</strong> Email address and password when you register</li>
          <li><strong>SMS data:</strong> Messages sent and received through your connected providers (Twilio, Telnyx, phonenumbers.bot)</li>
          <li><strong>Contact data:</strong> Phone numbers and names you add or that are auto-created from inbound messages</li>
          <li><strong>Provider credentials:</strong> API keys you provide to connect SMS providers (stored encrypted)</li>
          <li><strong>Usage data:</strong> Analytics on how you use the platform (message counts, feature usage)</li>
          <li><strong>Device data:</strong> Browser type, OS, and device info for mobile/desktop apps</li>
        </ul>
      </Section>

      <Section title="2. How We Use Your Information">
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li>Send and receive SMS messages on your behalf through connected providers</li>
          <li>Display your conversations, contacts, and message history</li>
          <li>Provide AI-powered reply suggestions (when enabled, using OpenAI)</li>
          <li>Send push notifications for new messages</li>
          <li>Improve the platform and fix bugs</li>
          <li>Communicate with you about your account and service updates</li>
        </ul>
      </Section>

      <Section title="3. Data Storage & Security">
        <p>
          Your data is stored in Supabase (hosted on AWS) with row-level security policies.
          All data is encrypted in transit (TLS) and at rest. Provider API keys are stored
          encrypted and never exposed to client-side code.
        </p>
        <p>
          We do not sell, rent, or share your personal data or message content with third parties,
          except as necessary to provide the service (e.g., sending messages through Twilio/Telnyx).
        </p>
      </Section>

      <Section title="4. Third-Party Services">
        <p>SMSHub integrates with the following third-party services:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li><strong>Twilio / Telnyx / phonenumbers.bot:</strong> SMS sending and receiving</li>
          <li><strong>OpenAI:</strong> AI reply suggestions (opt-in, per conversation)</li>
          <li><strong>Supabase:</strong> Database, authentication, and real-time messaging</li>
          <li><strong>Sentry:</strong> Error tracking and performance monitoring</li>
          <li><strong>Expo:</strong> Mobile app push notifications</li>
        </ul>
        <p>Each service has its own privacy policy. We encourage you to review them.</p>
      </Section>

      <Section title="5. Data Retention">
        <p>
          We retain your data for as long as your account is active. You can delete your account
          and all associated data at any time from settings. Archived conversations can be
          permanently deleted. We may retain anonymized analytics data after account deletion.
        </p>
      </Section>

      <Section title="6. Your Rights">
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li>Access your personal data (export contacts as CSV)</li>
          <li>Correct inaccurate data (edit contacts and settings)</li>
          <li>Delete your data (archive/delete conversations, delete account)</li>
          <li>Withdraw consent for AI features at any time</li>
          <li>Request a copy of all your data</li>
        </ul>
      </Section>

      <Section title="7. Cookies">
        <p>
          We use essential cookies for authentication and session management.
          We do not use tracking cookies or third-party advertising cookies.
        </p>
      </Section>

      <Section title="8. Changes to This Policy">
        <p>
          We may update this privacy policy from time to time. We will notify you of
          significant changes via email or in-app notification.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>
          Questions about this policy? Contact us at{" "}
          <a href="mailto:privacy@smshub.dev" className="text-blue-400 hover:text-blue-300">
            privacy@smshub.dev
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
