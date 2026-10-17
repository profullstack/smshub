/**
 * How long a CoinPay checkout quote stands. CoinPay fixes it at 15 minutes for
 * every payment made through POST /api/payments/create (the route does not pass
 * a window through), so after this the pay page only says "Payment Expired".
 * A deposit that lands later is still found by CoinPay's late-deposit rescan and
 * settled through the same webhook.
 */
export const CHECKOUT_WINDOW_MINUTES = 15;

/** Whether a checkout opened at `createdAt` can still be paid on its CoinPay page. */
export function checkoutWindowOpen(createdAt: string | Date, now: Date = new Date()): boolean {
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && now.getTime() < t + CHECKOUT_WINDOW_MINUTES * 60_000;
}
