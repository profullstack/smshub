/**
 * Blocked senders. A block sits on the user's contact for that phone, so it
 * covers every line: texts from it are dropped before they are stored, calls
 * are hung up, and blocking archives its threads.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeE164 } from "@/lib/phone";

export const BLOCK_REASONS = ["spam", "scam", "other"] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];

export function isBlockReason(v: unknown): v is BlockReason {
  return typeof v === "string" && (BLOCK_REASONS as readonly string[]).includes(v);
}

export interface BlockedSender {
  contact_id: string;
  phone: string;
  name: string | null;
  reason: BlockReason | null;
  blocked_at: string | null;
  blocked_count: number;
  last_blocked_at: string | null;
}

const BLOCK_COLS = "id, phone, name, block_reason, blocked_at, blocked_count, last_blocked_at";

type BlockRow = {
  id: string;
  phone: string;
  name: string | null;
  block_reason: BlockReason | null;
  blocked_at: string | null;
  blocked_count: number | null;
  last_blocked_at: string | null;
};

function toSender(c: BlockRow): BlockedSender {
  return {
    contact_id: c.id,
    phone: c.phone,
    name: c.name,
    reason: c.block_reason,
    blocked_at: c.blocked_at,
    blocked_count: c.blocked_count ?? 0,
    last_blocked_at: c.last_blocked_at,
  };
}

/**
 * If `phone` is blocked by this user, count the dropped text or call and say so.
 * Callers stop there: nothing is stored, nothing is emitted.
 */
export async function dropIfBlocked(db: SupabaseClient, userId: string, phone: string): Promise<boolean> {
  if (!phone) return false;
  const { data } = await db
    .from("contacts")
    .select("id, blocked_count")
    .eq("user_id", userId)
    .eq("phone", phone)
    .not("blocked_at", "is", null)
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  await db
    .from("contacts")
    .update({ blocked_count: (data.blocked_count ?? 0) + 1, last_blocked_at: new Date().toISOString() })
    .eq("id", data.id);
  return true;
}

/** Every phone this user blocked, newest first. */
export async function listBlocked(db: SupabaseClient, userId: string): Promise<BlockedSender[]> {
  const { data } = await db
    .from("contacts")
    .select(BLOCK_COLS)
    .eq("user_id", userId)
    .not("blocked_at", "is", null)
    .order("blocked_at", { ascending: false });
  return ((data ?? []) as BlockRow[]).map(toSender);
}

export type BlockResult = { blocked: BlockedSender } | { error: string; status: number };

/**
 * Block (reason given) or unblock (reason null) a phone, by contact id or
 * number. Blocking a number never seen before creates its contact, so it can
 * be blocked ahead of time. Blocking archives the phone's threads.
 */
export async function setBlocked(
  db: SupabaseClient,
  userId: string,
  target: { contactId?: string; phone?: string },
  reason: BlockReason | null
): Promise<BlockResult> {
  let contact: { id: string } | null = null;
  if (target.contactId) {
    const { data } = await db.from("contacts").select("id").eq("id", target.contactId).eq("user_id", userId).maybeSingle();
    contact = data;
  } else if (target.phone) {
    const phone = normalizeE164(target.phone);
    if (!phone) return { error: "phone must be a phone number, e.g. +14155551234", status: 400 };
    const { data } = await db.from("contacts").select("id").eq("user_id", userId).eq("phone", phone).maybeSingle();
    contact = data;
    if (!contact && reason) {
      const { data: created } = await db.from("contacts").insert({ user_id: userId, phone }).select("id").single();
      contact = created;
    }
    if (!contact) return { error: "That number is not blocked", status: 404 };
  } else {
    return { error: "Give a contact_id or a phone", status: 400 };
  }
  if (!contact) return { error: "Contact not found", status: 404 };

  const { data: row, error } = await db
    .from("contacts")
    .update(reason ? { blocked_at: new Date().toISOString(), block_reason: reason } : { blocked_at: null, block_reason: null })
    .eq("id", contact.id)
    .eq("user_id", userId)
    .select(BLOCK_COLS)
    .single();
  if (error || !row) return { error: "Could not update the contact", status: 500 };
  if (reason) {
    await db.from("conversations").update({ archived: true }).eq("user_id", userId).eq("contact_id", contact.id);
  }
  return { blocked: toSender(row as BlockRow) };
}
