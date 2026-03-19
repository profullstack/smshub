import { describe, it, expect } from "vitest";

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("ok");
    expect(json.timestamp).toBeDefined();
  });
});
