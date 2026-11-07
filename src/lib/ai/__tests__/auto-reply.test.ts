import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("suggestReply", () => {
  const originalEnv = process.env;
  let suggestReply: typeof import("../auto-reply").suggestReply;

  beforeEach(async () => {
    process.env = { ...originalEnv, OPENAI_API_KEY: "test-key", C0MPUTE_API_KEY: "" };
    // A fresh router each test: a failure parks its provider.
    vi.resetModules();
    ({ suggestReply } = await import("../auto-reply"));
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

  describe("with a c0mpute key", () => {
    const message = [{ direction: "inbound" as const, body: "Hello", created_at: "2024-01-01T00:00:00Z" }];

    beforeEach(() => {
      process.env.C0MPUTE_API_KEY = "ik_live_test";
    });

    it("asks c0mpute first and never sends the phone number", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockImplementation((async (url: string) =>
        url.endsWith("/api/chat")
          ? Response.json({ jobId: "j", source: "p2p", model: "m" })
          : new Response(`event: done\ndata: ${JSON.stringify({ text: "<think>hm</think>On my way." })}\n\n`)) as typeof fetch);

      const result = await suggestReply({ messages: message, contactPhone: "+15551234567" });

      expect(result.suggestion).toBe("On my way.");
      const calls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(calls.every((url) => url.includes("infernetprotocol.com"))).toBe(true);
      expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("5551234567");
    });

    it("works on c0mpute alone", async () => {
      delete process.env.OPENAI_API_KEY;
      vi.spyOn(global, "fetch").mockImplementation((async (url: string) =>
        url.endsWith("/api/chat")
          ? Response.json({ jobId: "j", source: "p2p", model: "m" })
          : new Response(`event: done\ndata: ${JSON.stringify({ text: "Sure." })}\n\n`)) as typeof fetch);

      expect((await suggestReply({ messages: message })).suggestion).toBe("Sure.");
    });

    it("falls back to OpenAI, and a dead OpenAI still throws", async () => {
      vi.spyOn(global, "fetch").mockImplementation((async (url: string) =>
        url.includes("openai.com")
          ? new Response("Incorrect API key", { status: 401 })
          : new Response("{}", { status: 503 })) as typeof fetch);

      await expect(suggestReply({ messages: message })).rejects.toThrow("OpenAI API error: 401");
    });
  });
});
