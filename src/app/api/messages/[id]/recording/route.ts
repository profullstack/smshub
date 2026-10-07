import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/request-user";
import { createServiceClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/lines/contacts";
import { lineApiKey } from "@/lib/lines/credentials";
import { recordingMp3Url } from "@/lib/voice/telnyx-voice";

type Params = { params: Promise<{ id: string }> };

/**
 * The MP3 of a recorded call in your inbox. Streams it through smshub (the
 * browser only talks to /api); ?download=1 saves it as a file.
 */
export async function GET(request: Request, { params }: Params) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Recording not found" }, { status: 404 });

  const db = createServiceClient();
  const { data: msg } = await db
    .from("messages")
    .select("id, kind, provider_message_id, recording_seconds, created_at, conversations!inner(user_id, phone_number_id)")
    .eq("id", id)
    .maybeSingle();
  const convo = (msg as { conversations?: { user_id: string; phone_number_id: string } } | null)?.conversations;
  if (!msg || !convo || convo.user_id !== who.user.userId || msg.kind !== "call" || msg.recording_seconds === null) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }
  const session = String(msg.provider_message_id ?? "").replace(/^call:/, "");

  const { data: line } = await db
    .from("phone_numbers")
    .select("managed, providers(type, api_key, metadata)")
    .eq("id", convo.phone_number_id)
    .maybeSingle();
  const row = line as { managed?: boolean; providers?: { type: string; api_key: string | null; metadata: unknown } } | null;
  const apiKey = lineApiKey(row?.providers ?? null, Boolean(row?.managed));
  const url = apiKey && session ? await recordingMp3Url(apiKey, session) : null;
  if (!url) return NextResponse.json({ error: "Telnyx no longer has this recording" }, { status: 404 });

  const audio = await fetch(url);
  if (!audio.ok || !audio.body) return NextResponse.json({ error: "Could not fetch the recording" }, { status: 502 });
  const name = `call-${String(msg.created_at).slice(0, 19).replace(/[:T]/g, "-")}.mp3`;
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(audio.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, max-age=300",
      ...(audio.headers.get("content-length") ? { "Content-Length": audio.headers.get("content-length")! } : {}),
    },
  });
}
