import type { Metadata } from "next";
import Link from "next/link";
import { priceUsdPerMonth } from "@/lib/plans";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "SMS verification code not arriving? 7 things to check | SMSHub",
    description:
      "Troubleshoot a missing SMS verification code: check the number format, wait for delivery, confirm number support, and protect account recovery access.",
    alternates: { canonical: "/blog/verification-code-not-arriving" },
    openGraph: {
      title: "SMS verification code not arriving? 7 things to check",
      description: "A practical checklist for delayed or missing SMS verification codes.",
      type: "article",
      publishedTime: "2026-10-29T00:00:00.000Z",
    },
  };
}

export default function VerificationCodeNotArrivingPage() {
  const price = priceUsdPerMonth();

  return (
    <article className="max-w-3xl mx-auto px-4 py-16 space-y-10">
      <header className="space-y-5">
        <Link href="/blog" className="text-sm text-blue-400 hover:text-blue-300">
          ← SMSHub guides
        </Link>
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-400">Troubleshooting</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            SMS verification code not arriving? 7 things to check
          </h1>
          <p className="text-lg text-gray-400">
            If a code does not show up, the cause may be the number format, the service sending it, or how that service
            handles virtual numbers. Work through these checks before you try again.
          </p>
          <time dateTime="2026-10-29" className="block text-sm text-gray-500">October 29, 2026</time>
        </div>
      </header>

      <div className="space-y-9 text-gray-300 leading-7">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Start with these checks</h2>
          <ol className="list-decimal pl-6 space-y-4">
            <li>
              <strong className="text-white">Check the country code and digits.</strong> Make sure the country is
              correct and the number is entered in the format the site asks for. Remove an extra leading zero if the
              form already adds the country code.
            </li>
            <li>
              <strong className="text-white">Wait for the service&apos;s timer.</strong> SMS delivery can be delayed.
              Request one new code only after the site says you can; several requests can invalidate an earlier code.
            </li>
            <li>
              <strong className="text-white">Confirm the service supports your number type.</strong> Some websites
              reject virtual or VoIP numbers, or do not send codes to them. No inbox can make a service accept a number
              it blocks.
            </li>
            <li>
              <strong className="text-white">Look for a filtered message.</strong> Check blocked senders, spam
              filtering, and other inbox views. For a provider-managed number, check the provider&apos;s message log as
              well as your phone.
            </li>
            <li>
              <strong className="text-white">Check that the account is allowed to use SMS.</strong> Some services
              require another sign-in method, limit repeated verification attempts, or only show the SMS option after
              you confirm other account details.
            </li>
            <li>
              <strong className="text-white">Avoid public, shared inboxes.</strong> A code in an open inbox can be
              read by someone else. Use a number assigned to you, and never share a verification code with another
              person.
            </li>
            <li>
              <strong className="text-white">Plan for account recovery.</strong> Keep access to the number while the
              account depends on it. Before a rental ends, move recovery settings to a number you will continue to
              control.
            </li>
          </ol>
        </section>

        <aside className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6 sm:p-8 space-y-4">
          <h2 className="text-2xl font-semibold text-white">Need a number for an account you own?</h2>
          <p>
            SMSHub rents a private US number for ${price} per month. Incoming texts appear in your SMSHub inbox; the
            number is assigned to your account while it is active. Some services do not accept virtual numbers, so
            check their rules before you pay.
          </p>
          <Link
            href="/numbers?utm_source=smshub_blog&utm_medium=content&utm_campaign=verification_code_guide"
            className="inline-flex rounded-lg bg-green-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-green-700"
          >
            See available numbers
          </Link>
        </aside>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Common questions</h2>
          <div className="space-y-5">
            <div className="space-y-1">
              <h3 className="font-semibold text-white">Will a rented number work with every service?</h3>
              <p>
                No. The service sending the code decides which numbers it accepts, and some block virtual numbers.
                SMSHub cannot guarantee that a particular website or app will send a code to a rented number.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-white">Are SMSHub rented numbers shared?</h3>
              <p>
                A managed number is assigned to one SMSHub account while it is active. It receives texts, but it does
                not send texts or take calls.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-white">What happens when a rental ends?</h3>
              <p>
                After the grace period, the number is released and may later be assigned to someone else. Move any
                important sign-in or recovery method before the rental ends.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-white">Can I use a number for an account I do not own?</h3>
              <p>
                No. Use SMSHub only for your own accounts, and follow the site&apos;s rules and SMSHub&apos;s{" "}
                <Link href="/terms" className="text-blue-400 hover:text-blue-300">terms</Link>.
              </p>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-gray-800 pt-6 text-sm text-gray-500">
        <p>Keep a recovery method you control for important accounts.</p>
        <Link
          href="/verification-numbers"
          className="mt-3 inline-flex text-blue-400 hover:text-blue-300"
        >
          Learn how SMSHub verification numbers work <span aria-hidden="true" className="ml-2">→</span>
        </Link>
      </footer>
    </article>
  );
}
