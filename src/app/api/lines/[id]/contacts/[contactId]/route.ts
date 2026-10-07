import { NextResponse } from "next/server";
import { deleteLineContact, updateLineContact } from "@/lib/lines/contacts";
import { lineVoice } from "@/lib/lines/voice-setup";
import { lineFor } from "@/lib/lines/route-auth";

type Params = { params: Promise<{ id: string; contactId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id, contactId } = await params;
  const ctx = await lineFor(request, id);
  if ("response" in ctx) return ctx.response;
  try {
    const body = await request.json().catch(() => ({}));
    const saved = await updateLineContact(ctx.db, ctx.line, contactId, body ?? {});
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    const voice =
      body?.keypad_digit !== undefined && saved.contact.keypad_digit !== null
        ? await lineVoice(ctx.db, ctx.line, { apply: true })
        : undefined;
    return NextResponse.json({ contact: saved.contact, voice });
  } catch (error) {
    console.error("Update line contact error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id, contactId } = await params;
  const ctx = await lineFor(request, id);
  if ("response" in ctx) return ctx.response;
  try {
    if (!(await deleteLineContact(ctx.db, ctx.line, contactId))) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete line contact error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
