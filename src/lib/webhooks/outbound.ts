/**
 * Outbound webhook system — fires webhooks on message events.
 * Uses HMAC-SHA256 signatures for payload verification.
 */

import { createHash, createHmac } from "crypto";

export type WebhookEvent =
  | "message.sent"
  | "message.received"
  | "message.failed"
  | "message.delivered";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface UserWebhook {
  id: string;
  user_id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
}

/**
 * Generate HMAC-SHA256 signature for a webhook payload.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Generate a random webhook secret.
 */
export function generateWebhookSecret(): string {
  return createHash("sha256")
    .update(crypto.randomUUID() + Date.now().toString())
    .digest("hex")
    .slice(0, 40);
}

/**
 * Fire webhooks for a given event asynchronously.
 * Does not throw — errors are logged.
 */
export async function fireWebhooks(
  webhooks: UserWebhook[],
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const body = JSON.stringify(payload);

  const promises = webhooks
    .filter((wh) => wh.active && wh.events.includes(event))
    .map(async (wh) => {
      try {
        const signature = signPayload(body, wh.secret);
        await fetch(wh.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": event,
          },
          body,
          signal: AbortSignal.timeout(10000), // 10s timeout
        });
      } catch (error) {
        console.error(`Webhook delivery failed for ${wh.id}:`, error);
      }
    });

  await Promise.allSettled(promises);
}
