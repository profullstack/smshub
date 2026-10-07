/**
 * The contacts book of one owned number (a "line"): the people who share it.
 * Each has a name, their own cell, an optional keypad digit for the voice menu
 * and an optional text prefix ("K: ...") that files an inbound SMS into their
 * thread. Set up once in Settings > Lines; nothing is chosen per message.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeE164 } from "@/lib/phone";
import { isManagedProvider } from "@/lib/managed-numbers/service";

export const MAX_CONTACT_NAME = 60;
export const MAX_LINE_CONTACTS = 10;

export interface LineContact {
  id: string;
  phone_number_id: string;
  contact_id: string | null;
  name: string;
  forward_to: string;
  keypad_digit: number | null;
  sms_prefix: string | null;
  forward_sms: boolean;
  created_at: string;
  updated_at: string;
}

export interface Line {
  id: string;
  user_id: string;
  number: string;
  friendly_name: string | null;
  provider_id: string;
  provider_type: string;
  managed: boolean;
  /** Another line whose contacts book this one uses, if any. */
  contacts_line_id: string | null;
  /** Record calls the voice menu answers on this number. */
  record_calls: boolean;
}

export const LINE_CONTACT_COLUMNS =
  "id, phone_number_id, contact_id, name, forward_to, keypad_digit, sms_prefix, forward_sms, created_at, updated_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** A US 10-digit number gets +1; anything else must already be E.164. */
export function normalizeCell(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!raw.startsWith("+") && digits.length === 10) return `+1${digits}`;
  if (!raw.startsWith("+") && digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return normalizeE164(raw);
}

export type ContactInput = {
  name?: unknown;
  forward_to?: unknown;
  keypad_digit?: unknown;
  sms_prefix?: unknown;
  forward_sms?: unknown;
};

export type CleanContact = Partial<Pick<LineContact, "name" | "forward_to" | "keypad_digit" | "sms_prefix" | "forward_sms">>;

/**
 * Validates a create (`partial` false: name + forward_to required) or an edit.
 * Returns the clean fields or a message for a 400.
 */
export function cleanContactInput(input: ContactInput, partial: boolean): { ok: true; value: CleanContact } | { ok: false; error: string } {
  const value: CleanContact = {};
  if (input.name !== undefined || !partial) {
     
    const name = typeof input.name === "string" ? input.name.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
    if (!name || name.length > MAX_CONTACT_NAME) return { ok: false, error: `name is required, at most ${MAX_CONTACT_NAME} characters` };
    value.name = name;
  }
  if (input.forward_to !== undefined || !partial) {
    const cell = normalizeCell(input.forward_to);
    if (!cell) return { ok: false, error: "forward_to must be a phone number in E.164 form, e.g. +14155550123" };
    value.forward_to = cell;
  }
  if (input.keypad_digit !== undefined) {
    if (input.keypad_digit === null || input.keypad_digit === "") value.keypad_digit = null;
    else {
      const d = Number(input.keypad_digit);
      if (!Number.isInteger(d) || d < 0 || d > 9) return { ok: false, error: "keypad_digit must be a single digit 0-9" };
      value.keypad_digit = d;
    }
  }
  if (input.sms_prefix !== undefined) {
    if (input.sms_prefix === null || input.sms_prefix === "") value.sms_prefix = null;
    else {
      const p = String(input.sms_prefix).trim().replace(/:$/, "");
      if (!/^[A-Za-z0-9]{1,8}$/.test(p)) return { ok: false, error: "sms_prefix must be 1-8 letters or digits, e.g. K" };
      value.sms_prefix = p.toUpperCase();
    }
  }
  if (input.forward_sms !== undefined) {
    if (typeof input.forward_sms !== "boolean") return { ok: false, error: "forward_sms must be true or false" };
    value.forward_sms = input.forward_sms;
  }
  return { ok: true, value };
}

/** A Postgres unique violation on line_contacts, in words. */
export function conflictMessage(error: { code?: string; message?: string } | null): string | null {
  if (error?.code !== "23505") return null;
  const m = error.message ?? "";
  if (m.includes("digit")) return "Another contact on this line already has that keypad digit";
  if (m.includes("prefix")) return "Another contact on this line already has that text prefix";
  if (m.includes("cell")) return "That cell is already in this line's contacts";
  return "That contact clashes with another on this line";
}

