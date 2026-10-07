import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { createServiceClient } from "@/lib/supabase/server";
import { loadLine, type Line } from "@/lib/lines/contacts";

/** The caller (session or API key) and their line `id`, or the response to send instead. */
export async function lineFor(request: Request, id: string) {
  const who = await resolveUser(request);
  if ("error" in who) return { response: NextResponse.json({ error: who.error }, { status: who.status }) };
  const db = createServiceClient();
  const line = await loadLine(db, who.user.userId, id);
  if (!line) return { response: NextResponse.json({ error: "Number not found" }, { status: 404 }) };
  return { db, line: line as Line, userId: who.user.userId };
}
