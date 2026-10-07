import { NextResponse } from "next/server";
import { isUuid, setRecordCalls, shareContactsBook } from "@/lib/lines/contacts";
import { lineVoice } from "@/lib/lines/voice-setup";
import { lineFor } from "@/lib/lines/route-auth";

type Params = { params: Promise<{ id: string }> };

/**
 * Line settings; send only the fields to change.
 * - contacts_from: "<line id>" answers this number from another line's
 *   contacts book (same voice menu, same text prefixes); null gives it its own
 *   again. Sharing a book with a menu also points this number's calls at it.
 * - record_calls: true records calls the voice menu answers, as MP3 (callers
 *   hear "This call may be recorded" first).
 */
export async function PATCH(request: Request, { params }: Params) {
  const ctx = await lineFor(request, (await params).id);
  if ("response" in ctx) return ctx.response;
  try {
    const body = (await request.json().catch(() => ({}))) ?? {};
    const out: Record<string, unknown> = { ok: true };

    if ("record_calls" in body) {
      if (typeof body.record_calls !== "boolean") {
        return NextResponse.json({ error: "record_calls must be true or false" }, { status: 400 });
      }
      await setRecordCalls(ctx.db, ctx.line, body.record_calls);
      out.record_calls = body.record_calls;
    }

    if ("contacts_from" in body) {
      const from = body.contacts_from ?? null;
      if (from !== null && !isUuid(from)) {
        return NextResponse.json({ error: "contacts_from must be a line id or null" }, { status: 400 });
      }
      const shared = await shareContactsBook(ctx.db, ctx.line, from);
      if (!shared.ok) return NextResponse.json({ error: shared.error }, { status: shared.status });
      out.contacts_from = from;
      if (from) {
        const { data } = await ctx.db.from("line_contacts").select("keypad_digit").eq("phone_number_id", from);
        if ((data ?? []).some((c: { keypad_digit: number | null }) => c.keypad_digit !== null)) {
          out.voice = await lineVoice(ctx.db, ctx.line, { apply: true });
        }
      }
    }
    return NextResponse.json(out);
  } catch (error) {
    console.error("Update line error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
