import crypto from "crypto";
import type {
  SMSProvider,
  SendSMSParams,
  SendSMSResult,
  SendMMSParams,
  InboundMessage,
} from "./types";

function getSignature(
  authToken: string,
  url: string,
  params: Record<string, string>
): string {
  const sortedKeys = Object.keys(params).sort();
  const data = url + sortedKeys.map((k) => k + params[k]).join("");
  return crypto.createHmac("sha1", authToken).update(data).digest("base64");
}

export class TwilioProvider implements SMSProvider {
  async send(params: Omit<SendSMSParams, "provider">): Promise<SendSMSResult> {
    const { to, from, body, credentials, mediaUrl } = params;
    const accountSid = credentials.apiKey;
    const authToken = credentials.apiSecret!;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const formParams: Record<string, string> = { To: to, From: from, Body: body };
    if (mediaUrl) {
      formParams.MediaUrl = mediaUrl;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(formParams).toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || "Twilio API error" };
      }

      return { success: true, messageId: data.sid };
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
    const mediaUrl = body.MediaUrl0 ? String(body.MediaUrl0) : undefined;
    return {
      from: String(body.From || ""),
      to: String(body.To || ""),
      body: String(body.Body || ""),
      providerMessageId: String(body.MessageSid || ""),
      provider: "twilio",
      mediaUrl,
    };
  }

  validateWebhook(rawBody: string, headers: Headers, url: string): boolean {
    const signature = headers.get("x-twilio-signature");
    if (!signature) return false;

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return false;

    const params: Record<string, string> = {};
    new URLSearchParams(rawBody).forEach((v, k) => {
      params[k] = v;
    });

    const expected = getSignature(authToken, url, params);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  }
}
