// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryStore } from "@profullstack/webhooks";

const resolveUser = vi.fn();
vi.mock("@/lib/request-user", () => ({ resolveUser: (...a: unknown[]) => resolveUser(...a) }));
const usage = { plan: "free", limits: { webhooks: 1 }, usage: { webhooks: 0 } };
vi.mock("@/lib/plans", () => ({
  getPlanUsage: vi.fn(async () => usage),
  limitReached: (p: typeof usage) => (p.usage.webhooks < p.limits.webhooks ? null : "The free plan allows 1 webhooks."),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(() => ({})), createServerSupabaseClient: vi.fn() }));

import { createHooks, setHooks } from "@/lib/webhooks/hub";

const guard = { lookup: async () => ["93.184.216.34"] };
const url = (p = "") => `https://smshub.dev/api/v1/webhooks${p}`;

describe("/api/v1/webhooks", () => {
  beforeEach(() => {
    setHooks(createHooks(memoryStore(), { guard }));
    usage.usage.webhooks = 0;
  });
  afterEach(() => setHooks(null));

  it("answers 401 without an API key or session", async () => {
    resolveUser.mockResolvedValue({ error: "Unauthorized", status: 401 });
    const { GET, POST } = await import("@/app/api/v1/webhooks/[[...path]]/route");
    expect((await GET(new Request(url()))).status).toBe(401);
    expect((await POST(new Request(url(), { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it("creates, lists and removes an endpoint for the caller, within the plan limit", async () => {
    resolveUser.mockResolvedValue({ user: { userId: "user-1", email: null, via: "api-key" } });
    const { GET, POST, DELETE } = await import("@/app/api/v1/webhooks/[[...path]]/route");

    const created = await POST(
      new Request(url(), { method: "POST", body: JSON.stringify({ url: "https://hooks.example.com/sms", events: ["message.received"] }) })
    );
    expect(created.status).toBe(201);
    const { endpoint, secret } = await created.json();
    expect(secret).toMatch(/^whsec_/);

    const list = await (await GET(new Request(url()))).json();
    expect(list.endpoints.map((e: { id: string }) => e.id)).toEqual([endpoint.id]);
    expect(list.event_types).toContain("message.received");

    usage.usage.webhooks = 1;
    const refused = await POST(new Request(url(), { method: "POST", body: JSON.stringify({ url: "https://hooks.example.com/2" }) }));
    expect(refused.status).toBe(403);

    // Another account cannot see it.
    resolveUser.mockResolvedValue({ user: { userId: "user-2", email: null, via: "api-key" } });
    expect((await GET(new Request(url(`/${endpoint.id}`)))).status).toBe(404);

    resolveUser.mockResolvedValue({ user: { userId: "user-1", email: null, via: "session" } });
    expect((await DELETE(new Request(url(`/${endpoint.id}`), { method: "DELETE" }))).status).toBe(200);
  });
});
