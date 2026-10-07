import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { createServiceClient } from "@/lib/supabase/server";
import { listLines } from "@/lib/lines/contacts";

/** Your numbers, each with its contacts book (name, cell, keypad digit, text prefix). */
export async function GET(request: Request) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  try {
    return NextResponse.json({ lines: await listLines(createServiceClient(), who.user.userId) });
  } catch (error) {
    console.error("List lines error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
