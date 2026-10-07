import { CHECKOUT_CHAINS, coinpayConfig } from "@/lib/coinpay/checkout";
import { PLANS, priceUsdPerMonth } from "@/lib/plans";
import { managedMode } from "@/lib/telnyx/numbers";

export interface CoinPayConnectionSummary {
  email: string | null;
  name: string | null;
  updated_at: string;
}

/** What this deployment actually offers. Nothing here claims more than the code does. */
export function getEntitlements(
  coinpayConnection: CoinPayConnectionSummary | null,
  env: NodeJS.ProcessEnv = process.env
) {
  const coinpayOAuthConfigured = Boolean(env.COINPAY_CLIENT_ID && env.COINPAY_CLIENT_SECRET);
  const mode = managedMode(env);

  return {
    plans: PLANS,
    features: {
      managedNumbers: {
        live: mode === "live",
        mode,
        usdPerMonth: priceUsdPerMonth(env),
        checkout: "coinpay",
        chains: CHECKOUT_CHAINS,
        provider: "telnyx",
        receiveOnly: true,
        requiresUserProviderCredentials: false,
        url: "/numbers",
      },
    },
    integrations: {
      coinpay: {
        checkout: { configured: Boolean(coinpayConfig(env)) },
        oauth: {
          configured: coinpayOAuthConfigured,
          connected: Boolean(coinpayConnection),
          connection: coinpayConnection,
          connectUrl: "/api/coinpay/connect",
        },
      },
      twilio: { bringYourOwn: true },
      telnyx: { bringYourOwn: true },
      "phonenumbers-bot": { bringYourOwn: true },
    },
  };
}
