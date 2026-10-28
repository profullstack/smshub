import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { createServiceClient } from "@/lib/supabase/server";
import { lockVault, vaultStatus } from "@/lib/vault/service";

export const runtime = "nodejs";

/** Forget the unlocked data key now. Sends that need provider keys fail as "locked" until the next unlock. */
export async function POST(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  lockVault(who.user.userId);
  return NextResponse.json(await vaultStatus(createServiceClient(), who.user.userId));
}
