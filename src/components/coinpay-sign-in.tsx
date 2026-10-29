/**
 * "Sign in with CoinPay": CoinPay is the fleet's master account, so it is
 * offered first. A plain link (the route does the OAuth work), absolute to
 * smshub.dev because the CoinPay client's redirect URI lives there.
 */
export function CoinpaySignInButton({ next, label = "Sign in with CoinPay" }: { next: string; label?: string }) {
  const href = `/api/coinpay/login?next=${encodeURIComponent(next)}`;
  return (
    <div className="space-y-2">
      <a
        href={href}
        className="block w-full py-2 px-4 text-center bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors"
      >
        {label}
      </a>
      <p className="text-center text-xs text-gray-500">or use your email and password</p>
    </div>
  );
}

const COINPAY_ERRORS: Record<string, string> = {
  coinpay_bad_state: "That CoinPay sign-in didn't start in this browser. Try again.",
  coinpay_expired: "That CoinPay sign-in expired or was already used. Try again.",
  coinpay_wrong_session: "Sign in to the account you want to connect, then try again.",
  coinpay_cancelled: "CoinPay sign-in was cancelled.",
  coinpay_token_exchange: "CoinPay sign-in couldn't be completed. Try again.",
  coinpay_session: "Couldn't start your session after CoinPay. Try again.",
  coinpay_off: "Sign in with CoinPay is not available right now.",
};

export function coinpayLoginError(code: string | null): string | null {
  return code ? (COINPAY_ERRORS[code] ?? null) : null;
}
