import { TwilioProvider } from "./twilio";
import { TelnyxProvider } from "./telnyx";
import type {
  SendSMSParams,
  SendSMSResult,
  SMSProvider,
  InboundMessage,
} from "./types";

const providers: Record<string, SMSProvider> = {
  twilio: new TwilioProvider(),
  telnyx: new TelnyxProvider(),
};

export function getProvider(name: string): SMSProvider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown SMS provider: ${name}`);
  }
  return provider;
}

export async function sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
  const provider = getProvider(params.provider);
  return provider.send(params);
}

export function parseWebhook(
  providerName: string,
  body: Record<string, unknown>,
  headers: Headers
): InboundMessage {
  const provider = getProvider(providerName);
  return provider.parseWebhook(body, headers);
}

export function validateWebhook(
  providerName: string,
  rawBody: string,
  headers: Headers,
  url: string
): boolean {
  const provider = getProvider(providerName);
  return provider.validateWebhook(rawBody, headers, url);
}

export type { SendSMSParams, SendSMSResult, SMSProvider, InboundMessage };
