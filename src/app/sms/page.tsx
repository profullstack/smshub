import type { Metadata } from "next";

// Public opt-in disclosure for Profullstack's own 10DLC campaign (TCR CGQC7B6).
// Carriers check this page as the "verifiable call to action" for the
// campaign's message flow, so keep the number, keywords and wording in step
// with the campaign record at Telnyx.
const LINE = "+1 (916) 659-9471";
const LINE_E164 = "+19166599471";

export const metadata: Metadata = {
  title: "Text Profullstack — SMS opt-in and terms",
  description: `How to opt in to text messages from Profullstack, Inc. at ${LINE}, what we send, and how to stop.`,
};

export default function SmsOptInPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <h1 className="text-4xl font-bold">Text Profullstack</h1>
      <p className="text-gray-400">
        Sender: <strong>Profullstack, Inc.</strong>, the company that runs smshub.dev. Messages from this
        number are sent by Profullstack staff only, never by smshub customers.
      </p>

      <Section title="How to opt in">
        <p>
          Text <strong>START</strong> (or any message) to{" "}
          <a href={`sms:${LINE_E164}`} className="text-blue-400 hover:text-blue-300">
            {LINE}
          </a>
          .
        </p>
        <p className="border border-gray-700 rounded-lg p-4">
          By texting {LINE}, you agree to receive conversational text messages from Profullstack, Inc.
          in reply: answers to your questions, support updates about your account, and one-time
          verification codes. Message frequency varies, typically fewer than 10 messages a month.
          Msg &amp; data rates may apply. Reply <strong>HELP</strong> for help, <strong>STOP</strong> to opt
          out. Consent is not a condition of any purchase.
        </p>
        <p>
          We only text people who have texted this number first. We do not buy, rent or share phone
          numbers, and we never send marketing from this number.
        </p>
      </Section>

      <Section title="What you will receive">
        <p>After your first message you get one confirmation:</p>
        <blockquote className="border-l-2 border-gray-600 pl-4 italic">
          Profullstack (smshub.dev): you are subscribed to texts from this number. Msg&amp;data rates may
          apply. Reply HELP for help, STOP to opt out.
        </blockquote>
        <p>Then only replies to your conversation, for example:</p>
        <blockquote className="border-l-2 border-gray-600 pl-4 italic">
          Profullstack support: thanks for your message, we have fixed the login issue on your account.
          Reply HELP for help, STOP to opt out.
        </blockquote>
      </Section>

      <Section title="How to stop or get help">
        <p>
          Reply <strong>STOP</strong>, UNSUBSCRIBE, CANCEL, END or QUIT at any time. You get one confirmation and
          no further messages. Reply <strong>START</strong> to resubscribe.
        </p>
        <p>
          Reply <strong>HELP</strong> or INFO for help, or email{" "}
          <a href="mailto:support@smshub.dev" className="text-blue-400 hover:text-blue-300">
            support@smshub.dev
          </a>
          .
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          Mobile numbers and opt-in consent are never shared with third parties or affiliates for
          marketing or promotional purposes. See our{" "}
          <a href="/privacy" className="text-blue-400 hover:text-blue-300">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="/terms" className="text-blue-400 hover:text-blue-300">
            Terms
          </a>
          .
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
