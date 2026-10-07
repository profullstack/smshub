/**
 * Lines in the inbox: one per phone number (e.g. one per family member), so a
 * shared inbox can be narrowed to one person's number.
 */

export interface LineNumber {
  id: string;
  number: string;
  friendly_name: string | null;
}

interface LineConversation {
  phone_number_id: string;
  archived: boolean;
  unread_count?: number;
  phone_numbers: LineNumber | null;
}

export interface InboxLine {
  id: string;
  label: string;
  number: string;
  /** Unread texts on this line, outside the archive. */
  unread: number;
}

export const lineLabel = (n: LineNumber) => n.friendly_name?.trim() || n.number;

/**
 * The user's numbers plus any number a conversation is on (a shared team line),
 * in the order given, with unread counts.
 */
export function buildLines(numbers: LineNumber[], conversations: LineConversation[]): InboxLine[] {
  const byId = new Map<string, InboxLine>();
  for (const n of numbers) byId.set(n.id, { id: n.id, label: lineLabel(n), number: n.number, unread: 0 });
  for (const c of conversations) {
    if (!byId.has(c.phone_number_id) && c.phone_numbers) {
      byId.set(c.phone_number_id, { id: c.phone_number_id, label: lineLabel(c.phone_numbers), number: c.phone_numbers.number, unread: 0 });
    }
    const line = byId.get(c.phone_number_id);
    if (line && !c.archived) line.unread += c.unread_count ?? 0;
  }
  return [...byId.values()];
}
