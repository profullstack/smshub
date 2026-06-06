export interface CoinPayConnectionSummary {
  email: string | null;
  name: string | null;
  updated_at: string;
}

export const COINPAY_PAYMENTS_SCRIPT_SRC = "https://coinpayportal.com/payments.js";

export function getEntitlements(coinpayConnection: CoinPayConnectionSummary | null) {
  const coinpayOAuthConfigured = Boolean(
    process.env.COINPAY_CLIENT_ID && process.env.COINPAY_CLIENT_SECRET
  );
  const coinpayMerchantId = process.env.COINPAY_MERCHANT_ID || null;
  const coinpayPaymentsConfigured = Boolean(coinpayMerchantId);

  return {
    features: {
      managedNumbers: {
        live: true,
        available: coinpayOAuthConfigured,
        plan: "$15/mo",
        marginPercent: 200,
        requiresUserProviderCredentials: false,
        providers: ["twilio", "telnyx", "phonenumbers-bot"],
      },
    },
    integrations: {
      coinpay: {
        oauth: {
          configured: coinpayOAuthConfigured,
          connected: Boolean(coinpayConnection),
          connection: coinpayConnection,
          connectUrl: "/api/coinpay/connect",
        },
        paymentsJs: {
          live: true,
          configured: coinpayPaymentsConfigured,
          scriptSrc: COINPAY_PAYMENTS_SCRIPT_SRC,
          merchantId: coinpayMerchantId,
          snippet: coinpayMerchantId
            ? `<script src="${COINPAY_PAYMENTS_SCRIPT_SRC}" data-merchant-id="${coinpayMerchantId}"></script>`
            : null,
        },
      },
      twilio: {
        managedNumbers: true,
        live: true,
        requiresUserCredentials: false,
      },
      telnyx: {
        managedNumbers: true,
        live: true,
        requiresUserCredentials: false,
      },
      "phonenumbers-bot": {
        managedNumbers: true,
        live: true,
        requiresUserCredentials: false,
      },
    },
  };
}
