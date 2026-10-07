import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Setup guides — SMSHub",
  description: "Connect Telnyx or Twilio to SMSHub.",
};

const GUIDES = [
  { href: "/docs/telnyx", name: "Telnyx", desc: "API key only. SMSHub sets up the webhook for you." },
  { href: "/docs/twilio", name: "Twilio", desc: "Account SID, Auth Token and one webhook URL." },
  { href: "/phonenumbers", name: "phonenumbers.bot", desc: "Managed numbers, nothing to set up." },
];

export default function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <h1 className="text-4xl font-bold">Setup guides</h1>
      <p className="text-gray-400">Pick the SMS provider you use.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {GUIDES.map((g) => (
          <Link key={g.href} href={g.href} className="rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-blue-600">
            <div className="font-medium">{g.name}</div>
            <div className="mt-1 text-sm text-gray-400">{g.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
