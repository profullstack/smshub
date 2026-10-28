// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { memoryStore } from "@profullstack/webhooks";
import { FakeDb } from "@/__tests__/fake-db";
import { createHooks, setHooks } from "@/lib/webhooks/hub";
import { sweep, GRACE_DAYS } from "../service";

const guard = { lookup: async () => ["93.184.216.34"] };
const env = { MANAGED_NUMBERS_MODE: "test" } as unknown as NodeJS.ProcessEnv;

afterEach(() => setHooks(null));

describe("rented number webhook events", () => {
  it("number.expiring goes out once per paid-until date, and number.released when it lapses", async () => {
    const hooks = createHooks(memoryStore(), { guard });
    setHooks(hooks);
    await hooks.createEndpoint("owner-1", { url: "https://hooks.example.com/", events: ["number.*"] });

    const fdb = new FakeDb();
    const db = fdb as unknown as SupabaseClient;
    const now = new Date("2026-10-28T12:00:00Z");
    const expires = new Date(now.getTime() + 2 * 86400_000).toISOString();
    fdb.rows("phone_numbers").push({ id: "pn1", user_id: "owner-1", number: "+14155550100", managed: true, status: "active", expires_at: expires });
    fdb.rows("phone_numbers").push({ id: "pn2", user_id: "owner-1", number: "+14155550101", managed: true, status: "active", expires_at: new Date(now.getTime() + 31 * 86400_000).toISOString() });

    await sweep({ db, env, now: () => now });
    await sweep({ db, env, now: () => new Date(now.getTime() + 5 * 60_000) });
    let events = (await hooks.deliveries("owner-1", { limit: 20 })).map((d) => d.event_type);
    expect(events).toEqual(["number.expiring"]);
    expect(fdb.rows("phone_numbers")[0].expiry_notified_for).toBe(expires);

    // Renewed: a new paid-until date gets its own reminder when it comes round.
    const renewed = new Date(now.getTime() + 32 * 86400_000).toISOString();
    fdb.rows("phone_numbers")[0].expires_at = renewed;
    await sweep({ db, env, now: () => new Date(now.getTime() + 30 * 86400_000) });
    events = (await hooks.deliveries("owner-1", { limit: 20 })).map((d) => d.event_type);
    expect(events.filter((e) => e === "number.expiring")).toHaveLength(3); // pn1 again + pn2 now in its window

    // Lapsed past the grace days: released.
    await sweep({ db, env, now: () => new Date(new Date(renewed).getTime() + (GRACE_DAYS + 1) * 86400_000) });
    events = (await hooks.deliveries("owner-1", { limit: 20 })).map((d) => d.event_type);
    expect(events).toContain("number.released");
  });
});
