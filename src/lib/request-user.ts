/**
 * Who is calling: an API key (X-API-Key, or Authorization: Bearer smshub_...)
 * for the v1 API, MCP and CLI, or the browser session for the web app.
 */

import { authenticateApiKey, checkApiKeyRateLimit } from "@/lib/api-auth";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export interface RequestUser {
  userId: string;
  email: string | null;
  via: "api-key" | "session";
}

export type ResolveResult = { user: RequestUser } | { error: string; status: number };

function bearerApiKey(request: Request): string | null {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(smshub_[0-9a-f]{64})$/i.exec(h.trim());
  return m ? m[1] : null;
}

export async function resolveUser(request: Request, opts: { allowSession?: boolean } = {}): Promise<ResolveResult> {
  const key = request.headers.get("x-api-key") || bearerApiKey(request);
  if (key) {
    const headers = new Headers(request.headers);
    headers.set("X-API-Key", key);
    const auth = await authenticateApiKey(new Request(request.url, { headers }));
    if (!auth) return { error: "Invalid API key", status: 401 };
    const rl = checkApiKeyRateLimit(auth.keyId);
    if (!rl.allowed) return { error: "Rate limit exceeded", status: 429 };
    const { data } = await createServiceClient().auth.admin.getUserById(auth.userId);
    return { user: { userId: auth.userId, email: data?.user?.email ?? null, via: "api-key" } };
  }
  if (opts.allowSession === false) return { error: "Missing API key (X-API-Key header)", status: 401 };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };
  return { user: { userId: user.id, email: user.email ?? null, via: "session" } };
}
