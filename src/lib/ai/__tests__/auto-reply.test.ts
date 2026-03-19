import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { suggestReply } from "../auto-reply";

describe("suggestReply", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws when OPENAI_API_KEY is not set", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      suggestReply({
        messages: [{ direction: "inbound", body: "Hello", created_at: "2024-01-01T00:00:00Z" }],
      })
    ).rejects.toThrow("OPENAI_API_KEY is not configured");
  });

  it("returns a suggestion on successful API call", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Thanks for reaching out!" } }],
      }),
    };

    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

    const result = await suggestReply({
      messages: [
        { direction: "inbound", body: "Hi there", created_at: "2024-01-01T00:00:00Z" },
        { direction: "outbound", body: "Hello!", created_at: "2024-01-01T00:01:00Z" },
        { direction: "inbound", body: "How are you?", created_at: "2024-01-01T00:02:00Z" },
      ],
      contactName: "John",
    });

    expect(result.suggestion).toBe("Thanks for reaching out!");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );
  });

  it("throws on API error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    } as Response);

    await expect(
      suggestReply({
        messages: [{ direction: "inbound", body: "Hello", created_at: "2024-01-01T00:00:00Z" }],
      })
    ).rejects.toThrow("OpenAI API error: 429");
  });

  it("throws when no suggestion generated", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    } as Response);

    await expect(
      suggestReply({
        messages: [{ direction: "inbound", body: "Hello", created_at: "2024-01-01T00:00:00Z" }],
      })
    ).rejects.toThrow("No suggestion generated");
  });
});
