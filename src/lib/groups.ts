/**
 * Contact groups: named lists of people to text together, from one of your own numbers.
 *
 * A group send texts each member separately (an SMS "group" is many one-to-one texts), files
 * each in the inbox like any other send, and skips members who said STOP. With `relay` on, a
 * member's text to the group's number goes on to everyone else in the group, so the group
 * works like a group chat. Other apps keep a group in step with something of theirs through
 * `external_ref` (group.call keeps one per room): PUT the whole member list, then send.
 *
 * Every query is scoped by user_id here because the API runs with the service role.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/webhooks/hub";
import { toE164 } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/conversations";
import { MAX_BODY, SendError, pickNumber, sendFromNumber, type NumberRow } from "@/lib/messages/send";

/** Group sends a user may start in a minute (each one texts every member). */
export const GROUP_SEND_RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };
/** Members one group may hold, which is also the most texts one group send makes. */
export const MAX_GROUP_MEMBERS = 200;
export const MAX_GROUPS = 100;

export interface GroupMemberInput {
  phone?: unknown;
  name?: unknown;
}

export interface GroupInput {
  name?: unknown;
  description?: unknown;
  /** The number the group texts from (E.164 or its id). */
  from?: unknown;
  relay?: unknown;
  external_ref?: unknown;
  /** With PUT/upsert: the whole member list. */
  members?: unknown;
}

export interface GroupMember {
  contact_id: string;
  phone: string;
  name: string | null;
  opted_out: boolean;
  added_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  from: string | null;
  phone_number_id: string | null;
  relay: boolean;
  external_ref: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
  members?: GroupMember[];
}

interface GroupRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  phone_number_id: string | null;
  relay: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
  phone_numbers?: { number: string } | null;
}

const GROUP_COLS = "id, user_id, name, description, phone_number_id, relay, external_ref, created_at, updated_at, last_sent_at, phone_numbers(number)";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Phones from user input, normalised and de-duplicated; a bad one is an error, not a silent skip. */
export function cleanMembers(input: unknown): { phone: string; name: string | null }[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new SendError("members must be a list of { phone, name? }", 400);
  const out = new Map<string, string | null>();
  for (const m of input as (GroupMemberInput | string)[]) {
    const raw = typeof m === "string" ? m : m?.phone;
    const phone = typeof raw === "string" ? toE164(raw.trim()) : null;
    if (!phone) throw new SendError(`Invalid member phone "${String(raw)}": use E.164, e.g. +14155551234`, 400);
    const name = typeof m === "string" ? "" : str(m?.name, 60);
    out.set(phone, name || out.get(phone) || null);
  }
  if (out.size > MAX_GROUP_MEMBERS) throw new SendError(`A group holds at most ${MAX_GROUP_MEMBERS} members`, 400);
  return [...out].map(([phone, name]) => ({ phone, name }));
}

function toGroup(row: GroupRow, memberCount: number, members?: GroupMember[]): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    from: row.phone_numbers?.number ?? null,
    phone_number_id: row.phone_number_id,
    relay: row.relay,
    external_ref: row.external_ref,
    member_count: memberCount,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_sent_at: row.last_sent_at,
    ...(members ? { members } : {}),
  };
}

async function memberRows(db: SupabaseClient, groupId: string): Promise<GroupMember[]> {
  const { data, error } = await db
    .from("contact_group_members")
    .select("contact_id, opted_out, added_at, contacts(phone, name)")
    .eq("group_id", groupId)
    .order("added_at");
  if (error) throw error;
  return ((data ?? []) as unknown as { contact_id: string; opted_out: boolean; added_at: string; contacts: { phone: string; name: string | null } | null }[])
    .filter((m) => m.contacts)
    .map((m) => ({ contact_id: m.contact_id, phone: m.contacts!.phone, name: m.contacts!.name, opted_out: m.opted_out, added_at: m.added_at }));
}

/** A group of this user's, by id or by external_ref. */
async function ownGroup(db: SupabaseClient, userId: string, ref: string): Promise<GroupRow> {
  let q = db.from("contact_groups").select(GROUP_COLS).eq("user_id", userId);
  q = isUuid(ref) ? q.eq("id", ref) : q.eq("external_ref", ref);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) throw new SendError("Group not found", 404);
  return data as unknown as GroupRow;
}

