import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { createServiceClient } from "@/lib/supabase/server";
import { createVaultRecord, resetVault, updateVaultRecord, vaultStatus, VaultError } from "@/lib/vault/service";
import { decodeDek } from "@/lib/vault/server-seal";

export const runtime = "nodejs";

function fail(e: unknown) {
  if (e instanceof VaultError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("vault error:", e instanceof Error ? e.name : "unknown");
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** Vault state: no_vault | locked | unlocked, the public seal record, and provider counts. */
export async function GET(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  try {
    return NextResponse.json(await vaultStatus(createServiceClient(), who.user.userId));
  } catch (e) {
    return fail(e);
  }
}

/** Create the vault: { seal }. Replace the passphrase wrap: { seal, dek } with the current data key. */
export async function POST(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  try {
    const body = (await request.json().catch(() => ({}))) as { seal?: unknown; dek?: unknown };
    const db = createServiceClient();
    if (body.dek !== undefined) {
      const dek = decodeDek(body.dek);
      if (!dek) return NextResponse.json({ error: "Invalid key" }, { status: 400 });
      try {
        await updateVaultRecord(db, who.user.userId, body.seal, dek);
      } finally {
        dek.fill(0);
      }
    } else {
      await createVaultRecord(db, who.user.userId, body.seal);
    }
    return NextResponse.json(await vaultStatus(db, who.user.userId));
  } catch (e) {
    return fail(e);
  }
}

/** Lost passphrase AND recovery key: delete the vault. Sealed provider keys are gone and must be re-entered. */
export async function DELETE(request: Request) {
  const who = await resolveUser(request, { allowSession: true });
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  if (who.user.via !== "session") return NextResponse.json({ error: "Reset the vault from the web app" }, { status: 403 });
  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "forget-my-keys") {
    return NextResponse.json({ error: "Pass ?confirm=forget-my-keys: your sealed provider keys cannot be recovered" }, { status: 400 });
  }
  try {
    const db = createServiceClient();
    await resetVault(db, who.user.userId);
    return NextResponse.json(await vaultStatus(db, who.user.userId));
  } catch (e) {
    return fail(e);
  }
}
