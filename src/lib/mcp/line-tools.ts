/**
 * MCP tools for a line's contacts book and voice menu: the same operations as
 * Settings > Lines and /api/lines.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createLineContact,
  deleteLineContact,
  listLines,
  loadLine,
  updateLineContact,
  type ContactInput,
} from "@/lib/lines/contacts";
import { lineVoice } from "@/lib/lines/voice-setup";

interface LineToolCtx {
  db: SupabaseClient;
  user: { userId: string };
}

export interface LineTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (ctx: LineToolCtx, args: Record<string, unknown>) => Promise<unknown>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const lineId = { type: "string", description: "A number id from list_lines or list_numbers." };
const fields = {
  name: { type: "string", description: "Who this is, e.g. Kim. Threads with their cell show this name." },
  forward_to: { type: "string", description: "Their own cell in E.164, e.g. +14155550123. Calls are put through to it." },
  keypad_digit: { type: ["integer", "null"], minimum: 0, maximum: 9, description: "Digit a caller presses to reach them; null for none." },
  sms_prefix: { type: ["string", "null"], description: "Text prefix, e.g. K: an inbound 'K: running late' is filed into their thread." },
  forward_sms: { type: "boolean", description: "Also text prefixed messages on to their cell (only works once the number can send)." },
};

const pick = (a: Record<string, unknown>): ContactInput => {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(fields)) if (a[k] !== undefined) out[k] = a[k];
  return out as ContactInput;
};

async function line(c: LineToolCtx, a: Record<string, unknown>) {
  const found = await loadLine(c.db, c.user.userId, String(a.line_id ?? ""));
  if (!found) throw new LineToolError("line_id is not one of your numbers");
  return found;
}

export class LineToolError extends Error {}

export const LINE_TOOLS: LineTool[] = [
  {
    name: "list_lines",
    description: "Your numbers, each with its contacts book: name, cell, keypad digit for the voice menu, text prefix.",
    inputSchema: obj({}),
    run: async (c) => ({ lines: await listLines(c.db, c.user.userId) }),
  },
  {
    name: "add_line_contact",
    description:
      "Add someone to a number's contacts book. Giving a keypad_digit also points the number's calls at the voice menu ('press 1 for Kim'), unless they already go to another connection.",
    inputSchema: obj({ line_id: lineId, ...fields }, ["line_id", "name", "forward_to"]),
    run: async (c, a) => {
      const l = await line(c, a);
      const saved = await createLineContact(c.db, l, pick(a));
      if (!saved.ok) throw new LineToolError(saved.error);
      const voice = saved.contact.keypad_digit !== null ? await lineVoice(c.db, l, { apply: true }) : undefined;
      return { contact: saved.contact, voice };
    },
  },
  {
    name: "update_line_contact",
    description: "Change a contact on a number: any of name, forward_to, keypad_digit, sms_prefix, forward_sms.",
    inputSchema: obj({ line_id: lineId, contact_id: { type: "string" }, ...fields }, ["line_id", "contact_id"]),
    run: async (c, a) => {
      const saved = await updateLineContact(c.db, await line(c, a), String(a.contact_id ?? ""), pick(a));
      if (!saved.ok) throw new LineToolError(saved.error);
      return { contact: saved.contact };
    },
  },
  {
    name: "remove_line_contact",
    description: "Remove a contact from a number's contacts book.",
    inputSchema: obj({ line_id: lineId, contact_id: { type: "string" } }, ["line_id", "contact_id"]),
    run: async (c, a) => {
      if (!(await deleteLineContact(c.db, await line(c, a), String(a.contact_id ?? "")))) throw new LineToolError("Contact not found");
      return { ok: true };
    },
  },
  {
    name: "voice_menu",
    description:
      "Where calls to a number go. With setup=true, point them at the voice menu; force=true replaces a connection that already takes its calls.",
    inputSchema: obj({ line_id: lineId, setup: { type: "boolean" }, force: { type: "boolean" } }, ["line_id"]),
    run: async (c, a) => ({ voice: await lineVoice(c.db, await line(c, a), { apply: a.setup === true, force: a.force === true }) }),
  },
];
