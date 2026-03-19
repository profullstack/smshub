import { describe, it, expect } from "vitest";

describe("Security headers config", () => {
  it("next.config.ts includes security headers", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve("next.config.ts"),
      "utf-8"
    );

    expect(content).toContain("X-Frame-Options");
    expect(content).toContain("X-Content-Type-Options");
    expect(content).toContain("Referrer-Policy");
    expect(content).toContain("Strict-Transport-Security");
  });
});