async function numberId(db: SupabaseClient, userId: string, from: unknown): Promise<string | null> {
  const ref = str(from, 64);
  if (!ref) return null;
  const n = await pickNumber(db, userId, ref);
  if (n.managed) throw new SendError("Rented numbers receive only; a group texts from your own Twilio or Telnyx number", 400);
  return n.id;
}

/** The contacts for these phones, created when new; a name fills in a contact that has none. */
async function contactIds(db: SupabaseClient, userId: string, members: { phone: string; name: string | null }[]): Promise<string[]> {
  if (!members.length) return [];
  const phones = members.map((m) => m.phone);
  const { data: existing, error } = await db.from("contacts").select("id, phone, name").eq("user_id", userId).in("phone", phones);
  if (error) throw error;
  const byPhone = new Map((existing ?? []).map((c) => [c.phone as string, c as { id: string; phone: string; name: string | null }]));
  const missing = members.filter((m) => !byPhone.has(m.phone));
  if (missing.length) {
    const { data: made, error: e2 } = await db
      .from("contacts")
      .insert(missing.map((m) => ({ user_id: userId, phone: m.phone, name: m.name })))
      .select("id, phone, name");
    if (e2) throw e2;
    for (const c of made ?? []) byPhone.set(c.phone, c);
  }
  for (const m of members) {
    const c = byPhone.get(m.phone);
    if (c && m.name && !c.name) await db.from("contacts").update({ name: m.name }).eq("id", c.id).eq("user_id", userId);
  }
  return phones.map((p) => byPhone.get(p)!.id);
}

export async function listGroups(db: SupabaseClient, userId: string): Promise<Group[]> {
  const { data, error } = await db.from("contact_groups").select(GROUP_COLS).eq("user_id", userId).order("created_at");
  if (error) throw error;
  const rows = (data ?? []) as unknown as GroupRow[];
  if (!rows.length) return [];
  const { data: counts } = await db.from("contact_group_members").select("group_id").in("group_id", rows.map((r) => r.id));
  const n = new Map<string, number>();
  for (const c of counts ?? []) n.set(c.group_id, (n.get(c.group_id) ?? 0) + 1);
  return rows.map((r) => toGroup(r, n.get(r.id) ?? 0));
}

export async function getGroup(db: SupabaseClient, userId: string, ref: string): Promise<Group> {
  const row = await ownGroup(db, userId, ref);
  const members = await memberRows(db, row.id);
  return toGroup(row, members.length, members);
}

/**
 * Make a group, or with `external_ref` set and a group already on it, update that one and
 * replace its members with `members` (when given). This is how another app keeps a group in
 * step without remembering our ids.
 */
