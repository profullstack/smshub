import type { SupabaseClient } from "@supabase/supabase-js";

const STOP_WORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*[.!]?\s*$/i;

/** A STOP from an alert phone ends alerts to it until its owner consents again. */
export async function noteAlertOptOut(db: SupabaseClient, from: string, body: string, now = new Date().toISOString()) {
  if (!from || !STOP_WORDS.test(body ?? "")) return false;
  await db.from("alert_settings").update({ consent: false, opted_out_at: now, updated_at: now }).eq("phone", from);
  return true;
}
