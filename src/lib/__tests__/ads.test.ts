import { describe, expect, it } from "vitest";
import { isAdPage } from "../ads";

describe("isAdPage", () => {
  it("shows on public pages", () => {
    for (const p of ["/", "/docs", "/docs/telnyx", "/privacy", "/terms/", "/sms", "/phonenumbers"]) {
      expect(isAdPage(p)).toBe(true);
    }
  });
  it("never shows in the app, auth or checkout", () => {
    for (const p of ["/inbox", "/numbers", "/settings", "/login", "/register", "/org/x", "/docsx", null]) {
      expect(isAdPage(p)).toBe(false);
    }
  });
});
