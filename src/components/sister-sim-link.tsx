/**
 * Our sister product phonenumbers.bot: real SIM numbers for agents, for the
 * sites that refuse virtual numbers. It is waitlist-only for now, so the copy
 * says "coming soon" and never competes with the $5 rent CTA.
 */
export const PHONENUMBERS_BOT_URL =
  "https://phonenumbers.bot/?utm_source=smshub&utm_medium=crosspromo&utm_campaign=phonenumbers-bot";

export function SisterSimLink({ lead = "Need a real SIM number for a site that refuses virtual ones?" }: { lead?: string }) {
  return (
    <>
      {lead}{" "}
      <a href={PHONENUMBERS_BOT_URL} target="_blank" rel="noopener" className="underline hover:text-gray-300">
        phonenumbers.bot
      </a>{" "}
      (real SIM numbers for agents, from our team) is coming soon: join the waitlist.
    </>
  );
}
