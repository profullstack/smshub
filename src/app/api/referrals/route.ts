import { createReferralsRouteHandler } from "@profullstack/stack/referrals";
import { referralStore } from "@/lib/referrals";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getUserId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export const { GET, POST } = createReferralsRouteHandler({
  store: referralStore,
  getUserId,
});
