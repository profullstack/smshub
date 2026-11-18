/**
 * The "your number is about to lapse" email, sent once per paid-until date
 * alongside the number.expiring webhook (see notifyExpiring in service.ts).
 */

export const RENEW_URL = "https://smshub.dev/numbers";

/** +14155550100 -> +1 (415) 555-0100; anything else comes back as given. */
export function formatPhoneNumber(number: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(number.trim());
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : number;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " UTC";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function expiryReminderEmail(input: { number: string; expiresAt: string; releasedAfter: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const pretty = formatPhoneNumber(input.number);
  const expires = formatWhen(input.expiresAt);
  const released = formatWhen(input.releasedAfter);
  const command = `npx @profullstack/smshub renew ${input.number}`;
  const subject = `Your smshub number ${pretty} expires ${expires}`;
  const text = [
    `Your rented number ${pretty} is paid until ${expires}.`,
    "",
    "Renew it to keep it:",
    `  ${RENEW_URL}`,
    `  or: ${command}`,
    "",
    `If it is not renewed, the number is released after the grace period (${released}) and you may not get it back.`,
    "",
    "smshub.dev",
  ].join("\n");
  const html = [
    `<p>Your rented number <strong>${escapeHtml(pretty)}</strong> is paid until <strong>${escapeHtml(expires)}</strong>.</p>`,
    `<p>Renew it to keep it: <a href="${RENEW_URL}">${RENEW_URL}</a><br>or run <code>${escapeHtml(command)}</code></p>`,
    `<p>If it is not renewed, the number is released after the grace period (${escapeHtml(released)}) and you may not get it back.</p>`,
    `<p>smshub.dev</p>`,
  ].join("\n");
  return { subject, text, html };
}
