import { describe, it, expect } from "vitest";
import { hashApiKey, generateApiKey } from "../../api-auth";

describe("hashApiKey", () => {
  it("returns a consistent SHA-256 hash", () => {
    const key = "smshub_testkey123";
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("different keys produce different hashes", () => {
    expect(hashApiKey("key1")).not.toBe(hashApiKey("key2"));
  });
});

describe("generateApiKey", () => {
  it("generates a key with smshub_ prefix", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^smshub_[a-f0-9]{64}$/);
  });

  it("generates unique keys", () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    expect(k1).not.toBe(k2);
  });
});
