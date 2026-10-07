import type { SupabaseClient } from "@supabase/supabase-js";
import type { Line } from "./contacts";
import { lineApiKey } from "./credentials";
import { configureVoice, type VoiceStatus } from "@/lib/voice/telnyx-voice";

export type LineVoice = VoiceStatus | { ok: false; state: "unsupported"; message: string };

/** Where calls to a line go, and with `apply` point them at the voice menu. */
export async function lineVoice(
  db: SupabaseClient,
  line: Line,
  options: { apply?: boolean; force?: boolean } = {}
): Promise<LineVoice> {
  if (line.provider_type !== "telnyx") {
    return { ok: false, state: "unsupported", message: "The voice menu needs a Telnyx number." };
  }
  const { data: provider } = await db.from("providers").select("type, api_key, metadata").eq("id", line.provider_id).maybeSingle();
  const apiKey = lineApiKey(provider, line.managed);
  if (!apiKey) return { ok: false, state: "unsupported", message: "No Telnyx API key for this number." };
  return configureVoice(apiKey, line.number, options);
}
