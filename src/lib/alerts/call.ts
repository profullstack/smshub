/**
 * The alert call placed by sendAlert, driven by the same Call Control
 * webhook as the voice menu. client_state carries al = alert id, m = the
 * call's log message, h = 1 once the alert is being read (hang up after it).
 *
 *   call.answered     read the alert twice
 *   call.speak.ended  hang up (the shared h = 1 rule in ivr.ts)
 *   call.hangup       note answered / not answered on the log entry
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { encodeState, type CallCommand } from "@/lib/voice/telnyx-voice";
import { callLength, type CallEvent, type CallState } from "@/lib/voice/ivr";

const VOICE = { voice: "female", language: "en-US" };

/** What the call says: the alert, then once more, then goodbye. */
export function alertSpeech(message: string): string {
  const text = message.replace(/[^\p{L}\p{N}\s'.,:;!?%$@#&()+=\/-]/gu, " ").replace(/\s+/g, " ").trim();
  const said = /[.!?]$/.test(text) ? text : `${text}.`;
  return `This is an alert from SMS Hub. ${said} Again: ${said} Goodbye.`;
}

export async function handleAlertCall(
  deps: { db: SupabaseClient; command: CallCommand },
  event: CallEvent,
  state: CallState & { al: string }
): Promise<string> {
  const { db, command } = deps;
  const p = event.payload;
  const callId = String(p.call_control_id ?? "");

  switch (event.event_type) {
    case "call.answered": {
      const { data: alert } = await db.from("alerts").select("message").eq("id", state.al).maybeSingle();
      if (!alert) {
        await command(callId, "hangup", {});
        return "alert gone";
      }
      await command(callId, "speak", {
        payload: alertSpeech(String((alert as { message: string }).message)),
        ...VOICE,
        client_state: encodeState({ ...state, h: 1 }),
      });
      return "alert read";
    }

    case "call.hangup": {
      if (!state.m) return "ignored: no log entry";
      const { data: msg } = await db.from("messages").select("body").eq("id", state.m).maybeSingle();
      if (!msg) return "no log entry";
      const length = callLength(p);
      const cause = String(p.hangup_cause ?? "");
      // h is set from the moment the alert started playing, so the call was answered.
      const answered = Boolean(state.h) || (length !== null && cause === "normal_clearing");
      const text = String((msg as { body: string }).body).replace(/^Alert call[^:]*: /, "");
      const body = answered
        ? `Alert call answered${length ? ` (${length})` : ""}: ${text}`
        : `Alert call not answered${cause ? ` (${cause.replace(/_/g, " ")})` : ""}: ${text}`;
      await db
        .from("messages")
        .update({ body, status: answered ? "delivered" : "failed", status_updated_at: new Date().toISOString() })
        .eq("id", state.m);
      return answered ? "alert answered" : "alert not answered";
    }

    default:
      return `ignored: ${event.event_type}`;
  }
}
