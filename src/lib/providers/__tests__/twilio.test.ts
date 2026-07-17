import { describe, it, expect, vi, beforeEach } from "vitest";
import { TwilioProvider } from "../twilio";

describe("TwilioProvider", () => {
  let provider: TwilioProvider;

  beforeEach(() => {
    provider = new TwilioProvider();
    vi.restoreAllMocks();
  });

  describe("send", () => {
    it("sends SMS successfully", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ sid: "SM123456" }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      const result = await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Hello!",
        credentials: { apiKey: "ACXXX", apiSecret: "auth_token_123" },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("SM123456");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("api.twilio.com"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("handles API errors", async () => {
      const mockResponse = {
        ok: false,
        json: async () => ({ message: "Invalid phone number" }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      const result = await provider.send({
        to: "invalid",
        from: "+0987654321",
        body: "Hello!",
        credentials: { apiKey: "ACXXX", apiSecret: "auth_token_123" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid phone number");
    });

    it("handles network errors", async () => {
      vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

      const result = await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Hello!",
        credentials: { apiKey: "ACXXX", apiSecret: "auth_token_123" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("sends with MediaUrl for MMS", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ sid: "SM_MMS" }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      const result = await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Check this!",
        credentials: { apiKey: "ACXXX", apiSecret: "auth_token_123" },
        mediaUrl: "https://example.com/image.jpg",
      });

      expect(result.success).toBe(true);
      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = (callArgs[1] as RequestInit).body as string;
      expect(body).toContain("MediaUrl=");
    });

    it("sends correct authorization header", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ sid: "SM123" }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      await provider.send({
        to: "+1234567890",
        from: "+0987654321",
        body: "Test",
        credentials: { apiKey: "ACTEST", apiSecret: "secret123" },
      });

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
      const expectedAuth = "Basic " + Buffer.from("ACTEST:secret123").toString("base64");
      expect(headers.Authorization).toBe(expectedAuth);
    });
  });

  describe("parseWebhook", () => {
    it("parses Twilio webhook payload", () => {
      const body = {
        From: "+1234567890",
        To: "+0987654321",
        Body: "Hello from Twilio!",
        MessageSid: "SM12345678",
      };

      const result = provider.parseWebhook(body, new Headers());

      expect(result.from).toBe("+1234567890");
      expect(result.to).toBe("+0987654321");
      expect(result.body).toBe("Hello from Twilio!");
      expect(result.providerMessageId).toBe("SM12345678");
      expect(result.provider).toBe("twilio");
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
      const result = provider.validateWebhook("Body=test", new Headers(), "https://example.com");
      expect(result).toBe(false);
    });

    it("returns false when auth token is not set", () => {
      delete process.env.TWILIO_AUTH_TOKEN;
      const headers = new Headers({ "x-twilio-signature": "abc123" });
      const result = provider.validateWebhook("Body=test", headers, "https://example.com");
      expect(result).toBe(false);
    });

    it("returns false for a malformed signature length", () => {
      process.env.TWILIO_AUTH_TOKEN = "auth_token_123";
      const headers = new Headers({ "x-twilio-signature": "invalid" });

      const result = provider.validateWebhook(
        "Body=test",
        headers,
        "https://example.com"
      );

      expect(result).toBe(false);
    });
  });
});
