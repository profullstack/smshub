import { describe, expect, it } from "vitest";
import { dayLabel, initials, relativeTime, splitCode } from "../format";
import { extractOtp } from "@/lib/otp";

const now = new Date("2026-10-07T12:00:00");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();

describe("relativeTime", () => {
  it("counts up from now through minutes and hours", () => {
    expect(relativeTime(ago(10), now)).toBe("now");
    expect(relativeTime(ago(5 * 60), now)).toBe("5m");
    expect(relativeTime(ago(3 * 3600), now)).toBe("3h");
  });

  it("uses a weekday inside a week and a date after", () => {
    expect(relativeTime(ago(2 * 86400), now)).toBe("Mon");
    expect(relativeTime(ago(30 * 86400), now)).toBe("Sep 7");
  });

  it("is blank for nothing or junk", () => {
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime("not a date", now)).toBe("");
  });
});

describe("dayLabel", () => {
  it("names today and yesterday", () => {
    expect(dayLabel("2026-10-07T08:00:00", now)).toBe("Today");
    expect(dayLabel("2026-10-06T23:00:00", now)).toBe("Yesterday");
  });

  it("adds the year only for another year", () => {
    expect(dayLabel("2026-10-01T08:00:00", now)).toBe("Thu, Oct 1");
    expect(dayLabel("2025-10-01T08:00:00", now)).toBe("Wed, Oct 1, 2025");
  });
});

describe("initials", () => {
  it("prefers the name, then the number, then #", () => {
    expect(initials("Kim Lee", "+15550142")).toBe("KL");
    expect(initials("kim", null)).toBe("KI");
    expect(initials(null, "+1 415 555 0142")).toBe("42");
    expect(initials("  ", "")).toBe("#");
  });
});

describe("splitCode", () => {
  it("splits common code lengths for reading aloud", () => {
    expect(splitCode("482913")).toBe("482 913");
    expect(splitCode("70512345")).toBe("7051 2345");
    expect(splitCode("7051")).toBe("70 51");
    expect(splitCode("12345")).toBe("12345");
  });
});

describe("extractOtp from the browser-safe module", () => {
  it("finds the code next to a keyword", () => {
    expect(extractOtp("Your sign-in code is 482-913. Don't share it.")).toBe("482913");
    expect(extractOtp("Running 10 late")).toBeNull();
  });
});
