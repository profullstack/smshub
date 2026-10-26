import {
  COLUMNS,
  createProfileStore,
  validateProfile,
  type ProfileStore,
} from "@profullstack/profile";
import { createServiceClient } from "@/lib/supabase/server";

// The shared @profullstack/profile fields live in public.user_profiles
// (keyed by auth.users.id). Server-only: RLS has no anon/authenticated
// policies, so this always runs on the service-role client.
let cached: ProfileStore | null = null;

export function profileStore(): ProfileStore {
  cached ??= createProfileStore(createServiceClient(), { table: "user_profiles", key: "user_id" });
  return cached;
}

type Metadata = Record<string, unknown> | null | undefined;

// /register passes the validated fields to supabase.auth.signUp as user
// metadata. When the confirmation link is opened (/auth/callback) they are
// stored here if the person has no profile row yet, so later edits through
// /api/v1/me/profile always win. A failed save never blocks sign-in.
export async function saveProfileFromMetadata(
  user: { id: string; email?: string | null; user_metadata?: Metadata },
  store?: Pick<ProfileStore, "get" | "save">,
): Promise<boolean> {
  const meta = user.user_metadata ?? {};
  if (!meta.first_name && !meta.last_name) return false;
  const input: Record<string, unknown> = Object.fromEntries(COLUMNS.map((c) => [c, meta[c] ?? null]));
  input.email = user.email ?? null;
  const check = validateProfile(input);
  if (!check.ok) return false;
  try {
    const s = store ?? profileStore();
    if (await s.get(user.id)) return false;
    await s.save(user.id, check.profile);
    return true;
  } catch (e) {
    console.error("[profile] save from signup metadata failed", e);
    return false;
  }
}
