import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/request-user";
import { overview } from "@/lib/managed-numbers/api";

/** Rented and bring-your-own numbers, open orders, price and plan limits. */
export async function GET(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  try {
    return NextResponse.json(await overview(createServiceClient(), who.user.userId, who.user.email));
  } catch (error) {
    console.error("numbers overview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
