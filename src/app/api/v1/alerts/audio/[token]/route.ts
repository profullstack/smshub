/**
 * The WAV an alert call plays, fetched by Telnyx's media loader.
 *
 * Unauthenticated on purpose: Telnyx fetches it with no credential of ours.
 * What stands in for auth is the path — an HMAC of the call's id under a
 * server secret — plus a ten-minute lifetime, so a URL is unguessable and
 * stops working shortly after the call it belonged to. The body is speech
 * this deployment just synthesized on the c0mpute network; there is nothing
 * in it that is not about to be read down a phone line anyway.
 */

import { NextResponse, type NextRequest } from "next/server";
import { readAudio, TTL_MS } from "@/lib/voice/kokoro";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const wav = await readAudio(token);
  if (!wav) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(wav), {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "content-length": String(wav.length),
      "cache-control": `private, max-age=${Math.floor(TTL_MS / 1000)}`,
    },
  });
}
