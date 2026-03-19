import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimitStore } from "../rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("allows requests under the limit", () => {
    const config = { limit: 3, windowMs: 60000 };
    const r1 = checkRateLimit("user-1", config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit("user-1", config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
  });

  it("blocks requests over the limit", () => {
    const config = { limit: 2, windowMs: 60000 };
    checkRateLimit("user-2", config);
    checkRateLimit("user-2", config);

    const r3 = checkRateLimit("user-2", config);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks different keys independently", () => {
    const config = { limit: 1, windowMs: 60000 };
    const r1 = checkRateLimit("a", config);
    expect(r1.allowed).toBe(true);

    const r2 = checkRateLimit("b", config);
    expect(r2.allowed).toBe(true);

    const r3 = checkRateLimit("a", config);
    expect(r3.allowed).toBe(false);
  });

  it("resets store properly", () => {
    const config = { limit: 1, windowMs: 60000 };
    checkRateLimit("x", config);
    expect(checkRateLimit("x", config).allowed).toBe(false);

    resetRateLimitStore();
    expect(checkRateLimit("x", config).allowed).toBe(true);
  });
});
