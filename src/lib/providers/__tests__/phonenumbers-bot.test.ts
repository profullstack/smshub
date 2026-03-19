import { describe, it, expect, vi, beforeEach } from "vitest";
import { PhoneNumbersBotProvider } from "../phonenumbers-bot";

describe("PhoneNumbersBotProvider", () => {
  let provider: PhoneNumbersBotProvider;

  beforeEach(() => {
    provider = new PhoneNumbersBotProvider();
    vi.restoreAllMocks();
  });

  describe("send", () => {
    it("sends SMS successfully", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: "msg_123" }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      const result = await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Hello!",
        credentials: { apiKey: "pnb_key_123" },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("msg_123");
      expect(fetch).toHaveBeenCalledWith(
        "https://api.phonenumbers.bot/v1/messages",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer pnb_key_123",
          }),
        })
      );
    });

    it("sends with mediaUrl for MMS", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: "msg_456" }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Check this out",
        credentials: { apiKey: "key" },
        mediaUrl: "https://example.com/image.jpg",
      });

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(requestBody.media_url).toBe("https://example.com/image.jpg");
    });

    it("handles API errors", async () => {
      const mockResponse = {
        ok: false,
        json: async () => ({ error: "Invalid credentials" }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      const result = await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Hello!",
        credentials: { apiKey: "bad_key" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });

    it("handles network errors", async () => {
      vi.spyOn(global, "fetch").mockRejectedValue(new Error("Connection refused"));

      const result = await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Hello!",
        credentials: { apiKey: "key" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Connection refused");
    });
  });

  describe("sendMMS", () => {
    it("delegates to send with mediaUrl", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: "mms_123" }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      const result = await provider.sendMMS({
        to: "+1234567890",
        from: "+0987654321",
        body: "MMS test",
        mediaUrl: "https://example.com/photo.jpg",
        credentials: { apiKey: "key" },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("parseWebhook", () => {
    it("parses webhook payload", () => {
      const body = {
        data: {
          from: "+1234567890",
          to: "+0987654321",
          body: "Incoming!",
          id: "msg_789",
          media_url: "https://example.com/img.jpg",
        },
      };

      const result = provider.parseWebhook(body, new Headers());

      expect(result.from).toBe("+1234567890");
      expect(result.to).toBe("+0987654321");
      expect(result.body).toBe("Incoming!");
      expect(result.providerMessageId).toBe("msg_789");
      expect(result.provider).toBe("phonenumbers-bot");
      expect(result.mediaUrl).toBe("https://example.com/img.jpg");
    });

    it("handles flat payload format", () => {
      const body = {
        from: "+1111111111",
        to: "+2222222222",
        text: "Hello",
        message_id: "abc",
      };

      const result = provider.parseWebhook(body, new Headers());

      expect(result.from).toBe("+1111111111");
      expect(result.body).toBe("Hello");
      expect(result.providerMessageId).toBe("abc");
    });
  });

  describe("validateWebhook", () => {
    it("returns false without signature header", () => {
      const result = provider.validateWebhook("{}", new Headers(), "");
      expect(result).toBe(false);
    });

    it("returns false without webhook secret env var", () => {
      delete process.env.PHONENUMBERS_BOT_WEBHOOK_SECRET;
      const headers = new Headers({ "x-pnb-signature": "abc" });
      const result = provider.validateWebhook("{}", headers, "");
      expect(result).toBe(false);
    });
  });
});
