import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The public SMS blacklist: every number smshub users blocked as spam or scam,
 * one row per number across all users, with how many people flagged it and
 * when. nichedb.dev reads this every 15 minutes and publishes it at
 * nichedb.dev/blacklists/sms. Who blocked a number, its contact name and the
 * line it texted never leave here, and numbers that are smshub lines
 * themselves are never listed.
 */

export const dynamic = "force-dynamic";

const PAGE = 1000;
const E164 = /^\+[1-9]\d{6,14}$/;

type Row = {
  user_id: string;
  phone: string;
  block_reason: "spam" | "scam";
  blocked_at: string;
  blocked_count: number | null;
};

type Entry = {
  number: string;
  reasons: { spam: number; scam: number };
  reporters: number;
  firstFlaggedAt: string;
  lastFlaggedAt: string;
  blockedMessages: number;
};

export async function GET() {
  const db = createServiceClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("contacts")
      .select("user_id, phone, block_reason, blocked_at, blocked_count")
      .not("blocked_at", "is", null)
      .in("block_reason", ["spam", "scam"])
      .order("blocked_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: "blacklist unavailable" }, { status: 503 });
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }

  const byNumber = new Map<string, Entry & { users: Set<string> }>();
  for (const r of rows) {
    if (!E164.test(r.phone)) continue;
    let e = byNumber.get(r.phone);
    if (!e) {
      e = {
        number: r.phone,
        reasons: { spam: 0, scam: 0 },
        reporters: 0,
        firstFlaggedAt: r.blocked_at,
        lastFlaggedAt: r.blocked_at,
        blockedMessages: 0,
        users: new Set(),
      };
      byNumber.set(r.phone, e);
    }
    e.reasons[r.block_reason] += 1;
    e.users.add(r.user_id);
    e.blockedMessages += r.blocked_count ?? 0;
    if (r.blocked_at < e.firstFlaggedAt) e.firstFlaggedAt = r.blocked_at;
    if (r.blocked_at > e.lastFlaggedAt) e.lastFlaggedAt = r.blocked_at;
  }

  // A number one of our users owns as a line is never published, whoever blocked it.
  const candidates = [...byNumber.keys()];
  for (let i = 0; i < candidates.length; i += PAGE) {
    const { data, error } = await db
      .from("phone_numbers")
      .select("number")
      .in("number", candidates.slice(i, i + PAGE));
    if (error) return NextResponse.json({ error: "blacklist unavailable" }, { status: 503 });
    for (const { number } of data ?? []) byNumber.delete(number);
  }

  const numbers = [...byNumber.values()]
    .map(({ users, ...e }) => ({ ...e, reporters: users.size }))
    .sort((a, b) => b.reporters - a.reporters || b.lastFlaggedAt.localeCompare(a.lastFlaggedAt));

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), count: numbers.length, numbers },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
