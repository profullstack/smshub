import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { createServiceClient } from "@/lib/supabase/server";
import { migrateLegacyProviders, vaultStatus, VaultError } from "@/lib/vault/service";

export const runtime = "nodejs";

/** Seal this user's legacy plaintext provider keys under their unlocked vault (one shot, idempotent). */
export async function POST(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  try {
    const db = createServiceClient();
    const result = await migrateLegacyProviders(db, who.user.userId);
    return NextResponse.json({ ...result, vault: await vaultStatus(db, who.user.userId) });
  } catch (e) {
    if (e instanceof VaultError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("vault migrate error:", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
