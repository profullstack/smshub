// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { memoryStore } from "@profullstack/webhooks";
import { FakeDb } from "@/__tests__/fake-db";
import { createHooks, setHooks } from "@/lib/webhooks/hub";
import type { Mail } from "@/lib/email/mailer";
import { sweep, GRACE_DAYS } from "../service";
import { formatPhoneNumber } from "../expiry-email";

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

describe("rented number expiry email", () => {
  function setup() {
    const fdb = new FakeDb();
    const db = fdb as unknown as SupabaseClient;
    const sent: Mail[] = [];
    const mailer = async (m: Mail) => {
      sent.push(m);
      return { sent: true, id: `msg_${sent.length}` };
    };
    const ownerEmail = async (uid: string) => (uid === "owner-1" ? "owner@example.com" : null);
    return { fdb, db, sent, mailer, ownerEmail };
  }

  it("emails the owner once per paid-until date, alongside the webhook", async () => {
    const { fdb, db, sent, mailer, ownerEmail } = setup();
    const hooks = createHooks(memoryStore(), { guard });
    setHooks(hooks);
    await hooks.createEndpoint("owner-1", { url: "https://hooks.example.com/", events: ["number.*"] });
    const now = new Date("2026-11-18T12:00:00Z");
    const expires = "2026-11-20T14:51:00.000Z";
    fdb.rows("phone_numbers").push({ id: "pn1", user_id: "owner-1", number: "+14155550100", managed: true, status: "active", expires_at: expires });
    fdb.rows("phone_numbers").push({ id: "pn2", user_id: "owner-1", number: "+14155550101", managed: true, status: "active", expires_at: new Date(now.getTime() + 31 * 86400_000).toISOString() });

    await sweep({ db, env, now: () => now, mailer, ownerEmail });
    await sweep({ db, env, now: () => new Date(now.getTime() + 5 * 60_000), mailer, ownerEmail });
    await sweep({ db, env, now: () => new Date(now.getTime() + 24 * 3600_000), mailer, ownerEmail });

    expect(sent).toHaveLength(1);
    expect((await hooks.deliveries("owner-1", { limit: 20 })).map((d) => d.event_type)).toEqual(["number.expiring"]);
    const m = sent[0];
    expect(m.to).toBe("owner@example.com");
    expect(m.subject).toContain("+1 (415) 555-0100");
    expect(m.text).toContain("Fri, Nov 20, 2026");
    expect(m.text).toContain("14:51 UTC");
    expect(m.text).toContain("https://smshub.dev/numbers");
    expect(m.text).toContain("npx @profullstack/smshub renew +14155550100");
    expect(m.text).toMatch(/released after the grace period \(Mon, Nov 23, 2026/);
    expect(m.html).toContain('href="https://smshub.dev/numbers"');

    // Renewed: the new paid-until date gets its own email when it comes round.
    const renewed = new Date(new Date(expires).getTime() + 30 * 86400_000).toISOString();
    fdb.rows("phone_numbers")[0].expires_at = renewed;
    await sweep({ db, env, now: () => new Date(new Date(renewed).getTime() - 86400_000), mailer, ownerEmail });
    expect(sent.filter((x) => x.subject.includes("555-0100"))).toHaveLength(2);
  });

  it("still sends the webhook and marks the date when there is no mailer or no owner email", async () => {
    const { fdb, db, sent, mailer } = setup();
    const now = new Date("2026-11-18T12:00:00Z");
    const expires = new Date(now.getTime() + 86400_000).toISOString();
    fdb.rows("phone_numbers").push({ id: "pn1", user_id: "owner-1", number: "+14155550100", managed: true, status: "active", expires_at: expires });
    fdb.rows("phone_numbers").push({ id: "pn2", user_id: "nobody", number: "+14155550102", managed: true, status: "active", expires_at: expires });

    const r1 = await sweep({ db, env, now: () => now, mailer: null });
    expect(r1.errors).toEqual([]);
    expect(fdb.rows("phone_numbers").map((r) => r.expiry_notified_for)).toEqual([expires, expires]);

    fdb.rows("phone_numbers").forEach((r) => (r.expiry_notified_for = null));
    await sweep({ db, env, now: () => now, mailer, ownerEmail: async () => null });
    expect(sent).toHaveLength(0);
  });

  it("reports a failed send without stopping the sweep", async () => {
    const { fdb, db, ownerEmail } = setup();
    const now = new Date("2026-11-18T12:00:00Z");
    fdb.rows("phone_numbers").push({ id: "pn1", user_id: "owner-1", number: "+14155550100", managed: true, status: "active", expires_at: new Date(now.getTime() + 86400_000).toISOString() });
    const r = await sweep({ db, env, now: () => now, ownerEmail, mailer: async () => ({ sent: false, error: "boom" }) });
    expect(r.errors).toEqual(["expiry email pn1: boom"]);
  });
});

describe("formatPhoneNumber", () => {
  it("formats NANP numbers and leaves others alone", () => {
    expect(formatPhoneNumber("+14155550100")).toBe("+1 (415) 555-0100");
    expect(formatPhoneNumber("+447700900123")).toBe("+447700900123");
  });
});