export async function saveGroup(db: SupabaseClient, userId: string, input: GroupInput): Promise<Group> {
  const externalRef = str(input.external_ref, 120) || null;
  const existing = externalRef
    ? ((await db.from("contact_groups").select("id").eq("user_id", userId).eq("external_ref", externalRef).maybeSingle()).data as { id: string } | null)
    : null;
  if (existing) return updateGroup(db, userId, existing.id, input);
  const name = str(input.name, 80);
  if (!name) throw new SendError("A group needs a name", 400);
  const { count } = await db.from("contact_groups").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= MAX_GROUPS) throw new SendError(`At most ${MAX_GROUPS} groups`, 409);
  const members = cleanMembers(input.members);
  const { data, error } = await db
    .from("contact_groups")
    .insert({
      user_id: userId,
      name,
      description: str(input.description, 300),
      phone_number_id: await numberId(db, userId, input.from),
      relay: input.relay === true,
      external_ref: externalRef,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (members.length) await setMembers(db, userId, data.id, members);
  return getGroup(db, userId, data.id);
}

export async function updateGroup(db: SupabaseClient, userId: string, ref: string, input: GroupInput): Promise<Group> {
  const row = await ownGroup(db, userId, ref);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = str(input.name, 80);
    if (!name) throw new SendError("A group needs a name", 400);
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = str(input.description, 300);
  if (input.from !== undefined) patch.phone_number_id = await numberId(db, userId, input.from);
  if (input.relay !== undefined) patch.relay = input.relay === true;
  const { error } = await db.from("contact_groups").update(patch).eq("id", row.id).eq("user_id", userId);
  if (error) throw error;
  if (input.members !== undefined) await setMembers(db, userId, row.id, cleanMembers(input.members));
  return getGroup(db, userId, row.id);
}

export async function deleteGroup(db: SupabaseClient, userId: string, ref: string): Promise<{ deleted: true }> {
  const row = await ownGroup(db, userId, ref);
  const { error } = await db.from("contact_groups").delete().eq("id", row.id).eq("user_id", userId);
  if (error) throw error;
  return { deleted: true };
}

/** Replace the member list. Members who said STOP stay opted out if they are still in it. */
async function setMembers(db: SupabaseClient, userId: string, groupId: string, members: { phone: string; name: string | null }[]): Promise<void> {
  const ids = await contactIds(db, userId, members);
  const keep = new Set(ids);
  const current = await memberRows(db, groupId);
  const gone = current.filter((m) => !keep.has(m.contact_id)).map((m) => m.contact_id);
  if (gone.length) await db.from("contact_group_members").delete().eq("group_id", groupId).in("contact_id", gone);
  const have = new Set(current.map((m) => m.contact_id));
  const add = ids.filter((id) => !have.has(id));
  if (add.length) {
    const { error } = await db.from("contact_group_members").insert(add.map((contact_id) => ({ group_id: groupId, contact_id })));
    if (error) throw error;
  }
}

export async function addMembers(db: SupabaseClient, userId: string, ref: string, input: unknown): Promise<Group> {
  const row = await ownGroup(db, userId, ref);
  const members = cleanMembers(input);
  if (!members.length) throw new SendError("Give members: [{ phone, name? }]", 400);
  const current = await memberRows(db, row.id);
  if (current.length + members.length > MAX_GROUP_MEMBERS) throw new SendError(`A group holds at most ${MAX_GROUP_MEMBERS} members`, 400);
  const ids = await contactIds(db, userId, members);
  const have = new Set(current.map((m) => m.contact_id));
  const add = ids.filter((id) => !have.has(id));
  if (add.length) {
    const { error } = await db.from("contact_group_members").insert(add.map((contact_id) => ({ group_id: row.id, contact_id })));
    if (error) throw error;
  }
  return getGroup(db, userId, row.id);
}

export async function removeMember(db: SupabaseClient, userId: string, ref: string, phoneOrId: string): Promise<Group> {
  const row = await ownGroup(db, userId, ref);
  const phone = toE164(phoneOrId);
  const member = (await memberRows(db, row.id)).find((m) => m.contact_id === phoneOrId || (phone && m.phone === phone));
  if (!member) throw new SendError("Not a member of this group", 404);
  await db.from("contact_group_members").delete().eq("group_id", row.id).eq("contact_id", member.contact_id);
  return getGroup(db, userId, row.id);
}

export interface GroupSendInput {
  message?: unknown;
  from?: unknown;
  media_url?: unknown;
  /** Phones to leave out this time (whoever the message came from). */
  except?: unknown;
}

/** Text every member who has not opted out. One group send counts once against the rate limit. */
export async function sendToGroup(db: SupabaseClient, userId: string, ref: string, input: GroupSendInput) {
  const message = typeof input.message === "string" ? input.message : "";
  if (!message.trim()) throw new SendError("Missing required field: message", 400);
  if (message.length > MAX_BODY) throw new SendError(`message is longer than ${MAX_BODY} characters`, 400);
  const mediaUrl = typeof input.media_url === "string" && input.media_url ? input.media_url : undefined;
  const row = await ownGroup(db, userId, ref);

  const rl = checkRateLimit(`groupsend:${userId}`, GROUP_SEND_RATE_LIMIT);
  if (!rl.allowed) throw new SendError("Rate limit exceeded", 429, rl.retryAfterMs);

  const fromRef = str(input.from, 64) || row.phone_number_id;
  const number = await pickNumber(db, userId, fromRef);
  const except = new Set((Array.isArray(input.except) ? input.except : []).map((p) => toE164(String(p))).filter(Boolean));
  const members = await memberRows(db, row.id);
  const results: { to: string; ok: boolean; error?: string }[] = [];
  let skipped = 0;
  for (const m of members) {
    if (m.opted_out || except.has(m.phone) || m.phone === number.number) {
      skipped += 1;
      continue;
    }
    const r = await sendFromNumber(db, userId, number, m.phone, message, mediaUrl);
    results.push(r.ok ? { to: r.to, ok: true } : { to: r.to, ok: false, error: r.error });
  }
  const sentAt = new Date().toISOString();
  await db.from("contact_groups").update({ last_sent_at: sentAt }).eq("id", row.id);
  const failed = results.filter((r) => !r.ok);
  await emitEvent(
    userId,
    "group.sent",
    {
      group_id: row.id,
      name: row.name ?? null,
      external_ref: row.external_ref ?? null,
      number: number.number,
      body: message,
      sent: results.length - failed.length,
      failed: failed.length,
      skipped,
      sent_at: sentAt,
    },
    `group:${row.id}`
  );
  return {
    group_id: row.id,
    from: number.number,
    sent: results.length - failed.length,
    failed: failed.length,
    skipped,
    ...(failed.length ? { errors: failed.slice(0, 10) } : {}),
    remaining: rl.remaining,
  };
}

/**
 * An inbound text on one of the user's numbers: STOP opts the sender out of every group on that
 * user's account; anything else from a member of a relay group on that number goes on to the
 * rest of the group, prefixed with who sent it. Best effort: the inbox has already stored it.
 */
export async function onGroupInbound(
  db: SupabaseClient,
  line: { id: string; user_id: string },
  from: string,
  body: string
): Promise<{ relayed: number; optedOut?: boolean }> {
  const phone = toE164(from);
  if (!phone) return { relayed: 0 };
  const { data: contact } = await db.from("contacts").select("id, name").eq("user_id", line.user_id).eq("phone", phone).maybeSingle();
  if (!contact) return { relayed: 0 };
  const word = body.trim().toLowerCase();
  const { data: memberships } = await db
    .from("contact_group_members")
    .select("group_id, opted_out, contact_groups!inner(id, user_id, relay, phone_number_id, last_sent_at)")
    .eq("contact_id", contact.id);
  const rows = (memberships ?? []) as unknown as { group_id: string; opted_out: boolean; contact_groups: { id: string; user_id: string; relay: boolean; phone_number_id: string | null; last_sent_at: string | null } }[];
  const mine = rows.filter((r) => r.contact_groups.user_id === line.user_id);
  if (/^(stop|stopall|unsubscribe|cancel|end|quit)$/.test(word)) {
    if (mine.length) await db.from("contact_group_members").update({ opted_out: true }).eq("contact_id", contact.id).in("group_id", mine.map((r) => r.group_id));
    return { relayed: 0, optedOut: true };
  }
  if (/^(start|unstop)$/.test(word)) {
    if (mine.length) await db.from("contact_group_members").update({ opted_out: false }).eq("contact_id", contact.id).in("group_id", mine.map((r) => r.group_id));
    return { relayed: 0 };
  }
  // The group chat this text belongs to: a relay group on this number, the most recently used.
  const relay = mine
    .filter((r) => r.contact_groups.relay && r.contact_groups.phone_number_id === line.id && !r.opted_out)
    .sort((a, b) => String(b.contact_groups.last_sent_at ?? "").localeCompare(String(a.contact_groups.last_sent_at ?? "")))[0];
  if (!relay) return { relayed: 0 };
  const { data: num } = await db.from("phone_numbers").select("id, number, managed, providers(type, api_key, api_secret)").eq("id", line.id).single();
  if (!num) return { relayed: 0 };
  const members = await memberRows(db, relay.group_id);
  const who = contact.name || `${phone.slice(0, -4).replace(/\d/g, "•")}${phone.slice(-4)}`;
  let relayed = 0;
  for (const m of members) {
    if (m.opted_out || m.phone === phone) continue;
    const r = await sendFromNumber(db, line.user_id, num as unknown as NumberRow, m.phone, `${who}: ${body}`.slice(0, MAX_BODY));
    if (r.ok) relayed += 1;
  }
  await db.from("contact_groups").update({ last_sent_at: new Date().toISOString() }).eq("id", relay.group_id);
  return { relayed };
}
