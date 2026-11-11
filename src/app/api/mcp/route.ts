import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUser, type ResolveResult } from "@/lib/request-user";
import { handleRpc } from "@/lib/mcp/server";
import { getSiteUrl } from "@/lib/site-url";
import { ACCESS_PREFIX, CORS_HEADERS, resolveAccessToken, resourceMetadataUrl } from "@/lib/mcp-oauth";

/**
 * MCP over streamable HTTP. Authenticate with either:
 *   - an OAuth 2.1 access token (Authorization: Bearer smshub_oat_...), which
 *     MCP clients such as Claude and ChatGPT get on their own through
 *     /.well-known/oauth-protected-resource -> /oauth/authorize, or
 *   - an API key: X-API-Key, or Authorization: Bearer smshub_<hex>.
 * No credential, or a bad one, is HTTP 401 with WWW-Authenticate naming the
 * protected-resource metadata (MCP authorization spec / RFC 9728).
 * Batches are accepted; every reply is plain JSON.
 */
async function caller(request: Request): Promise<ResolveResult & { presented: boolean }> {
  const auth = (request.headers.get("authorization") ?? "").trim();
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (m && m[1].startsWith(ACCESS_PREFIX)) {
    const user = await resolveAccessToken(createServiceClient(), m[1]);
    return user ? { user, presented: true } : { error: "Invalid or expired access token", status: 401, presented: true };
  }
  const presented = Boolean(auth || request.headers.get("x-api-key"));
  return { ...(await resolveUser(request, { allowSession: false })), presented };
}

function unauthorized(message: string, presented: boolean) {
  const challenge = [`Bearer resource_metadata="${resourceMetadataUrl()}"`, 'scope="mcp"'];
  if (presented) challenge.push('error="invalid_token"', `error_description="${message.replace(/"/g, "'")}"`);
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: presented ? message : "Sign in: connect with OAuth, or send an smshub API key (X-API-Key)" } },
    {
      status: 401,
      headers: {
        ...CORS_HEADERS,
        "WWW-Authenticate": challenge.join(", "),
        "access-control-expose-headers": "www-authenticate",
        "cache-control": "no-store",
      },
    }
  );
}

export async function POST(request: Request) {
  const who = await caller(request);
  if ("error" in who) {
    if (who.status === 401) return unauthorized(who.error, who.presented);
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: who.error } }, { status: who.status, headers: CORS_HEADERS });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS_HEADERS });
  }
  const ctx = { db: createServiceClient(), user: who.user, siteUrl: getSiteUrl(), signal: request.signal };
  const msgs = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(msgs.map((m) => handleRpc(ctx, m)))).filter((r) => r !== null);
  if (replies.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  // No server-initiated stream; clients use POST only. Unauthenticated probes
  // still get the 401 challenge so discovery works from a GET too.
  const who = await caller(request);
  if ("error" in who && who.status === 401) return unauthorized(who.error, who.presented);
  return new Response("Method Not Allowed", { status: 405, headers: { ...CORS_HEADERS, Allow: "POST" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
