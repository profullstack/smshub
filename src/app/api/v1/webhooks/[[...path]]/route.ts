import { NextResponse } from "next/server";
import { webhooksApi, WebhookError } from "@profullstack/webhooks";
import { resolveUser } from "@/lib/request-user";
import { createWebhook, getHooks, WEBHOOKS_BASE_PATH } from "@/lib/webhooks/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/v1/webhooks: the @profullstack/webhooks API, scoped to the caller
 * (X-API-Key / Authorization: Bearer smshub_..., or the browser session).
 *
 *   GET    /                      endpoints + event_types
 *   POST   /                      { url, events?, description? } -> { endpoint, secret }   (plan limit: free 1, pro 10)
 *   GET|PATCH|DELETE /:id
 *   GET    /:id/secret            POST /:id/rotate      POST /:id/test
 *   GET    /:id/deliveries        GET /deliveries       POST /deliveries/:id/retry
 */
async function handle(request: Request): Promise<Response> {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const owner = who.user.userId;

  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (path === WEBHOOKS_BASE_PATH && request.method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = ((await request.json()) ?? {}) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
      }
      return NextResponse.json(await createWebhook(owner, body), { status: 201 });
    }
    const api = webhooksApi(getHooks(), { basePath: WEBHOOKS_BASE_PATH, owner: () => owner });
    return (await api(request)) ?? NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof WebhookError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[webhooks api]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
