import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import {
  cleanContactInput,
  conflictMessage,
  createLineContact,
  deleteLineContact,
  matchPrefix,
  normalizeCell,
  updateLineContact,
  type Line,
} from "../contacts";
import { recordInbound } from "@/lib/inbound";

vi.mock("@/lib/webhooks/outbound", () => ({ fireWebhooks: vi.fn() }));

const LINE_ID = "11111111-1111-4111-8111-111111111111";
const line: Line = {
  id: LINE_ID,
  user_id: "u1",
  number: "+14085550100",
  friendly_name: "Family",
  provider_id: "prov-1",
  provider_type: "telnyx",
  managed: false,
  contacts_line_id: null,
  record_calls: false,
};

describe("cleanContactInput", () => {
  it("needs a name and a cell to create", () => {
    expect(cleanContactInput({ forward_to: "+14155550123" }, false)).toMatchObject({ ok: false });
    expect(cleanContactInput({ name: "Kim" }, false)).toMatchObject({ ok: false });
    expect(cleanContactInput({ name: " Kim ", forward_to: "(415) 555-0123", keypad_digit: "1", sms_prefix: "k:" }, false)).toEqual({
      ok: true,
      value: { name: "Kim", forward_to: "+14155550123", keypad_digit: 1, sms_prefix: "K" },
    });
  });

  it("rejects bad digits, prefixes and flags; null clears", () => {
    expect(cleanContactInput({ keypad_digit: 10 }, true)).toMatchObject({ ok: false });
    expect(cleanContactInput({ keypad_digit: "#" }, true)).toMatchObject({ ok: false });
    expect(cleanContactInput({ sms_prefix: "K K" }, true)).toMatchObject({ ok: false });
    expect(cleanContactInput({ forward_sms: "yes" }, true)).toMatchObject({ ok: false });
    expect(cleanContactInput({ keypad_digit: null, sms_prefix: "" }, true)).toEqual({ ok: true, value: { keypad_digit: null, sms_prefix: null } });
  });

  it("normalizes cells", () => {
    expect(normalizeCell("4155550123")).toBe("+14155550123");
    expect(normalizeCell("1-415-555-0123")).toBe("+14155550123");
    expect(normalizeCell("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizeCell("555")).toBeNull();
  });

  it("names unique clashes", () => {
    expect(conflictMessage({ code: "23505", message: 'duplicate key value violates unique constraint "line_contacts_digit_uniq"' })).toMatch(/keypad digit/);
    expect(conflictMessage({ code: "23505", message: "line_contacts_prefix_uniq" })).toMatch(/prefix/);
    expect(conflictMessage({ code: "42P01" })).toBeNull();
  });
});

describe("matchPrefix", () => {
  const book = [
    { sms_prefix: "K", name: "Kim" },
    { sms_prefix: "MO", name: "Mo" },
    { sms_prefix: null, name: "Pat" },
  ];
  it("routes K: and k： to K, strips the prefix", () => {
    expect(matchPrefix("K: running late", book)).toEqual({ contact: book[0], text: "running late" });
    expect(matchPrefix("  k：pick me up", book)?.text).toBe("pick me up");
    expect(matchPrefix("mo:hi", book)?.contact.name).toBe("Mo");
  });
  it("leaves unknown prefixes and plain texts alone", () => {
    expect(matchPrefix("Z: hello", book)).toBeNull();
    expect(matchPrefix("Your code is 123456", book)).toBeNull();
    expect(matchPrefix("Kim: hi", book)).toBeNull();
  });
});

describe("line contacts CRUD", () => {
  it("creates, names the thread contact, edits and deletes", async () => {
    const fdb = new FakeDb();
    const db = fdb as unknown as SupabaseClient;
    fdb.tables.contacts = [{ id: "c-old", user_id: "u1", phone: "+14155550123", name: null }];

    const made = await createLineContact(db, line, { name: "Kim", forward_to: "+14155550123", keypad_digit: 1, sms_prefix: "k" });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.contact).toMatchObject({ phone_number_id: LINE_ID, contact_id: "c-old", sms_prefix: "K", keypad_digit: 1 });
    // The existing contacts row for that cell now carries the name, so its threads show "Kim".
    expect(fdb.rows("contacts")).toEqual([expect.objectContaining({ id: "c-old", name: "Kim" })]);

    const edited = await updateLineContact(db, line, made.contact.id, { name: "Kimberly", keypad_digit: null });
    expect(edited).toMatchObject({ ok: true, contact: { name: "Kimberly", keypad_digit: null } });
    expect(fdb.rows("contacts")[0].name).toBe("Kimberly");

    expect(await updateLineContact(db, line, "22222222-2222-4222-8222-222222222222", { name: "X" })).toMatchObject({ status: 404 });
    expect(await deleteLineContact(db, { ...line, id: "33333333-3333-4333-8333-333333333333" }, made.contact.id)).toBe(false);
    expect(await deleteLineContact(db, line, made.contact.id)).toBe(true);
    expect(fdb.rows("line_contacts")).toEqual([]);
  });

  it("refuses a bad cell with 400", async () => {
    const res = await createLineContact(new FakeDb() as unknown as SupabaseClient, line, { name: "Kim", forward_to: "nope" });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });
});

describe("inbound prefix routing", () => {
  function setup() {
    const fdb = new FakeDb();
    fdb.tables.providers = [{ id: "prov-1", type: "telnyx", api_key: "__managed__", api_secret: null }];
    fdb.tables.contacts = [{ id: "c-kim", user_id: "u1", phone: "+14155550123", name: "Kim" }];
    fdb.tables.line_contacts = [
      { id: "lc1", phone_number_id: LINE_ID, user_id: "u1", name: "Kim", forward_to: "+14155550123", sms_prefix: "K", forward_sms: false },
    ];
    return fdb;
  }
  const owned = { id: LINE_ID, user_id: "u1", number: line.number, provider_id: "prov-1" };
  const text = (body: string, id: string) => ({ from: "+12125550199", to: line.number, body, provider: "telnyx" as const, providerMessageId: id });

  it("files 'K: ...' into Kim's thread and keeps the real sender", async () => {
    const fdb = setup();
    await recordInbound(fdb as unknown as SupabaseClient, owned, text("K: dentist moved to 3pm", "m1"));
    const [convo] = fdb.rows("conversations");
    expect(convo.contact_id).toBe("c-kim");
    expect(fdb.rows("messages")).toEqual([
      expect.objectContaining({ conversation_id: convo.id, body: "dentist moved to 3pm", routed_from: "+12125550199" }),
    ]);
  });

  it("keeps an unprefixed text in the sender's own (shared) thread", async () => {
    const fdb = setup();
    await recordInbound(fdb as unknown as SupabaseClient, owned, text("hello all", "m2"));
    const sender = fdb.rows("contacts").find((c) => c.phone === "+12125550199");
    expect(fdb.rows("conversations")[0].contact_id).toBe(sender?.id);
    expect(fdb.rows("messages")[0]).toMatchObject({ body: "hello all" });
    expect(fdb.rows("messages")[0].routed_from).toBeUndefined();
  });

  it("forwards to the cell when asked, and logs why it could not send", async () => {
    const fdb = setup();
    fdb.rows("line_contacts")[0].forward_sms = true;
    await recordInbound(fdb as unknown as SupabaseClient, owned, text("k: call me", "m3"));
    const out = fdb.rows("messages").find((m) => m.direction === "outbound");
    expect(out).toMatchObject({ body: "From +12125550199: call me", status: "failed" });
    expect(String(out?.error_detail)).toMatch(/receive texts only/);
  });
});
