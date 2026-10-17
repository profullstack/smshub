/**
 * CoinPay checkout: open a crypto payment for an order, and read + verify the
 * webhook CoinPay sends when it settles.
 *
 * The business api_key (cp_live_...) goes in Authorization: Bearer. The payee is
 * never sent: CoinPay resolves it from the business's own wallets, so the chain
 * offered must be one the business holds a wallet for.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Chains the smshub CoinPay business holds wallets for, cheapest first. */
export const CHECKOUT_CHAINS = [
  "USDC_POL",
  "USDC_SOL",
  "USDT_POL",
  "USDT_SOL",
  "USDC_ETH",
  "USDT_ETH",
  "POL",
  "SOL",
  "ETH",
  "BTC",
] as const;
export type CheckoutChain = (typeof CHECKOUT_CHAINS)[number];
export const DEFAULT_CHAIN: CheckoutChain = "USDC_POL";

/** An unknown or misspelled chain falls back to the default rather than reaching CoinPay. */
export function normalizeChain(chain: unknown): CheckoutChain {
  const c = String(chain ?? "").toUpperCase();
  return (CHECKOUT_CHAINS as readonly string[]).includes(c) ? (c as CheckoutChain) : DEFAULT_CHAIN;
}

/**
 * PayPal, through CoinPay's PayPal rail. The smshub business is connected with
 * Anthony's own PayPal REST app (self-serve mode), so the money lands in that
 * PayPal account and CoinPay takes no cut. Stored in number_orders.chain like a
 * coin so every listing, the CLI and the MCP need no new field.
 */
export const PAYPAL_METHOD = "PAYPAL" as const;

/** Everything the buyer can pick: the default coin, PayPal, then the other coins. */
export const CHECKOUT_METHODS = [DEFAULT_CHAIN, PAYPAL_METHOD, ...CHECKOUT_CHAINS.filter((c) => c !== DEFAULT_CHAIN)] as const;
export type CheckoutMethod = CheckoutChain | typeof PAYPAL_METHOD;

/** Like normalizeChain, but PayPal is also a valid answer. */
export function normalizeMethod(method: unknown): CheckoutMethod {
  const m = String(method ?? "").trim().toUpperCase();
  return m === PAYPAL_METHOD ? PAYPAL_METHOD : normalizeChain(m);
}

export interface CoinPayConfig {
  apiUrl: string;
  apiKey: string;
  businessId: string;
  webhookSecret: string;
}

export function coinpayConfig(env: NodeJS.ProcessEnv = process.env): CoinPayConfig | null {
  // Not COINPAY_X402_KEY: on prod that key belongs to a different CoinPay business, so a
  // checkout opened with it would never reach our webhook.
  const apiKey = env.COINPAY_API_KEY || "";
  const businessId = env.COINPAY_BUSINESS_ID || "";
  const webhookSecret = env.COINPAY_WEBHOOK_SECRET || "";
  // A merchant key, not an OAuth client id (cp_ + 24 hex), or checkout fails at Buy time.
  if (!/^cp_(live|test)_[0-9a-f]{16,}$/.test(apiKey) || !businessId || !webhookSecret) return null;
  let apiUrl = (env.COINPAY_API_URL || "https://coinpayportal.com").replace(/\/+$/, "");
  if (!apiUrl.endsWith("/api")) apiUrl += "/api";
  return { apiUrl, apiKey, businessId, webhookSecret };
}

// Client-safe (no node:crypto), so /numbers can count down the same window.
import { CHECKOUT_WINDOW_MINUTES } from "./window";
export { CHECKOUT_WINDOW_MINUTES, checkoutWindowOpen } from "./window";

export function payPageUrl(cfg: CoinPayConfig, paymentId: string): string {
  return `${cfg.apiUrl.replace(/\/api$/, "")}/pay/${paymentId}`;
}

export interface CreatedPayment {
  id: string;
  payUrl: string;
  address?: string;
  cryptoAmount?: string;
}

