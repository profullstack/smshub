import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: string) => UUID.test(v);

/**
 * Reads a `phone_number_id` filter from a query string. Returns null when the
 * parameter is absent, undefined when it is present but not a uuid (a 400).
 */
export function lineFilter(params: URLSearchParams): string | null | undefined {
  const raw = params.get("phone_number_id");
  if (raw === null || raw === "") return null;
  return UUID.test(raw) ? raw : undefined;
}

/** Longest a friendly_name may be: one family member's name, not a paragraph. */
export const MAX_LINE_NAME = 60;

/** Trims a requested line name; "" or null clears it, undefined means it is not a valid name. */
export function cleanLineName(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const name = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (name.length > MAX_LINE_NAME) return undefined;
  return name || null;
}

export interface ListConversationsOptions {
  phoneNumberId?: string | null;
  archived?: boolean;
  limit?: number;
}

/** A user's conversations, newest first, optionally on one of their numbers (lines). */
export async function listConversations(db: SupabaseClient, userId: string, opts: ListConversationsOptions = {}) {
  let query = db
    .from("conversations")
    .select("*, unread_count, contacts(id, phone, name), phone_numbers(id, number, friendly_name)")
    .eq("user_id", userId);
  if (opts.phoneNumberId) query = query.eq("phone_number_id", opts.phoneNumberId);
  if (opts.archived !== undefined) query = query.eq("archived", opts.archived);
  query = query.order("last_message_at", { ascending: false });
  if (opts.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
