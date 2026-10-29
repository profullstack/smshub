import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import { dropIfBlocked, listBlocked, setBlocked } from "../blocking";
import { recordInbound } from "../inbound";
import { handleCallEvent } from "../voice/ivr";

vi.mock("@/lib/webhooks/hub", () => ({ emitEvent: vi.fn(async () => {}) }));

const LINE = { id: "11111111-1111-4111-8111-111111111111", user_id: "u1", number: "+18885550100", provider_id: "p1" };
const SPAMMER = "+14155550199";

function setup() {
  const fdb = new FakeDb();
  fdb.tables.contacts = [];
  fdb.tables.conversations = [];
  fdb.tables.messages = [];
  fdb.tables.line_contacts = [];
  return { fdb, db: fdb as unknown as SupabaseClient };
}

const inbound = (from: string, body = "you won a prize", id = "m-" + Math.random()) => ({
  from,
  to: LINE.number,
  body,
  provider: "telnyx" as const,
  providerMessageId: id,
});

describe("blocking", () => {
  it("blocks a number never seen before, then drops its texts without storing them", async () => {
    const { fdb, db } = setup();
    const r = await setBlocked(db, "u1", { phone: SPAMMER }, "scam");
    expect("blocked" in r && r.blocked.reason).toBe("scam");

    const out = await recordInbound(db, LINE, inbound(SPAMMER));
    expect(out).toEqual({ messageId: null, duplicate: false });
    expect(fdb.rows("messages")).toHaveLength(0);
    expect(fdb.rows("conversations")).toHaveLength(0);

    const [b] = await listBlocked(db, "u1");
    expect(b).toMatchObject({ phone: SPAMMER, reason: "scam", blocked_count: 1 });
    expect(b.last_blocked_at).toBeTruthy();
  });

  it("archives the existing thread on block and lets texts through again after unblock", async () => {
    const { fdb, db } = setup();
    await recordInbound(db, LINE, inbound(SPAMMER, "hi"));
    const [contact] = fdb.rows("contacts");
    expect(fdb.rows("conversations")[0].archived).toBe(false);

    await setBlocked(db, "u1", { contactId: String(contact.id) }, "spam");
    expect(fdb.rows("conversations")[0].archived).toBe(true);
    await recordInbound(db, LINE, inbound(SPAMMER, "again"));
    expect(fdb.rows("messages")).toHaveLength(1);

    const un = await setBlocked(db, "u1", { phone: SPAMMER }, null);
    expect("blocked" in un && un.blocked.blocked_at).toBeNull();
    await recordInbound(db, LINE, inbound(SPAMMER, "third"));
    expect(fdb.rows("messages")).toHaveLength(2);
  });

  it("is per user: another user's block does not drop this user's texts", async () => {
    const { db } = setup();
    await setBlocked(db, "u2", { phone: SPAMMER }, "spam");
    expect(await dropIfBlocked(db, "u1", SPAMMER)).toBe(false);
  });

  it("rejects a bad phone and refuses to unblock what was never blocked", async () => {
    const { db } = setup();
    expect(await setBlocked(db, "u1", { phone: "nope" }, "spam")).toMatchObject({ status: 400 });
    expect(await setBlocked(db, "u1", { phone: SPAMMER }, null)).toMatchObject({ status: 404 });
  });

  it("hangs up on a blocked caller without logging the call", async () => {
    const { fdb, db } = setup();
    await setBlocked(db, "u1", { phone: SPAMMER }, "spam");
    const command = vi.fn(async () => ({ ok: true as const, data: {} }));
    const result = await handleCallEvent(
      { db, command },
      { id: LINE.id, user_id: "u1", number: LINE.number },
      { event_type: "call.initiated", payload: { call_control_id: "cc-1", direction: "incoming", from: SPAMMER } },
      null
    );
    expect(result).toBe("rejected: blocked");
    expect(command).toHaveBeenCalledWith("cc-1", "hangup", {});
    expect(fdb.rows("messages")).toHaveLength(0);
  });
});
