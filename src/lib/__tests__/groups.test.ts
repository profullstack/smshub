import { describe, it, expect } from "vitest";
import { cleanMembers, MAX_GROUP_MEMBERS } from "@/lib/groups";

describe("cleanMembers", () => {
  it("normalises phones, keeps names, and de-duplicates", () => {
    expect(cleanMembers([{ phone: "(415) 555-0123", name: " Kim " }, "+14155550124", { phone: "4155550123" }])).toEqual([
      { phone: "+14155550123", name: "Kim" },
      { phone: "+14155550124", name: null },
    ]);
  });

  it("refuses a bad phone instead of skipping it, and too many members", () => {
    expect(() => cleanMembers([{ phone: "555" }])).toThrow(/Invalid member phone/);
    expect(() => cleanMembers("+14155550123")).toThrow(/list/);
    const many = Array.from({ length: MAX_GROUP_MEMBERS + 1 }, (_, i) => `+1415555${String(i).padStart(4, "0")}`);
    expect(() => cleanMembers(many)).toThrow(/at most/);
    expect(cleanMembers(undefined)).toEqual([]);
  });
});
