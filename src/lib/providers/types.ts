export interface SendSMSParams {
  to: string;
  from: string;
  body: string;
  provider: "twilio" | "telnyx";
  credentials: ProviderCredentials;
}

export interface ProviderCredentials {
  apiKey: string;
  apiSecret?: string | null;
}

export interface SendSMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface InboundMessage {
  from: string;
  to: string;
  body: string;
  providerMessageId: string;
  provider: "twilio" | "telnyx";
}

export interface SMSProvider {
  send(params: Omit<SendSMSParams, "provider">): Promise<SendSMSResult>;
  parseWebhook(body: Record<string, unknown>, headers: Headers): InboundMessage;
  validateWebhook(body: string, headers: Headers, url: string): boolean;
}
