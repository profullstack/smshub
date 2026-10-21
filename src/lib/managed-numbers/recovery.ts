/**
 * Client-safe: which unpaid order to offer to finish. The newest order wins; if
 * it expired unpaid (or its window closed) within the last week, and nothing
 * newer is paid, active or still payable, it is the one to reopen.
 */
import { checkoutWindowOpen } from "@/lib/coinpay/window";

export interface RecoverableOrder {
  id: string;
  kind: "new" | "renew";
  status: string;
  area_code: string | null;
  months: number;
  amount_usd: number | string;
  chain: string;
  error?: string | null;
  created_at: string;
}

export const RECOVERY_DAYS = 7;

export function unfinishedOrder<T extends RecoverableOrder>(orders: T[], now: Date = new Date()): T | null {
  const sorted = [...orders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const latest = sorted[0];
  if (!latest) return null;
  if (now.getTime() - new Date(latest.created_at).getTime() > RECOVERY_DAYS * 86400_000) return null;
  const dead =
    latest.status === "expired" ||
    (latest.status === "pending" && !checkoutWindowOpen(latest.created_at, now)) ||
    (latest.status === "failed" && String(latest.error ?? "").startsWith("checkout:"));
  return dead ? latest : null;
}

/** Only ever send the browser to CoinPay's own pages. */
export function safePayUrl(raw: unknown): string | null {
  try {
    const u = new URL(String(raw));
    return u.protocol === "https:" &&
      u.hostname === "coinpayportal.com" &&
      (u.pathname.startsWith("/pay/") || u.pathname.startsWith("/checkout/"))
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
