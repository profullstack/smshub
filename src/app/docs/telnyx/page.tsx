import type { Metadata } from "next";
import Link from "next/link";
import { CopyField } from "@/components/copy-field";
import { getSiteUrl } from "@/lib/site-url";
import { Note, Step, Steps } from "../steps";

export const metadata: Metadata = {
  title: "Set up Telnyx for SMS — SMSHub",
  description: "Step-by-step: connect your Telnyx account to SMSHub to send and receive text messages.",
};

export default function TelnyxSetupPage() {
  const webhookUrl = `${getSiteUrl()}/api/webhooks/telnyx`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-10">
      <div className="space-y-3">
        <Link href="/docs" className="text-sm text-blue-400 hover:text-blue-300">
          ← Setup guides
        </Link>
        <h1 className="text-4xl font-bold">Set up Telnyx</h1>
        <p className="text-gray-400">
          About 10 minutes. You need a Telnyx account, one phone number and an API key. SMSHub
          does the webhook part for you once it has the key.
        </p>
      </div>

      <Steps>
        <Step n={1} title="Create a Telnyx account">
          <p>
            Sign up at{" "}
            <a href="https://telnyx.com/sign-up" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noreferrer">
              telnyx.com/sign-up
            </a>
            , confirm your email, and add a payment method in the{" "}
            <a href="https://portal.telnyx.com" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noreferrer">
              Telnyx portal
            </a>
            . Telnyx will not sell you a number until the account is verified and funded.
          </p>
        </Step>

        <Step n={2} title="Buy a phone number">
          <p>
            In the portal go to <strong>Numbers → Search &amp; Buy Numbers</strong>. Pick a number with
            the <strong>SMS</strong> feature and buy it.
          </p>
        </Step>

        <Step n={3} title="Create a messaging profile">
          <p>
            Go to <strong>Messaging → Programmable Messaging</strong> and click <strong>Add new profile</strong>.
            Name it <em>SMSHub</em>. Under <strong>Inbound</strong>, set the webhook URL to:
          </p>
          <CopyField value={webhookUrl} />
          <p className="text-sm text-gray-400">
            Leave the API version on <strong>v2</strong> and save. If you skip this, SMSHub sets it for you in
            step 6 (as long as the profile has no other webhook).
          </p>
        </Step>

        <Step n={4} title="Put your number on that profile">
          <p>
            Go to <strong>Numbers → My Numbers</strong>, and in the <strong>Messaging Profile</strong> column choose
            the profile from step 3. A number with no messaging profile cannot send or receive texts.
          </p>
        </Step>

        <Step n={5} title="Copy your API key">
          <p>
            Open <strong>Account Settings → Keys &amp; Credentials → API Keys</strong> and click{" "}
            <strong>Create API Key</strong>. Copy it now (it starts with <code>KEY</code>); Telnyx only shows it once.
          </p>
          <p className="text-sm text-gray-400">
            You do not need the public key on the same page: SMSHub fetches it with your API key and uses it to
            check that webhooks really come from your Telnyx account.
          </p>
        </Step>

        <Step n={6} title="Add it to SMSHub">
          <p>
            In SMSHub open{" "}
            <Link href="/settings" className="text-blue-400 hover:text-blue-300">
              Settings
            </Link>{" "}
            → <strong>Bring Your Own Provider</strong>, choose <strong>Telnyx</strong>, paste the API key and click{" "}
            <strong>Add Provider</strong>. SMSHub checks the key and points your messaging profile at the URL above.
          </p>
          <p>
            Then add your number under <strong>Phone Numbers</strong> (format <code>+14155551234</code>).
          </p>
        </Step>

        <Step n={7} title="Click Test">
          <p>
            Each provider in Settings has a <strong>Test</strong> button. It checks the API key, that each number is
            on a messaging profile, and that the profile sends webhooks to SMSHub. Enter your own mobile number to
            also send a real test text. If the webhook check fails, click <strong>Fix webhook</strong>.
          </p>
        </Step>
      </Steps>

      <Note title="Texts to US phones need registration first">
        <p>
          US carriers block business texts from numbers that are not registered. Until you register, sends fail
          with Telnyx error <strong>40010 “Not 10DLC registered”</strong>.
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Local (10-digit) number:</strong> register a brand and a 10DLC campaign in Telnyx under{" "}
            <strong>Messaging → Compliance</strong>, then assign your number to the campaign.
          </li>
          <li>
            <strong>Toll-free number:</strong> submit toll-free verification in Telnyx instead.
          </li>
        </ul>
        <p className="text-sm text-gray-400">
          Registration has carrier fees and takes days to approve. SMSHub cannot do it for you. Receiving texts
          works before registration.
        </p>
      </Note>
    </div>
  );
}
