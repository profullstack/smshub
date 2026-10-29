import { NextResponse } from "next/server";
import { getEntitlements } from "@/lib/entitlements";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isPlaceholderEmail } from "@/lib/coinpay/signin";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("coinpay_connections")
    .select("email, name, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const entitlements = getEntitlements(data);

  return NextResponse.json({
    connected: Boolean(data),
    connection: data,
    // An account a CoinPay login made has no other way in, so it cannot disconnect.
    canDisconnect: Boolean(data) && !isPlaceholderEmail(user.email),
    configured: entitlements.integrations.coinpay.oauth.configured,
  });
}
