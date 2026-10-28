import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { createServiceClient } from "@/lib/supabase/server";
import { unlockVault, vaultStatus, VaultError } from "@/lib/vault/service";
import { decodeDek } from "@/lib/vault/server-seal";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Unlock a sending session: { dek: base64 data key, ttl_seconds }. The browser or
 * CLI derives the data key from the passphrase; the passphrase never comes here.
 * The key is kept in this process's memory only, until the TTL ends, Lock, or a restart.
 */
export async function POST(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const rl = checkRateLimit(`vault-unlock:${who.user.userId}`, { limit: 20, windowMs: 15 * 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many unlock attempts" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { dek?: unknown; ttl_seconds?: unknown };
  const dek = decodeDek(body.dek);
  if (!dek) return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  try {
    const db = createServiceClient();
    await unlockVault(db, who.user.userId, dek, typeof body.ttl_seconds === "number" ? body.ttl_seconds : Number(body.ttl_seconds) || undefined);
    return NextResponse.json(await vaultStatus(db, who.user.userId));
  } catch (e) {
    if (e instanceof VaultError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("vault unlock error:", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    dek.fill(0);
  }
}
