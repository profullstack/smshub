import crypto from "crypto";
import type {
  SMSProvider,
  SendSMSParams,
  SendSMSResult,
  SendMMSParams,
  InboundMessage,
} from "./types";
import { getSiteUrl } from "@/lib/site-url";

// DER header of an Ed25519 SubjectPublicKeyInfo; Telnyx's portal and
// GET /v2/public_key hand out the bare 32-byte key, which needs it prepended.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function telnyxPublicKey(base64Key: string): crypto.KeyObject {
  const raw = Buffer.from(base64Key, "base64");
  const der = raw.length === 32 ? Buffer.concat([ED25519_SPKI_PREFIX, raw]) : raw;
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
}

/**
 * Check a webhook against one Telnyx account's public key. Each Telnyx
 * account signs with its own key, so callers try the key of every provider
 * that could have sent the event (see telnyx-webhook-auth.ts).
 */
export function verifyTelnyxSignature(rawBody: string, headers: Headers, base64Key: string): boolean {
  const signature = headers.get("telnyx-signature-ed25519");
  const timestamp = headers.get("telnyx-timestamp");
  if (!signature || !timestamp || !base64Key) return false;

  try {
    return crypto.verify(
      null,
      Buffer.from(`${timestamp}|${rawBody}`),
      telnyxPublicKey(base64Key),
      Buffer.from(signature, "base64")
    );
  } catch {
    return false;
  }
}

export class TelnyxProvider implements SMSProvider {
  async send(params: Omit<SendSMSParams, "provider">): Promise<SendSMSResult> {
    const { to, from, body, credentials, mediaUrl } = params;

    const payload: Record<string, unknown> = {
      from,
      to,
      text: body,
      type: mediaUrl ? "MMS" : "SMS",
      // Delivery reports (message.sent / message.finalized) come back here even
      // when the sender's messaging profile has no webhook_url of its own.
      webhook_url: `${getSiteUrl()}/api/webhooks/telnyx`,
    };

    if (mediaUrl) {
      payload.media_urls = [mediaUrl];
    }

    try {
      const response = await fetch("https://api.telnyx.com/v2/messages", {
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
    const data = body.data as Record<string, unknown> | undefined;
    const payload = data?.payload as Record<string, unknown> | undefined;
    const from = (payload?.from as Record<string, unknown>)?.phone_number;
    const toArr = payload?.to as Array<Record<string, unknown>> | undefined;
    const to = toArr?.[0]?.phone_number;
    const mediaArr = payload?.media as Array<Record<string, unknown>> | undefined;
    const mediaUrl = mediaArr?.[0]?.url ? String(mediaArr[0].url) : undefined;

    return {
      from: String(from || ""),
      to: String(to || ""),
      body: String(payload?.text || ""),
      providerMessageId: String(data?.id || ""),
      provider: "telnyx",
      mediaUrl,
    };
  }

  validateWebhook(rawBody: string, headers: Headers, _url: string): boolean {
    const publicKey = process.env.TELNYX_PUBLIC_KEY;
    return !!publicKey && verifyTelnyxSignature(rawBody, headers, publicKey);
  }
}
