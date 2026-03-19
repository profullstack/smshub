export type ProviderType = "twilio" | "telnyx" | "phonenumbers-bot";

export interface SendSMSParams {
  to: string;
  from: string;
  body: string;
  provider: ProviderType;
  credentials: ProviderCredentials;
  mediaUrl?: string;
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

export interface SendMMSParams {
  to: string;
  from: string;
  body: string;
  mediaUrl: string;
  credentials: ProviderCredentials;
}

export interface InboundMessage {
  from: string;
  to: string;
  body: string;
  providerMessageId: string;
  provider: ProviderType;
  mediaUrl?: string;
}

export interface SMSProvider {
  send(params: Omit<SendSMSParams, "provider">): Promise<SendSMSResult>;
  sendMMS?(params: SendMMSParams): Promise<SendSMSResult>;
  parseWebhook(body: Record<string, unknown>, headers: Headers): InboundMessage;
  validateWebhook(body: string, headers: Headers, url: string): boolean;
}
