import { describe, it, expect, vi } from "vitest";
import { withRetry, getBackoffDelay } from "../retry";

describe("retry", () => {
  describe("getBackoffDelay", () => {
    it("returns exponential delays", () => {
      expect(getBackoffDelay(0, 1000, 10000)).toBe(1000);
      expect(getBackoffDelay(1, 1000, 10000)).toBe(2000);
      expect(getBackoffDelay(2, 1000, 10000)).toBe(4000);
    });

    it("caps at maxDelayMs", () => {
      expect(getBackoffDelay(5, 1000, 10000)).toBe(10000);
    });
  });

  describe("withRetry", () => {
    it("returns success on first attempt", async () => {
      const fn = vi.fn().mockResolvedValue("ok");
      const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });

      expect(result.success).toBe(true);
      expect(result.data).toBe("ok");
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries on failure and succeeds", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail1"))
        .mockResolvedValue("ok");

      const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });

      expect(result.success).toBe(true);
      expect(result.data).toBe("ok");
      expect(result.attempts).toBe(2);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("returns failure after max attempts", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("always fails"));

      const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBe("always fails");
      expect(result.attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("uses default options", async () => {
      const fn = vi.fn().mockResolvedValue("ok");
      const result = await withRetry(fn);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
    });
  });
});
