import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { disconnectCoinpay, supabaseCoinpayStore } from "@/lib/coinpay/signin";

export const dynamic = "force-dynamic";

/**
 * POST /api/coinpay/disconnect: Settings' Disconnect CoinPay. Refused when
 * CoinPay is the only way into the account (its auth email is a placeholder).
 * JSON in, JSON out.
 */
export async function POST(request: NextRequest) {
  // Same-host form posts only (brand hosts post to themselves).
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(getSiteUrl()).host;
  const origin = request.headers.get("origin");
  if (origin && !sameHost(origin, host)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await disconnectCoinpay(user.id, user.email ?? null, supabaseCoinpayStore(createServiceClient()));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}

function sameHost(origin: string, host: string): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
