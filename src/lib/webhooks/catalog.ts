/** The events smshub sends to customer webhooks. No imports: safe for client components and docs. */

export const WEBHOOK_EVENT_TYPES = [
  "message.received",
  "message.sent",
  "message.failed",
  "message.delivered",
  "number.provisioned",
  "number.renewed",
  "number.expiring",
  "number.released",
  "group.sent",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** What each event means, for the settings page, docs and llms.txt. */
export const WEBHOOK_EVENT_DOCS: Record<WebhookEventType, string> = {
  "message.received": "A text arrived on one of your numbers: number, from, body, otp (a one-time code if it has one), received_at.",
  "message.sent": "A text you sent was accepted by the carrier (API, inbox, CLI, MCP or a group send).",
  "message.failed": "A text you sent was refused when sending or reported undelivered later; error says why.",
  "message.delivered": "The carrier confirmed delivery of a text you sent.",
  "number.provisioned": "A rented number is set up and receiving.",
  "number.renewed": "A rented number was paid for longer; expires_at is the new date.",
  "number.expiring": "A rented number's paid time ends within 3 days; renew it to keep it.",
  "number.released": "A rented number lapsed and was given back.",
  "group.sent": "A group text went out: how many sent, failed and were skipped.",
};
