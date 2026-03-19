import type {
  SMSProvider,
  SendSMSParams,
  SendSMSResult,
  SendMMSParams,
  InboundMessage,
} from "./types";

const API_BASE = "https://api.phonenumbers.bot/v1";

export class PhoneNumbersBotProvider implements SMSProvider {
  async send(params: Omit<SendSMSParams, "provider">): Promise<SendSMSResult> {
    const { to, from, body, credentials, mediaUrl } = params;

    const payload: Record<string, unknown> = {
      to,
      from,
      body,
    };

    if (mediaUrl) {
      payload.media_url = mediaUrl;
    }

    try {
      const response = await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || data.message || "phonenumbers.bot API error",
        };
      }

      return { success: true, messageId: data.id || data.message_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendMMS(params: SendMMSParams): Promise<SendSMSResult> {
    return this.send({
      to: params.to,
      from: params.from,
      body: params.body,
      credentials: params.credentials,
      mediaUrl: params.mediaUrl,
    });
  }

  parseWebhook(body: Record<string, unknown>, _headers: Headers): InboundMessage {
    const data = (body.data as Record<string, unknown>) || body;
    return {
      from: String(data.from || ""),
      to: String(data.to || ""),
      body: String(data.body || data.text || ""),
      providerMessageId: String(data.id || data.message_id || ""),
      provider: "phonenumbers-bot",
      mediaUrl: data.media_url ? String(data.media_url) : undefined,
    };
  }

  validateWebhook(rawBody: string, headers: Headers, _url: string): boolean {
    const signature = headers.get("x-pnb-signature");
    const secret = process.env.PHONENUMBERS_BOT_WEBHOOK_SECRET;

    if (!signature || !secret) return false;

    try {
      const crypto = require("crypto");
      const expected = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  }
}
