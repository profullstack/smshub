import crypto from "crypto";
import type {
  SMSProvider,
  SendSMSParams,
  SendSMSResult,
  InboundMessage,
} from "./types";

export class TelnyxProvider implements SMSProvider {
  async send(params: Omit<SendSMSParams, "provider">): Promise<SendSMSResult> {
    const { to, from, body, credentials } = params;

    try {
      const response = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          text: body,
          type: "SMS",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.errors?.[0]?.detail || "Telnyx API error",
        };
      }

      return { success: true, messageId: data.data?.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  parseWebhook(body: Record<string, unknown>, _headers: Headers): InboundMessage {
    const data = body.data as Record<string, unknown> | undefined;
    const payload = data?.payload as Record<string, unknown> | undefined;
    const from = (payload?.from as Record<string, unknown>)?.phone_number;
    const toArr = payload?.to as Array<Record<string, unknown>> | undefined;
    const to = toArr?.[0]?.phone_number;

    return {
      from: String(from || ""),
      to: String(to || ""),
      body: String(payload?.text || ""),
      providerMessageId: String(data?.id || ""),
      provider: "telnyx",
    };
  }

  validateWebhook(rawBody: string, headers: Headers, _url: string): boolean {
    const signature = headers.get("telnyx-signature-ed25519");
    const timestamp = headers.get("telnyx-timestamp");
    const publicKey = process.env.TELNYX_PUBLIC_KEY;

    if (!signature || !timestamp || !publicKey) return false;

    try {
      const signedPayload = `${timestamp}|${rawBody}`;
      return crypto.verify(
        null,
        Buffer.from(signedPayload),
        {
          key: Buffer.from(publicKey, "base64"),
          format: "der",
          type: "spki",
        },
        Buffer.from(signature, "base64")
      );
    } catch {
      return false;
    }
  }
}
