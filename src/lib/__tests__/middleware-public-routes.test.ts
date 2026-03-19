import { describe, it, expect } from "vitest";

// Test that PUBLIC_ROUTES includes critical paths
describe("Public routes config", () => {
  it("includes static file paths", async () => {
    // Read the middleware source to verify routes
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve("src/lib/supabase/middleware.ts"),
      "utf-8"
    );

    expect(content).toContain('"/manifest.json"');
    expect(content).toContain('"/robots.txt"');
    expect(content).toContain('"/sitemap.xml"');
  });

  it("includes API routes", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve("src/lib/supabase/middleware.ts"),
      "utf-8"
    );

    expect(content).toContain('"/api"');
  });

  it("includes public pages", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve("src/lib/supabase/middleware.ts"),
      "utf-8"
    );

    expect(content).toContain('"/"');
    expect(content).toContain('"/login"');
    expect(content).toContain('"/register"');
    expect(content).toContain('"/privacy"');
    expect(content).toContain('"/terms"');
    expect(content).toContain('"/install"');
    expect(content).toContain('"/phonenumbers"');
  });
});
