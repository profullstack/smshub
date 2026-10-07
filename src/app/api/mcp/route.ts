import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/request-user";
import { handleRpc } from "@/lib/mcp/server";
import { getSiteUrl } from "@/lib/site-url";

/**
 * MCP over streamable HTTP. Authenticate with X-API-Key (or Authorization:
 * Bearer smshub_...). Batches are accepted; every reply is plain JSON.
 */
export async function POST(request: Request) {
  const who = await resolveUser(request, { allowSession: false });
  if ("error" in who) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: who.error } },
      { status: who.status, headers: { "WWW-Authenticate": 'Bearer realm="smshub", error="invalid_token"' } }
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const ctx = { db: createServiceClient(), user: who.user, siteUrl: getSiteUrl(), signal: request.signal };
  const msgs = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(msgs.map((m) => handleRpc(ctx, m)))).filter((r) => r !== null);
  if (replies.length === 0) return new Response(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0]);
}

export async function GET() {
  // No server-initiated stream; clients use POST only.
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
