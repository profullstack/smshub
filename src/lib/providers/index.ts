import { TwilioProvider } from "./twilio";
import { TelnyxProvider } from "./telnyx";
import { PhoneNumbersBotProvider } from "./phonenumbers-bot";
import { toE164 } from "./phone";
import type {
  SendSMSParams,
  SendSMSResult,
  SMSProvider,
  InboundMessage,
  ProviderType,
} from "./types";

const providers: Record<string, SMSProvider> = {
  twilio: new TwilioProvider(),
  telnyx: new TelnyxProvider(),
  "phonenumbers-bot": new PhoneNumbersBotProvider(),
};

export function getProvider(name: string): SMSProvider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown SMS provider: ${name}`);
  }
  return provider;
}

/** Credentials on the per-user provider row that holds rented (managed) numbers. */
export const MANAGED_API_KEY = "__managed__";

export async function sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
  // Rented numbers are receive-only: plain SMS from our unregistered (non-10DLC)
  // numbers is refused by US carriers anyway.
  if (params.credentials.apiKey === MANAGED_API_KEY) {
    return {
      success: false,
      error: "Rented numbers receive texts only. Sending needs your own Twilio or Telnyx number.",
    };
  }
  const provider = getProvider(params.provider);
  const to = toE164(params.to);
  if (!to) {
    return {
      success: false,
      error: `Invalid recipient "${params.to}": use one phone number per message, e.g. +14155551234`,
    };
  }
  const from = toE164(params.from) ?? params.from;
  return provider.send({ ...params, to, from });
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

export { toE164 } from "./phone";
export type { SendSMSParams, SendSMSResult, SMSProvider, InboundMessage, ProviderType };
