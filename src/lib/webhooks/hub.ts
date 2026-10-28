import { Webhooks, WebhookError, type WebhookStore, type WebhooksOptions } from "@profullstack/webhooks";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlanUsage, limitReached } from "@/lib/plans";
import { getSiteUrl } from "@/lib/site-url";
import { supabaseStore, type SupabaseLike } from "./supabase-store";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "./catalog";

/**
 * Customer webhooks for smshub, on @profullstack/webhooks.
 *
 * Endpoints and a durable outbox live in Supabase (hub_webhook_* tables, see
 * supabase/migrations/022_webhooks_hub.sql). `emitEvent` queues; the drainer
 * started once at server boot (src/instrumentation.ts) sends with retries.
 *
 * Deliveries are CloudEvents 1.0 JSON signed per Standard Webhooks
 * (webhook-id, webhook-timestamp, webhook-signature). The owner of an event is
 * the account that owns the number (or group) it happened on.
 */

export { WEBHOOK_EVENT_DOCS, WEBHOOK_EVENT_TYPES, type WebhookEventType } from "./catalog";

export const WEBHOOKS_BASE_PATH = "/api/v1/webhooks";

export function createHooks(store: WebhookStore, options: Partial<WebhooksOptions> = {}): Webhooks {
  return new Webhooks({
    store,
    source: getSiteUrl(),
    eventTypes: [...WEBHOOK_EVENT_TYPES],
    maxEndpoints: 10,
    guard: process.env.NODE_ENV === "production" ? {} : { allowHttp: true },
    log: (m) => console.warn(`[webhooks] ${m}`),
    ...options,
  });
}

const KEY = Symbol.for("smshub.webhooks.hub");
type HubGlobal = typeof globalThis & { [KEY]?: Webhooks };

/**
 * The process-wide hub. Kept on globalThis because Next bundles route handlers
 * and instrumentation separately: a module-level singleton would give each its
 * own instance, and only the one that called start() would drain.
 */
export function getHooks(): Webhooks {
  const g = globalThis as HubGlobal;
  if (!g[KEY]) g[KEY] = createHooks(supabaseStore(createServiceClient() as unknown as SupabaseLike));
  return g[KEY]!;
}

/** Tests: use this hub instead of the Supabase one (null to reset). */
export function setHooks(hooks: Webhooks | null): void {
  const g = globalThis as HubGlobal;
  if (hooks) g[KEY] = hooks;
  else delete g[KEY];
}

/** Start the background drainer once per server process. */
export function startWebhooks(): void {
  getHooks().start();
}

/** True when there is a hub to queue into (one injected, or a database configured). */
export function hubConfigured(): boolean {
  return Boolean((globalThis as HubGlobal)[KEY] || process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * Queue an event for the owner's endpoints. Never throws: a webhook problem
 * must not fail the SMS, payment or sweep that triggered it. `id` fixes the
 * CloudEvents id (and so the webhook-id) for events that may be reported twice.
 */
export async function emitEvent(
  owner: string | null | undefined,
  type: WebhookEventType,
  data: Record<string, unknown>,
  subject?: string,
  id?: string
): Promise<void> {
  if (!owner || !hubConfigured()) return;
  try {
    await getHooks().emit(owner, type, data, { ...(subject ? { subject } : {}), ...(id ? { id } : {}) });
  } catch (error) {
    console.error(`[webhooks] emit ${type} failed:`, error);
  }
}

/** Create an endpoint, within the plan's webhook allowance (free 1, pro 10). */
export async function createWebhook(
  owner: string,
  input: { url?: unknown; events?: unknown; description?: unknown },
  hooks: Webhooks = getHooks()
) {
  const limit = limitReached(await getPlanUsage(createServiceClient(), owner), "webhooks");
  if (limit) throw new WebhookError(limit, 403);
  return hooks.createEndpoint(owner, {
    url: typeof input.url === "string" ? input.url : "",
    events: Array.isArray(input.events) || typeof input.events === "string" ? (input.events as string[] | string) : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
  });
}
