import { describe, it, expect, vi, beforeEach } from "vitest";
import { TelnyxProvider } from "../telnyx";

describe("TelnyxProvider", () => {
  let provider: TelnyxProvider;

  beforeEach(() => {
    provider = new TelnyxProvider();
    vi.restoreAllMocks();
  });

  describe("send", () => {
    it("sends SMS successfully", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: { id: "msg_123" } }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      const result = await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Hello!",
        credentials: { apiKey: "KEY_123" },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("msg_123");
    });

    it("sends correct JSON body", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: { id: "msg_456" } }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Test message",
        credentials: { apiKey: "KEY_ABC" },
      });

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body).toEqual({
        from: "+0987654321",
        to: "+1234567890",
        text: "Test message",
        type: "SMS",
      });
    });

    it("handles API errors", async () => {
      const mockResponse = {
        ok: false,
        json: async () => ({
          errors: [{ detail: "Invalid number format" }],
        }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      const result = await provider.send({
        to: "invalid",
        from: "+0987654321",
        body: "Hello!",
        credentials: { apiKey: "KEY_123" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid number format");
    });

    it("handles API errors without detail", async () => {
      const mockResponse = {
        ok: false,
        json: async () => ({}),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      const result = await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Hello!",
        credentials: { apiKey: "KEY_123" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Telnyx API error");
    });

    it("handles network errors", async () => {
      vi.spyOn(global, "fetch").mockRejectedValue(new Error("Connection refused"));

      const result = await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Hello!",
        credentials: { apiKey: "KEY_123" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Connection refused");
    });

    it("uses bearer auth", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: { id: "msg_789" } }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Test",
        credentials: { apiKey: "MY_KEY" },
      });

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer MY_KEY");
    });
  });

  describe("parseWebhook", () => {
    it("parses Telnyx webhook payload", () => {
      const body = {
        data: {
          id: "msg_telnyx_123",
          event_type: "message.received",
          payload: {
            from: { phone_number: "+1234567890" },
            to: [{ phone_number: "+0987654321" }],
            text: "Hello from Telnyx!",
          },
        },
      };

      const result = provider.parseWebhook(body, new Headers());

      expect(result.from).toBe("+1234567890");
      expect(result.to).toBe("+0987654321");
      expect(result.body).toBe("Hello from Telnyx!");
      expect(result.providerMessageId).toBe("msg_telnyx_123");
      expect(result.provider).toBe("telnyx");
    });

    it("handles missing fields gracefully", () => {
      const result = provider.parseWebhook({}, new Headers());

      expect(result.from).toBe("");
      expect(result.to).toBe("");
      expect(result.body).toBe("");
      expect(result.providerMessageId).toBe("");
    });
  });

  describe("validateWebhook", () => {
    it("returns false when signature header is missing", () => {
      const result = provider.validateWebhook("{}", new Headers(), "");
      expect(result).toBe(false);
    });

    it("returns false when public key is not set", () => {
      delete process.env.TELNYX_PUBLIC_KEY;
      const headers = new Headers({
        "telnyx-signature-ed25519": "abc",
        "telnyx-timestamp": "12345",
      });
      const result = provider.validateWebhook("{}", headers, "");
      expect(result).toBe(false);
    });
  });
});
