import { NextResponse } from "next/server";
import { createLineContact, listLineContacts } from "@/lib/lines/contacts";
import { lineVoice } from "@/lib/lines/voice-setup";
import { lineFor } from "@/lib/lines/route-auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const ctx = await lineFor(request, (await params).id);
  if ("response" in ctx) return ctx.response;
  try {
    return NextResponse.json({ contacts: await listLineContacts(ctx.db, ctx.userId, ctx.line.id) });
  } catch (error) {
    console.error("List line contacts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Adds someone to the line. Giving them a keypad digit also points the
 * number's calls at the voice menu, unless they already go somewhere else.
 */
export async function POST(request: Request, { params }: Params) {
  const ctx = await lineFor(request, (await params).id);
  if ("response" in ctx) return ctx.response;
  try {
    const body = await request.json().catch(() => ({}));
    const saved = await createLineContact(ctx.db, ctx.line, body ?? {});
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    const voice = saved.contact.keypad_digit !== null ? await lineVoice(ctx.db, ctx.line, { apply: true }) : undefined;
    return NextResponse.json({ contact: saved.contact, voice }, { status: 201 });
  } catch (error) {
    console.error("Create line contact error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
