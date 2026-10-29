import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SMSHub Blog — Practical SMS guides",
  description: "Clear guides to SMS delivery, verification codes, and managing a number in one inbox.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-10">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-400">SMSHub guides</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">The SMSHub blog</h1>
        <p className="text-lg text-gray-400">
          Straightforward help for receiving texts, verification codes, and keeping your SMS in one inbox.
        </p>
      </header>

      <article className="rounded-2xl border border-gray-800 bg-gray-900 p-6 sm:p-8 space-y-4">
        <p className="text-sm text-gray-500">Troubleshooting · October 29, 2026</p>
        <h2 className="text-2xl font-semibold">
          <Link href="/blog/verification-code-not-arriving" className="hover:text-blue-300">
            SMS verification code not arriving? 7 things to check
          </Link>
        </h2>
        <p className="text-gray-400">
          Check the number format, delivery method, and provider rules before requesting another code. Then choose a
          number you can keep access to for as long as the account needs it.
        </p>
        <Link
          href="/blog/verification-code-not-arriving"
          className="inline-flex items-center font-medium text-blue-400 hover:text-blue-300"
        >
          Read the guide <span aria-hidden="true" className="ml-2">→</span>
        </Link>
      </article>
    </div>
  );
}
