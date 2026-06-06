import { NextResponse } from "next/server";
import { getEntitlements } from "@/lib/entitlements";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let coinpayConnection = null;

  if (user) {
    const { data, error } = await supabase
      .from("coinpay_connections")
      .select("email, name, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    coinpayConnection = data;
  }

  return NextResponse.json(getEntitlements(coinpayConnection));
}
