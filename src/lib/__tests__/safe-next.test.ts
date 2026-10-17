import { describe, expect, it } from "vitest";
import { safeNextPath } from "../safe-next";

describe("safeNextPath", () => {
  it("keeps same-origin paths, query included", () => {
    expect(safeNextPath("/numbers")).toBe("/numbers");
    expect(safeNextPath("/numbers?order=abc")).toBe("/numbers?order=abc");
  });

  it("falls back for empty, absolute and protocol-relative values", () => {
    expect(safeNextPath(null)).toBe("/inbox");
    expect(safeNextPath("")).toBe("/inbox");
    expect(safeNextPath("https://evil.example")).toBe("/inbox");
    expect(safeNextPath("//evil.example")).toBe("/inbox");
    expect(safeNextPath("/\\evil.example")).toBe("/inbox");
  });

  it("honours a custom fallback", () => {
    expect(safeNextPath(undefined, "/numbers")).toBe("/numbers");
  });
});
