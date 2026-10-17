/**
 * How long a CoinPay checkout quote stands. We ask CoinPay for this window with
 * `expires_in_minutes` on POST /api/payments/create (CoinPay accepts 15-120 and
 * defaulted to 15, which most buyers could not fund in time: 14 of 16 outside
 * checkouts expired with nothing sent). After it the pay page says "Payment
 * Expired". A deposit that lands later is still found by CoinPay's late-deposit
 * rescan and settled through the same webhook.
 */
export const CHECKOUT_WINDOW_MINUTES = 60;

/** Whether a checkout opened at `createdAt` can still be paid on its CoinPay page. */
export function checkoutWindowOpen(createdAt: string | Date, now: Date = new Date()): boolean {
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && now.getTime() < t + CHECKOUT_WINDOW_MINUTES * 60_000;
}