/** A number the user owns (not merely sees via a team), with its provider type. */
export async function loadLine(db: SupabaseClient, userId: string, lineId: string): Promise<Line | null> {
  if (!isUuid(lineId)) return null;
  const { data } = await db
    .from("phone_numbers")
    .select("id, user_id, number, friendly_name, provider_id, managed, contacts_line_id, record_calls, providers(type, api_key, metadata)")
    .eq("id", lineId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  return toLine(data as unknown as LineRow);
}

type LineRow = {
  id: string;
  user_id: string;
  number: string;
  friendly_name: string | null;
  provider_id: string;
  managed: boolean | null;
  contacts_line_id?: string | null;
  record_calls?: boolean | null;
  providers: { type: string; api_key: string | null; metadata: unknown } | null;
};

function toLine(row: LineRow): Line {
  return {
    id: row.id,
    user_id: row.user_id,
    number: row.number,
    friendly_name: row.friendly_name,
    provider_id: row.provider_id,
    provider_type: row.providers?.type ?? "unknown",
    managed: Boolean(row.managed) || isManagedProvider(row.providers),
    contacts_line_id: row.contacts_line_id ?? null,
    record_calls: Boolean(row.record_calls),
  };
}

/** Every active number the user owns, each with its contacts book. */
export async function listLines(db: SupabaseClient, userId: string) {
  const { data: numbers, error } = await db
    .from("phone_numbers")
    .select("id, user_id, number, friendly_name, provider_id, managed, contacts_line_id, record_calls, providers(type, api_key, metadata)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const lines = ((numbers ?? []) as unknown as LineRow[]).map(toLine);
  const contacts = await listLineContacts(db, userId);
  return lines.map(({ user_id: _u, provider_id: _p, ...line }) => ({
    ...line,
    // A line sharing another's book shows (and is answered from) that book.
    contacts: contacts.filter((c) => c.phone_number_id === (line.contacts_line_id ?? line.id)),
  }));
}

export async function listLineContacts(db: SupabaseClient, userId: string, lineId?: string): Promise<LineContact[]> {
  let q = db.from("line_contacts").select(LINE_CONTACT_COLUMNS).eq("user_id", userId);
  if (lineId) q = q.eq("phone_number_id", lineId);
  const { data, error } = await q.order("keypad_digit", { ascending: true, nullsFirst: false }).order("name");
  if (error) throw error;
  return (data ?? []) as LineContact[];
}

/**
 * The contacts row for a cell, named after the line contact: inbox threads
 * with that cell then show the name, and the compose picker lists it.
 */
export async function linkContact(db: SupabaseClient, userId: string, phone: string, name: string): Promise<string | null> {
  const { data: existing } = await db
    .from("contacts")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();
  if (existing) {
    await db.from("contacts").update({ name }).eq("id", existing.id);
    return existing.id;
  }
  const { data } = await db.from("contacts").insert({ user_id: userId, phone, name }).select("id").single();
  return data?.id ?? null;
}

export type SaveResult = { ok: true; contact: LineContact } | { ok: false; status: number; error: string };

export async function createLineContact(db: SupabaseClient, line: Line, input: ContactInput): Promise<SaveResult> {
  if (line.contacts_line_id) return { ok: false, status: 409, error: "This number uses another line's contacts; edit them on that line" };
  const clean = cleanContactInput(input, false);
  if (!clean.ok) return { ok: false, status: 400, error: clean.error };
  const { count } = await db
    .from("line_contacts")
    .select("id", { count: "exact", head: true })
    .eq("phone_number_id", line.id);
  if ((count ?? 0) >= MAX_LINE_CONTACTS) {
    return { ok: false, status: 400, error: `A line holds at most ${MAX_LINE_CONTACTS} contacts` };
  }
  const v = clean.value;
  const contactId = await linkContact(db, line.user_id, v.forward_to!, v.name!);
  const { data, error } = await db
    .from("line_contacts")
    .insert({ ...v, user_id: line.user_id, phone_number_id: line.id, contact_id: contactId })
    .select(LINE_CONTACT_COLUMNS)
    .single();
  const conflict = conflictMessage(error);
  if (conflict) return { ok: false, status: 409, error: conflict };
  if (error || !data) throw error ?? new Error("could not save the contact");
  return { ok: true, contact: data as LineContact };
}

export async function updateLineContact(db: SupabaseClient, line: Line, id: string, input: ContactInput): Promise<SaveResult> {
  if (line.contacts_line_id) return { ok: false, status: 409, error: "This number uses another line's contacts; edit them on that line" };
  if (!isUuid(id)) return { ok: false, status: 404, error: "Contact not found" };
  const clean = cleanContactInput(input, true);
  if (!clean.ok) return { ok: false, status: 400, error: clean.error };
  const { data: current } = await db
    .from("line_contacts")
    .select(LINE_CONTACT_COLUMNS)
    .eq("id", id)
    .eq("phone_number_id", line.id)
    .maybeSingle();
  if (!current) return { ok: false, status: 404, error: "Contact not found" };
  const v = clean.value;
  const patch: Record<string, unknown> = { ...v, updated_at: new Date().toISOString() };
  if (v.name !== undefined || v.forward_to !== undefined) {
    patch.contact_id = await linkContact(db, line.user_id, v.forward_to ?? current.forward_to, v.name ?? current.name);
  }
  const { data, error } = await db
    .from("line_contacts")
    .update(patch)
    .eq("id", id)
    .eq("phone_number_id", line.id)
    .select(LINE_CONTACT_COLUMNS)
    .single();
  const conflict = conflictMessage(error);
  if (conflict) return { ok: false, status: 409, error: conflict };
  if (error || !data) throw error ?? new Error("could not save the contact");
  return { ok: true, contact: data as LineContact };
}

export async function deleteLineContact(db: SupabaseClient, line: Line, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data, error } = await db
    .from("line_contacts")
    .delete()
    .eq("id", id)
    .eq("phone_number_id", line.id)
    .select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

/**
 * "K: running late" -> K's contact and "running late", when K is a prefix on
 * this line. Case-insensitive; the colon may be ASCII or full-width and the
 * prefix may sit after leading spaces. Anything else is not routed.
 */
export function matchPrefix<T extends Pick<LineContact, "sms_prefix">>(
  body: string,
  contacts: T[]
): { contact: T; text: string } | null {
  const m = /^\s*([A-Za-z0-9]{1,8})\s*[:：]\s*([\s\S]*)$/.exec(body);
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const contact = contacts.find((c) => c.sms_prefix && c.sms_prefix.toUpperCase() === prefix);
  if (!contact) return null;
  return { contact, text: m[2].trim() || body.trim() };
}

/** The line whose contacts book answers calls and texts to `lineId`: its shared source, else itself. */
export async function bookLineId(db: SupabaseClient, lineId: string): Promise<string> {
  const { data } = await db.from("phone_numbers").select("contacts_line_id").eq("id", lineId).maybeSingle();
  return (data as { contacts_line_id?: string | null } | null)?.contacts_line_id || lineId;
}

/**
 * Makes `line` use another of the same user's lines' contacts book (null: its
 * own again). One hop only: the source must keep its own book.
 */
export async function shareContactsBook(
  db: SupabaseClient,
  line: Line,
  fromLineId: string | null
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (fromLineId !== null) {
    if (fromLineId === line.id) return { ok: false, status: 400, error: "A line cannot share its own contacts book" };
    const source = await loadLine(db, line.user_id, fromLineId);
    if (!source) return { ok: false, status: 404, error: "That line is not one of your numbers" };
    if (source.contacts_line_id) {
      return { ok: false, status: 400, error: "That line already uses another line's contacts; pick the line that owns them" };
    }
    const { count } = await db
      .from("phone_numbers")
      .select("id", { count: "exact", head: true })
      .eq("contacts_line_id", line.id);
    if ((count ?? 0) > 0) return { ok: false, status: 400, error: "Other lines use this line's contacts; it has to keep its own" };
  }
  const { error } = await db.from("phone_numbers").update({ contacts_line_id: fromLineId }).eq("id", line.id).eq("user_id", line.user_id);
  if (error) throw error;
  return { ok: true };
}

/** Turns call recording on or off for one of the user's numbers. */
export async function setRecordCalls(db: SupabaseClient, line: Line, on: boolean): Promise<void> {
  const { error } = await db.from("phone_numbers").update({ record_calls: on }).eq("id", line.id).eq("user_id", line.user_id);
  if (error) throw error;
}
