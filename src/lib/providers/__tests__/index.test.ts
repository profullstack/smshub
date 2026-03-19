import { describe, it, expect, vi } from "vitest";
import { getProvider, sendSMS, parseWebhook } from "../index";
import { TwilioProvider } from "../twilio";
import { TelnyxProvider } from "../telnyx";
import { PhoneNumbersBotProvider } from "../phonenumbers-bot";

describe("Provider index", () => {
  describe("getProvider", () => {
    it("returns TwilioProvider for twilio", () => {
      const provider = getProvider("twilio");
      expect(provider).toBeInstanceOf(TwilioProvider);
    });

    it("returns TelnyxProvider for telnyx", () => {
      const provider = getProvider("telnyx");
      expect(provider).toBeInstanceOf(TelnyxProvider);
    });

    it("returns PhoneNumbersBotProvider for phonenumbers-bot", () => {
      const provider = getProvider("phonenumbers-bot");
      expect(provider).toBeInstanceOf(PhoneNumbersBotProvider);
    });

    it("throws for unknown provider", () => {
      expect(() => getProvider("unknown")).toThrow("Unknown SMS provider: unknown");
    });
  });

  describe("sendSMS", () => {
    it("routes to correct provider", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ sid: "SM123" }),
      };
      vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

      const result = await sendSMS({
        to: "+1234567890",
        from: "+0987654321",
        body: "Test",
        provider: "twilio",
        credentials: { apiKey: "ACXXX", apiSecret: "token" },
      });

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("twilio.com"),
        expect.anything()
      );
    });
  });

  describe("parseWebhook", () => {
    it("parses twilio webhook", () => {
      const body = {
        From: "+1234567890",
        To: "+0987654321",
        Body: "Hello",
        MessageSid: "SM999",
      };

      const result = parseWebhook("twilio", body, new Headers());
      expect(result.provider).toBe("twilio");
      expect(result.body).toBe("Hello");
    });

    it("parses telnyx webhook", () => {
      const body = {
        data: {
          id: "msg_999",
          payload: {
            from: { phone_number: "+111" },
            to: [{ phone_number: "+222" }],
            text: "Hi",
          },
        },
      };

      const result = parseWebhook("telnyx", body, new Headers());
      expect(result.provider).toBe("telnyx");
      expect(result.body).toBe("Hi");
    });
  });
});
