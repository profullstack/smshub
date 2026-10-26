import { NextResponse, type NextRequest } from "next/server";
import { COLUMNS, validateProfile, saveSignupProfile } from "@profullstack/profile";
import { createServiceClient } from "@/lib/supabase/server";
import { profileStore } from "@/lib/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A just-created, still unconfirmed account may have its profile written once,
// without a session, for this long after signUp.
const FRESH_MS = 15 * 60 * 1000;

/**
 * POST /api/auth/signup-profile: the @profullstack/profile fields on /register.
 *
 * Without user_id: validate only (called before supabase.auth.signUp so a
 * missing name stops the signup). Returns { ok, profile } or 400 { errors }.
 *
 * With user_id (right after signUp, before the email is confirmed): store the
 * fields for that new account. Accepted only for an unconfirmed account created
 * in the last 15 minutes whose address matches and that has no profile yet, so
 * nobody can write someone else's profile. The same fields also ride in user
 * metadata and are saved on /auth/callback if this call never happens.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const input: Record<string, unknown> = Object.fromEntries(COLUMNS.map((c) => [c, body[c] ?? null]));
  const check = validateProfile(input);
  if (!check.ok) {
    return NextResponse.json(
      { error: Object.values(check.errors)[0] ?? "Some fields need fixing.", errors: check.errors },
      { status: 400 },
    );
  }

  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (!userId) return NextResponse.json({ ok: true, profile: check.profile });

  try {
    const admin = createServiceClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    const user = data?.user;
    const fresh = user && Date.now() - new Date(user.created_at).getTime() < FRESH_MS;
    if (
      error ||
      !user ||
      !fresh ||
      user.email_confirmed_at ||
      (user.email ?? "").toLowerCase() !== check.profile.email
    ) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    const store = profileStore();
    if (await store.get(user.id)) return NextResponse.json({ ok: true, saved: false });
    const saved = await saveSignupProfile(store, user.id, input, { email: user.email });
    return NextResponse.json({ ok: saved.ok, saved: saved.ok });
  } catch (e) {
    console.error("[signup-profile] save failed", e);
    return NextResponse.json({ error: "Could not save profile" }, { status: 500 });
  }
}
