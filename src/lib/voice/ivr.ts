/**
 * The voice menu on a line, driven by Telnyx Call Control webhooks:
 *
 *   call.initiated (incoming)  log the call in the caller's thread, answer
 *   call.answered              "Press 1 for Kim. Press 2 for Mike."
 *   call.gather.ended          transfer to that contact's cell, or ask again
 *   call.hangup                note the outcome and length on the log entry
 *
 * The menu is read from the line's contacts book on every call, so editing a
 * contact changes the next call with nothing else to set up. All call state
 * rides in Telnyx's client_state: l = line id, m = log message id, a = retry
 * count, t = 1 on the transferred leg (whose events are not ours to drive).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { bookLineId, type LineContact } from "@/lib/lines/contacts";
import { findOrCreateThread } from "@/lib/inbound";
import { encodeState, type CallCommand } from "./telnyx-voice";

export const MAX_MENU_ATTEMPTS = 3;
const VOICE = { voice: "female", language: "en-US" };

export interface VoiceLine {
  id: string;
  user_id: string;
  number: string;
}

export interface CallState {
  l?: string;
  m?: string;
  a?: number;
  t?: number;
}

export interface CallEvent {
  event_type: string;
  payload: Record<string, unknown>;
}

type MenuContact = Pick<LineContact, "name" | "forward_to" | "keypad_digit">;

/** Names read aloud: no symbols the speech engine would spell out. */
const spoken = (name: string) => name.replace(/[^\p{L}\p{N}' .-]/gu, " ").replace(/\s+/g, " ").trim() || "this person";

export function menuPrompt(contacts: MenuContact[], lead = "Thanks for calling."): string {
  const options = contacts
    .filter((c) => c.keypad_digit !== null && c.keypad_digit !== undefined)
    .sort((a, b) => a.keypad_digit! - b.keypad_digit!)
    .map((c) => `Press ${c.keypad_digit} for ${spoken(c.name)}.`);
  return `${lead} ${options.join(" ")}`.trim();
}

export const validDigits = (contacts: MenuContact[]) =>
  contacts
    .filter((c) => c.keypad_digit !== null && c.keypad_digit !== undefined)
    .map((c) => String(c.keypad_digit))
    .sort()
    .join("");

export function callLength(payload: Record<string, unknown>): string | null {
  const start = Date.parse(String(payload.start_time ?? ""));
  const end = Date.parse(String(payload.end_time ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const s = Math.round((end - start) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export const CALL_RINGING = "Incoming call";
const CALL_MISSED_NO_MENU = "Missed call: no voice menu is set up on this line";

async function menuContacts(db: SupabaseClient, lineId: string): Promise<MenuContact[]> {
  const { data } = await db
    .from("line_contacts")
    .select("name, forward_to, keypad_digit")
    .eq("phone_number_id", await bookLineId(db, lineId));
  return ((data ?? []) as MenuContact[]).filter((c) => c.keypad_digit !== null && c.keypad_digit !== undefined);
}

async function setBody(db: SupabaseClient, messageId: string | undefined, body: string) {
  if (messageId) await db.from("messages").update({ body }).eq("id", messageId);
}

/** Handles one Call Control event for a line. Returns what it did, for logs and tests. */
export async function handleCallEvent(
  deps: { db: SupabaseClient; command: CallCommand },
  line: VoiceLine,
  event: CallEvent,
  state: CallState | null
): Promise<string> {
  const { db, command } = deps;
  const p = event.payload;
  const callId = String(p.call_control_id ?? "");
  if (!callId) return "ignored: no call_control_id";
  if (state?.t) return "ignored: transferred leg";

  switch (event.event_type) {
    case "call.initiated": {
      if (p.direction !== "incoming" || state?.l) return "ignored: not a new incoming call";
      const logId = `call:${String(p.call_session_id ?? callId)}`;
      // Telnyx retries a webhook it did not see answered in time.
      const { data: seen } = await db.from("messages").select("id").eq("provider_message_id", logId).limit(1);
      if (seen?.length) return "ignored: retry";
      const caller = String(p.from ?? "") || "unknown";
      const now = new Date().toISOString();
      const thread = await findOrCreateThread(db, line.user_id, line.id, caller, now);
      const contacts = await menuContacts(db, line.id);
      const { data: msg } = await db
        .from("messages")
        .insert({
          conversation_id: thread.id,
          direction: "inbound",
          kind: "call",
          body: contacts.length ? CALL_RINGING : CALL_MISSED_NO_MENU,
          status: "delivered",
          provider: "telnyx",
          provider_message_id: logId,
        })
        .select("id")
        .single();
      await db.from("conversations").update({ last_message_at: now, archived: false }).eq("id", thread.id);
      if (!contacts.length) {
        await command(callId, "hangup", {});
        return "rejected: no menu";
      }
      await command(callId, "answer", { client_state: encodeState({ l: line.id, m: msg?.id, a: 0 }) });
      return "answered";
    }

    case "call.answered": {
      if (!state?.l) return "ignored: not ours";
      const contacts = await menuContacts(db, line.id);
      if (!contacts.length) {
        await command(callId, "hangup", {});
        return "hung up: menu emptied";
      }
      await command(callId, "gather_using_speak", gatherBody(contacts, state, ""));
      return "menu";
    }

    case "call.gather.ended": {
      if (!state?.l) return "ignored: not ours";
      if (p.status === "call_hangup" || p.status === "cancelled") return "caller left";
      const contacts = await menuContacts(db, line.id);
      const digit = String(p.digits ?? "").slice(0, 1);
      const pick = digit ? contacts.find((c) => String(c.keypad_digit) === digit) : undefined;
      if (pick) {
        await setBody(db, state.m, `Incoming call, put through to ${pick.name}`);
        await command(callId, "transfer", {
          to: pick.forward_to,
          timeout_secs: 30,
          client_state: encodeState({ ...state, t: 1 }),
        });
        return `transferred to ${pick.name}`;
      }
      const attempt = (state.a ?? 0) + 1;
      if (attempt >= MAX_MENU_ATTEMPTS || !contacts.length) {
        await setBody(db, state.m, "Missed call: hung up at the menu without choosing");
        await command(callId, "hangup", {});
        return "gave up";
      }
      const lead = digit ? "Sorry, that is not an option." : "Sorry, I did not get that.";
      await command(callId, "gather_using_speak", gatherBody(contacts, { ...state, a: attempt }, lead));
      return "asked again";
    }

    case "call.hangup": {
      if (!state?.m) return "ignored: not ours";
      const { data: msg } = await db.from("messages").select("body").eq("id", state.m).maybeSingle();
      if (!msg) return "no log entry";
      const length = callLength(p);
      const body =
        msg.body === CALL_RINGING
          ? "Missed call: hung up before choosing"
          : length && msg.body.startsWith("Incoming call, put through")
            ? `${msg.body} (${length})`
            : msg.body;
      if (body !== msg.body) await setBody(db, state.m, body);
      return "logged";
    }

    default:
      return `ignored: ${event.event_type}`;
  }
}

function gatherBody(contacts: MenuContact[], state: CallState, lead: string) {
  return {
    payload: lead ? menuPrompt(contacts, lead) : menuPrompt(contacts),
    ...VOICE,
    valid_digits: validDigits(contacts),
    minimum_digits: 1,
    maximum_digits: 1,
    timeout_millis: 8000,
    client_state: encodeState(state as Record<string, unknown>),
  };
}
