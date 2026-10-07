import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import { cleanLineName, lineFilter, listConversations } from "../conversations";
import { buildLines, lineLabel } from "../inbox-lines";

const N1 = "11111111-1111-4111-8111-111111111111";
const N2 = "22222222-2222-4222-8222-222222222222";

describe("lineFilter", () => {
  it("is null when absent or empty, the id when a uuid, undefined otherwise", () => {
    expect(lineFilter(new URLSearchParams(""))).toBeNull();
    expect(lineFilter(new URLSearchParams("phone_number_id="))).toBeNull();
    expect(lineFilter(new URLSearchParams(`phone_number_id=${N1}`))).toBe(N1);
    expect(lineFilter(new URLSearchParams("phone_number_id=1;drop"))).toBeUndefined();
  });
});

describe("cleanLineName", () => {
  it("trims, clears on empty, strips control characters and caps length", () => {
    expect(cleanLineName("  Mom ")).toBe("Mom");
    expect(cleanLineName("")).toBeNull();
    expect(cleanLineName(null)).toBeNull();
    expect(cleanLineName("Kid\u0000\n")).toBe("Kid");
    expect(cleanLineName("x".repeat(61))).toBeUndefined();
    expect(cleanLineName(42)).toBeUndefined();
    expect(cleanLineName(undefined)).toBeUndefined();
  });
});

describe("listConversations", () => {
  function db() {
    const fdb = new FakeDb();
    fdb.rows("conversations").push(
      { id: "c1", user_id: "u1", phone_number_id: N1, archived: false, last_message_at: "2026-10-01" },
      { id: "c2", user_id: "u1", phone_number_id: N2, archived: false, last_message_at: "2026-10-03" },
      { id: "c3", user_id: "u1", phone_number_id: N1, archived: true, last_message_at: "2026-10-02" },
      { id: "c4", user_id: "u2", phone_number_id: N1, archived: false, last_message_at: "2026-10-04" }
    );
    return fdb as unknown as SupabaseClient;
  }

  it("lists only the user's conversations, newest first", async () => {
    const rows = await listConversations(db(), "u1");
    expect(rows.map((r) => r.id)).toEqual(["c2", "c3", "c1"]);
  });

  it("narrows to one line and to archived state", async () => {
    expect((await listConversations(db(), "u1", { phoneNumberId: N1 })).map((r) => r.id)).toEqual(["c3", "c1"]);
    expect((await listConversations(db(), "u1", { phoneNumberId: N1, archived: false })).map((r) => r.id)).toEqual(["c1"]);
    expect((await listConversations(db(), "u2", { phoneNumberId: N2 })).length).toBe(0);
  });
});

describe("buildLines", () => {
  it("labels by friendly_name, falls back to the number, and sums unread outside the archive", () => {
    const numbers = [
      { id: N1, number: "+14155550001", friendly_name: "Mom" },
      { id: N2, number: "+14155550002", friendly_name: null },
    ];
    const team = { id: "t1", number: "+14155550003", friendly_name: "Office" };
    const lines = buildLines(numbers, [
      { phone_number_id: N1, archived: false, unread_count: 2, phone_numbers: numbers[0] },
      { phone_number_id: N1, archived: false, unread_count: 1, phone_numbers: numbers[0] },
      { phone_number_id: N1, archived: true, unread_count: 5, phone_numbers: numbers[0] },
      { phone_number_id: "t1", archived: false, unread_count: 4, phone_numbers: team },
    ]);
    expect(lines).toEqual([
      { id: N1, label: "Mom", number: "+14155550001", unread: 3 },
      { id: N2, label: "+14155550002", number: "+14155550002", unread: 0 },
      { id: "t1", label: "Office", number: "+14155550003", unread: 4 },
    ]);
    expect(lineLabel({ id: "x", number: "+1", friendly_name: "  " })).toBe("+1");
  });
});
