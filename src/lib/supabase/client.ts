import { createBrowserSupabase } from "@profullstack/stack/supabase";

export function createClient() {
  return createBrowserSupabase();
}
