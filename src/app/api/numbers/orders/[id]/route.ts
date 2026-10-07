import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/request-user";
import { getOrder } from "@/lib/managed-numbers/api";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await params;
  const order = await getOrder(createServiceClient(), who.user.userId, id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order });
}
