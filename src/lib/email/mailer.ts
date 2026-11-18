import { createEmailer, type SendOptions, type SendResult } from "@profullstack/stack/email";

/**
 * Transactional email for smshub, over Resend through the house emailer
 * (@profullstack/stack/email). Configured by RESEND_API_KEY (and optionally
 * EMAIL_FROM); with no key, getMailer() returns null and callers skip sending.
 *
 * Env is read by computed name so Next does not inline it at build time.
 */

export type Mail = SendOptions;
export type MailSender = (mail: Mail) => Promise<SendResult>;

export const DEFAULT_FROM = "smshub.dev <noreply@smshub.dev>";

const KEY = Symbol.for("smshub.email.mailer");
type MailerGlobal = typeof globalThis & { [KEY]?: MailSender | null };

/** Test seam: replace the sender (null restores the env-configured one). */
export function setMailer(sender: MailSender | null): void {
  (globalThis as MailerGlobal)[KEY] = sender;
}

export function getMailer(env: NodeJS.ProcessEnv = process.env): MailSender | null {
  const override = (globalThis as MailerGlobal)[KEY];
  if (override) return override;
  const apiKey = env[String("RESEND_API_KEY")];
  if (!apiKey) return null;
  const emailer = createEmailer({ resendApiKey: apiKey, defaultFrom: env[String("EMAIL_FROM")] || DEFAULT_FROM });
  return (mail) => emailer.send(mail);
}
