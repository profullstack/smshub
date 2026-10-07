import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import { bookLineId, createLineContact, shareContactsBook, type Line } from "../contacts";
import { handleCallEvent, type CallState } from "@/lib/voice/ivr";
import { decodeState } from "@/lib/voice/telnyx-voice";
import { recordInbound } from "@/lib/inbound";

vi.mock("@/lib/webhooks/outbound", () => ({ fireWebhooks: vi.fn() }));

const LOCAL = "11111111-1111-4111-8111-111111111111";
const TOLLFREE = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function setup() {
  const fdb = new FakeDb();
  fdb.tables.phone_numbers = [
    { id: LOCAL, user_id: "u1", number: "+19165550100", status: "active", contacts_line_id: null },
    { id: TOLLFREE, user_id: "u1", number: "+18885550100", status: "active", contacts_line_id: LOCAL },
    { id: OTHER, user_id: "u2", number: "+14155550100", status: "active", contacts_line_id: null },
  ];
  fdb.tables.line_contacts = [
    { id: "lc1", phone_number_id: LOCAL, user_id: "u1", name: "Kim", forward_to: "+14155550001", keypad_digit: 1, sms_prefix: "K", forward_sms: false },
  ];
  return fdb;
}
const line = (id: string, contacts_line_id: string | null): Line => ({
  id, user_id: "u1", number: "+1", friendly_name: null, provider_id: "p", provider_type: "telnyx", managed: false, contacts_line_id,
});

describe("shared contacts book", () => {
  it("resolves the book line", async () => {
    const db = setup() as unknown as SupabaseClient;
    expect(await bookLineId(db, TOLLFREE)).toBe(LOCAL);
    expect(await bookLineId(db, LOCAL)).toBe(LOCAL);
  });

  it("plays the 916 menu on the 888 and puts the caller through", async () => {
    const fdb = setup();
    const calls: Array<{ action: string; body: Record<string, unknown> }> = [];
    const deps = {
      db: fdb as unknown as SupabaseClient,
      command: vi.fn(async (_id: string, action: string, body: Record<string, unknown>) => {
        calls.push({ action, body });
        return { ok: true as const, data: {} };
      }),
    };
    const tf = { id: TOLLFREE, user_id: "u1", number: "+18885550100" };
    const ev = (event_type: string, payload: Record<string, unknown>) => ({ event_type, payload: { call_control_id: "cc", ...payload } });
    expect(await handleCallEvent(deps, tf, ev("call.initiated", { direction: "incoming", from: "+12125550199", call_session_id: "s" }), null)).toBe("answered");
    const state = decodeState(calls[0].body.client_state) as CallState;
    await handleCallEvent(deps, tf, ev("call.answered", {}), state);
    expect(calls[1].body.payload).toBe("Thanks for calling. Press 1 for Kim.");
    expect(await handleCallEvent(deps, tf, ev("call.gather.ended", { digits: "1", status: "valid" }), state)).toBe("transferred to Kim");
    // The call is logged on the number that was called.
    expect(fdb.rows("conversations")[0].phone_number_id).toBe(TOLLFREE);
  });

  it("routes 'K:' texts to the 888 with the 916's prefixes", async () => {
    const fdb = setup();
    fdb.tables.contacts = [{ id: "c-kim", user_id: "u1", phone: "+14155550001", name: "Kim" }];
    await recordInbound(fdb as unknown as SupabaseClient, { id: TOLLFREE, user_id: "u1", number: "+18885550100", provider_id: "p" }, {
      from: "+12125550199", to: "+18885550100", body: "K: hi", provider: "telnyx", providerMessageId: "m1",
    });
    expect(fdb.rows("conversations")[0]).toMatchObject({ contact_id: "c-kim", phone_number_id: TOLLFREE });
    expect(fdb.rows("messages")[0]).toMatchObject({ body: "hi", routed_from: "+12125550199" });
  });

  it("enforces one hop, ownership and no edits on a borrowing line", async () => {
    const fdb = setup();
    const db = fdb as unknown as SupabaseClient;
    expect(await shareContactsBook(db, line(LOCAL, null), LOCAL)).toMatchObject({ status: 400 });
    expect(await shareContactsBook(db, line(LOCAL, null), TOLLFREE)).toMatchObject({ status: 400 }); // TOLLFREE borrows
    expect(await shareContactsBook(db, line(LOCAL, null), OTHER)).toMatchObject({ status: 404 }); // not yours
    expect(await createLineContact(db, line(TOLLFREE, LOCAL), { name: "X", forward_to: "+14155550009" })).toMatchObject({ status: 409 });
    expect(await shareContactsBook(db, line(TOLLFREE, LOCAL), null)).toEqual({ ok: true });
    expect(fdb.rows("phone_numbers").find((r) => r.id === TOLLFREE)?.contacts_line_id).toBeNull();
  });
});
