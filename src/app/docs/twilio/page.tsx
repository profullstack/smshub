import type { Metadata } from "next";
import Link from "next/link";
import { CopyField } from "@/components/copy-field";
import { getSiteUrl } from "@/lib/site-url";
import { Note, Step, Steps } from "../steps";

export const metadata: Metadata = {
  title: "Set up Twilio for SMS — SMSHub",
  description: "Step-by-step: connect your Twilio account to SMSHub to send and receive text messages.",
};

export default function TwilioSetupPage() {
  const webhookUrl = `${getSiteUrl()}/api/webhooks/twilio`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-10">
      <div className="space-y-3">
        <Link href="/docs" className="text-sm text-blue-400 hover:text-blue-300">
          ← Setup guides
        </Link>
        <h1 className="text-4xl font-bold">Set up Twilio</h1>
        <p className="text-gray-400">About 10 minutes. You need a Twilio account, one phone number, your Account SID and Auth Token.</p>
      </div>

      <Steps>
        <Step n={1} title="Create a Twilio account">
          <p>
            Sign up at{" "}
            <a href="https://www.twilio.com/try-twilio" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noreferrer">
              twilio.com/try-twilio
            </a>{" "}
            and upgrade from the trial. Trial accounts can only text numbers you have verified (error 21608).
          </p>
        </Step>

        <Step n={2} title="Buy a phone number">
          <p>
            In the Twilio console go to <strong>Phone Numbers → Manage → Buy a number</strong> and pick one with{" "}
            <strong>SMS</strong>.
          </p>
        </Step>

        <Step n={3} title="Send incoming texts to SMSHub">
          <p>
            Open <strong>Phone Numbers → Manage → Active numbers</strong>, click your number, and under{" "}
            <strong>Messaging Configuration</strong> set <strong>A message comes in</strong> to <em>Webhook</em>,{" "}
            <em>HTTP POST</em>, with this URL:
          </p>
          <CopyField value={webhookUrl} />
          <p className="text-sm text-gray-400">Or skip it and click Fix webhook in SMSHub after step 5.</p>
        </Step>

        <Step n={4} title="Copy your Account SID and Auth Token">
          <p>
            Both are on the console home page under <strong>Account Info</strong>.
          </p>
        </Step>

        <Step n={5} title="Add it to SMSHub">
          <p>
            In SMSHub open{" "}
            <Link href="/settings" className="text-blue-400 hover:text-blue-300">
              Settings
            </Link>{" "}
            → <strong>Bring Your Own Provider</strong>, choose <strong>Twilio</strong>, paste the Account SID and Auth
            Token, and click <strong>Add Provider</strong>. Then add your number under <strong>Phone Numbers</strong>.
          </p>
        </Step>

        <Step n={6} title="Click Test">
          <p>
            The <strong>Test</strong> button checks your credentials and that each number sends incoming texts to
            SMSHub. Enter your own mobile number to also send a real test text.
          </p>
        </Step>
      </Steps>

      <Note title="Texts to US phones need registration first">
        <p>
          US carriers block business texts from unregistered numbers (Twilio error <strong>30034</strong> for local
          numbers, <strong>30032</strong> for unverified toll-free). Register under{" "}
          <strong>Messaging → Regulatory Compliance</strong> in the Twilio console: A2P 10DLC for local numbers, or
          toll-free verification. It has fees and takes days; SMSHub cannot do it for you.
        </p>
      </Note>
    </div>
  );
}