export class CoinPayError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function createPayment(
  cfg: CoinPayConfig,
  opts: {
    amountUsd: number;
    chain: CheckoutChain;
    description: string;
    metadata: Record<string, string>;
    redirectUrl?: string;
    /** "Back to smshub" on CoinPay's expired pay page. */
    cancelUrl?: string;
    idempotencyKey: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<CreatedPayment> {
  const res = await fetchImpl(`${cfg.apiUrl}/payments/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": opts.idempotencyKey,
    },
    body: JSON.stringify({
      business_id: cfg.businessId,
      amount: opts.amountUsd,
      currency: "USD",
      blockchain: opts.chain,
      description: opts.description,
      metadata: opts.metadata,
      redirect_url: opts.redirectUrl,
      cancel_url: opts.cancelUrl,
      expires_in_minutes: CHECKOUT_WINDOW_MINUTES,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    payment?: { id?: string; payment_address?: string; crypto_amount?: string | number };
  };
  const id = body.payment?.id;
  if (!res.ok || !id) {
    throw new CoinPayError(body.error || `CoinPay answered ${res.status}`, res.status);
  }
  return {
    id,
    payUrl: payPageUrl(cfg, id),
    address: body.payment?.payment_address,
    cryptoAmount: body.payment?.crypto_amount != null ? String(body.payment.crypto_amount) : undefined,
  };
}

/**
 * Open a PayPal order through CoinPay (POST /api/paypal/payments/create).
 * `amount` there is MAJOR units (dollars), unlike CoinPay's card rail.
 * The returned id is CoinPay's PayPal transaction id, which is also the
 * `payment_id` of the payment.confirmed webhook CoinPay sends on capture, so
 * settlement needs nothing PayPal-specific. The invoice number is the order id:
 * PayPal refuses a second order with the same invoice id, so a retry cannot
 * open two.
 */
export async function createPaypalPayment(
  cfg: CoinPayConfig,
  opts: {
    amountUsd: number;
    description: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
    invoiceNumber: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<CreatedPayment> {
  const res = await fetchImpl(`${cfg.apiUrl}/paypal/payments/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      business_id: cfg.businessId,
      amount: opts.amountUsd,
      currency: "USD",
      description: opts.description,
      metadata: opts.metadata,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      invoiceNumber: opts.invoiceNumber,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; transaction_id?: string };
  const id = body.transaction_id;
  if (!res.ok || !id) {
    throw new CoinPayError(body.error || `CoinPay PayPal answered ${res.status}`, res.status);
  }
  // Built from our own config rather than trusted from the response.
  return { id, payUrl: `${cfg.apiUrl.replace(/\/api$/, "")}/pay/paypal/${id}` };
}

/** Verify `X-CoinPay-Signature: t=<unix>,v1=<hex hmac-sha256 of "t.rawBody">`. */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300
): boolean {
  if (!header || !secret) return false;
  const parts: Record<string, string> = {};
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i > 0) parts[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  const ts = Number.parseInt(parts.t ?? "", 10);
  const sig = parts.v1;
  if (!Number.isFinite(ts) || !sig || !/^[0-9a-f]+$/i.test(sig)) return false;
  if (Math.abs(nowSec - ts) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest();
  const got = Buffer.from(sig, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function signWebhookBody(rawBody: string, secret: string, ts = Math.floor(Date.now() / 1000)): string {
  return `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex")}`;
}

/**
 * Statuses that mean the money arrived. Never `detected`, which fires before
 * confirmations. `forwarded` counts: a failed confirmed delivery is not retried
 * for long, a forwarded one is.
 */
const SETTLED = new Set(["confirmed", "forwarded", "paid", "completed", "succeeded", "settled"]);

export interface WebhookEvent {
  paymentId: string | null;
  status: string;
  settled: boolean;
  metadata: Record<string, unknown>;
}

/** CoinPay nests the payment under `data`; the top-level `id` is the EVENT id. */
export function readWebhook(payload: unknown): WebhookEvent {
  const p = (payload ?? {}) as Record<string, unknown>;
  const d = (p.data && typeof p.data === "object" ? p.data : p) as Record<string, unknown>;
  const paymentId = (d.payment_id ?? (p.data ? d.id : null) ?? null) as string | null;
  const status = String(d.status ?? "").toLowerCase();
  const metadata = ((d.metadata ?? p.metadata ?? {}) as Record<string, unknown>) || {};
  return { paymentId: paymentId ? String(paymentId) : null, status, settled: SETTLED.has(status), metadata };
}
