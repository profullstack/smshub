// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";

// In-memory tables behind a query builder with just the calls lib/mcp-oauth.ts
// and lib/api-auth.ts make. Ported from profullstack/threatcrush#450.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let cookieUser: string | null = null;
const bearerSessions: Record<string, string> = {};

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "insert" | "update" = "select";
  let payload: Row = {};
  const rows = () => (tables[table] ??= []);
  const run = (): Row[] => {
    if (op === "insert") {
      const row: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), revoked_at: null, used_at: null, last_used_at: null, ...payload };
      rows().push(row);
      return [row];
    }
    const matched = rows().filter((r) => filters.every((f) => f(r)));
    if (op === "update") for (const r of matched) Object.assign(r, payload);
    return matched;
  };
  const b = {
    insert(p: Row) { op = "insert"; payload = p; return Promise.resolve({ data: null, error: (run(), null) }); },
    update(p: Row) { op = "update"; payload = p; return b; },
    select() { return b; },
    order() { return b; },
    eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return b; },
    is(col: string, val: unknown) { filters.push((r) => (r[col] ?? null) === val); return b; },
    gt(col: string, val: string) { filters.push((r) => String(r[col]) > val); return b; },
    async maybeSingle() { const [r] = run(); return { data: r ?? null, error: null }; },
    async single() { const [r] = run(); return r ? { data: r, error: null } : { data: null, error: { message: "no rows" } }; },
    then(resolve: (v: { data: Row[]; error: null }) => void) { resolve({ data: run(), error: null }); },
  };
  return b;
}

const admin = {
  from: (t: string) => builder(t),
  auth: {
    getUser: async (jwt: string) => ({ data: { user: bearerSessions[jwt] ? { id: bearerSessions[jwt] } : null } }),
    admin: { getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@example.com` } } }) },
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => admin,
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: cookieUser ? { id: cookieUser, email: `${cookieUser}@example.com` } : null } }) },
  }),
}));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: () => "https://smshub.dev" }));

const { POST: register } = await import("../register/route");
const { POST: token } = await import("../token/route");
const { POST: decide } = await import("../authorize/route");
const { POST: revoke } = await import("../revoke/route");
const { POST: mcp, GET: mcpGet } = await import("../../mcp/route");
const { GET: resourceMeta } = await import("../../../.well-known/oauth-protected-resource/route");
const { GET: asMeta } = await import("../../../.well-known/oauth-authorization-server/route");
const oauth = await import("@/lib/mcp-oauth");
const { hashApiKey } = await import("@/lib/api-auth");

const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const CHATGPT = "https://chatgpt.com/connector_platform_oauth_redirect";
const json = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const form = (url: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body).toString(),
  });
const tokenReq = (body: Record<string, string>) => form("https://smshub.dev/api/oauth/token", body);
const rpc = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://smshub.dev/api/mcp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

async function newClient(redirect_uris = [CLAUDE, CHATGPT, "http://localhost:33418/callback"]) {
  const res = await register(json("https://smshub.dev/api/oauth/register", { client_name: "Claude", redirect_uris }));
  expect(res.status).toBe(201);
  return (await res.json()) as { client_id: string; token_endpoint_auth_method: string };
}

/** The consent page's form POST, as the signed-in user (cookie session). */
async function authorize(clientId: string, challenge: string, redirect = CLAUDE) {
  cookieUser = "user-1";
  const res = await decide(
    form(
      "https://smshub.dev/api/oauth/authorize",
      {
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirect,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "xyz",
        resource: "https://smshub.dev/api/mcp",
        approve: "true",
      },
      { origin: "https://smshub.dev" }
    )
  );
  expect(res.status).toBe(303);
  const u = new URL(res.headers.get("location")!);
  expect(u.searchParams.get("state")).toBe("xyz");
  expect(u.searchParams.get("iss")).toBe("https://smshub.dev");
  return u.searchParams.get("code")!;
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(bearerSessions)) delete bearerSessions[k];
  cookieUser = null;
});

describe("discovery", () => {
  it("serves protected-resource and authorization-server metadata", async () => {
    const r = await resourceMeta().json();
    expect(r).toMatchObject({ resource: "https://smshub.dev/api/mcp", authorization_servers: ["https://smshub.dev"] });
    const a = await asMeta().json();
    expect(a).toMatchObject({
      issuer: "https://smshub.dev",
      authorization_endpoint: "https://smshub.dev/oauth/authorize",
      token_endpoint: "https://smshub.dev/api/oauth/token",
      registration_endpoint: "https://smshub.dev/api/oauth/register",
      code_challenge_methods_supported: ["S256"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });
});

describe("MCP route auth", () => {
  it("answers no credential with 401 + resource_metadata", async () => {
    for (const res of [await mcp(rpc({ jsonrpc: "2.0", id: 1, method: "initialize" })), await mcpGet(new Request("https://smshub.dev/api/mcp"))]) {
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain('Bearer resource_metadata="https://smshub.dev/.well-known/oauth-protected-resource"');
    }
  });

  it("answers a bad OAuth token or API key with 401 invalid_token", async () => {
    const a = await mcp(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { authorization: "Bearer smshub_oat_nope" }));
    expect(a.status).toBe(401);
    expect(a.headers.get("www-authenticate")).toContain('error="invalid_token"');
    const b = await mcp(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "x-api-key": "smshub_" + "0".repeat(64) }));
    expect(b.status).toBe(401);
    expect(b.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("still accepts an existing API key (X-API-Key and Bearer)", async () => {
    const key = "smshub_" + "a".repeat(64);
    tables.api_keys = [{ id: "k1", user_id: "user-9", key_hash: hashApiKey(key) }];
    const heads: Record<string, string>[] = [{ "x-api-key": key }, { authorization: `Bearer ${key}` }];
    for (const h of heads) {
      const res = await mcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, h));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.tools.length).toBeGreaterThan(10);
      expect(body.result).toMatchObject({ resultType: "complete", cacheScope: "private" });
    }
  });
});

describe("registration", () => {
  it("registers a public client for Claude, ChatGPT and loopback", async () => {
    const c = await newClient();
    expect(c.client_id).toMatch(/^smshub_client_/);
    expect(c.token_endpoint_auth_method).toBe("none");
  });

  it("refuses confidential clients and bad redirects", async () => {
    const conf = await register(json("https://smshub.dev/api/oauth/register", { redirect_uris: [CLAUDE], token_endpoint_auth_method: "client_secret_basic" }));
    expect(conf.status).toBe(400);
    const bad = await register(json("https://smshub.dev/api/oauth/register", { redirect_uris: ["http://evil.com/cb"] }));
    expect((await bad.json()).error).toBe("invalid_redirect_uri");
  });
});

describe("authorize", () => {
  it("refuses a cookie-session POST from another origin", async () => {
    const { client_id } = await newClient();
    cookieUser = "user-1";
    const res = await decide(
      form(
        "https://smshub.dev/api/oauth/authorize",
        { response_type: "code", client_id, redirect_uri: CLAUDE, code_challenge: pkce().challenge, code_challenge_method: "S256", approve: "true" },
        { origin: "https://evil.example" }
      )
    );
    expect(res.status).toBe(401);
  });

  it("accepts a Bearer session as JSON and answers { redirect }", async () => {
    const { client_id } = await newClient();
    bearerSessions["jwt-1"] = "user-2";
    const res = await decide(
      json(
        "https://smshub.dev/api/oauth/authorize",
        { response_type: "code", client_id, redirect_uri: CHATGPT, code_challenge: pkce().challenge, code_challenge_method: "S256", state: "s", approve: true },
        { authorization: "Bearer jwt-1" }
      )
    );
    const u = new URL((await res.json()).redirect);
    expect(u.origin + u.pathname).toBe(CHATGPT);
    expect(u.searchParams.get("code")).toBeTruthy();
    expect(u.searchParams.get("iss")).toBe("https://smshub.dev");
  });

  it("deny returns access_denied to the client", async () => {
    const { client_id } = await newClient();
    cookieUser = "user-1";
    const res = await decide(
      form(
        "https://smshub.dev/api/oauth/authorize",
        { response_type: "code", client_id, redirect_uri: CLAUDE, code_challenge: pkce().challenge, code_challenge_method: "S256", state: "q", approve: "false" },
        { origin: "https://smshub.dev" }
      )
    );
    const u = new URL(res.headers.get("location")!);
    expect(u.searchParams.get("error")).toBe("access_denied");
    expect(u.searchParams.get("code")).toBeNull();
  });

  it("unknown client is an error, never a redirect", async () => {
    cookieUser = "user-1";
    const res = await decide(
      form("https://smshub.dev/api/oauth/authorize", { client_id: "nope", redirect_uri: CLAUDE, approve: "true" }, { origin: "https://smshub.dev" })
    );
    expect(res.status).toBe(400);
  });
});

describe("token", () => {
  it("full flow: code + PKCE -> tokens -> MCP tools/list -> refresh rotates -> revoke", async () => {
    const { client_id } = await newClient();
    const { verifier, challenge } = pkce();

    const code = await authorize(client_id, challenge);
    const bad = await token(tokenReq({ grant_type: "authorization_code", code, redirect_uri: CLAUDE, client_id, code_verifier: pkce().verifier }));
    expect((await bad.json()).error).toBe("invalid_grant");

    const code2 = await authorize(client_id, challenge);
    const res = await token(tokenReq({ grant_type: "authorization_code", code: code2, redirect_uri: CLAUDE, client_id, code_verifier: verifier }));
    expect(res.status).toBe(200);
    const t = await res.json();
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "mcp" });
    expect(t.access_token.startsWith("smshub_oat_")).toBe(true);
    expect(JSON.stringify(tables.oauth_tokens)).not.toContain(t.access_token);

    const replay = await token(tokenReq({ grant_type: "authorization_code", code: code2, redirect_uri: CLAUDE, client_id, code_verifier: verifier }));
    expect(replay.status).toBe(400);

    const listed = await mcp(rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, { authorization: `Bearer ${t.access_token}` }));
    expect(listed.status).toBe(200);
    const tools = (await listed.json()).result.tools as { name: string; title: string; annotations: Record<string, unknown> }[];
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
      expect(typeof tool.annotations.destructiveHint).toBe("boolean");
      expect(typeof tool.annotations.openWorldHint).toBe("boolean");
    }
    expect(await oauth.resolveAccessToken(admin as never, t.access_token)).toMatchObject({ userId: "user-1", via: "oauth" });

    const r2 = await (await token(tokenReq({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id }))).json();
    expect(r2.access_token).not.toBe(t.access_token);
    expect(await oauth.resolveAccessToken(admin as never, t.access_token)).toBeNull();
    expect((await token(tokenReq({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id }))).status).toBe(400);

    expect((await revoke(form("https://smshub.dev/api/oauth/revoke", { token: r2.refresh_token }))).status).toBe(200);
    expect(await oauth.resolveAccessToken(admin as never, r2.access_token)).toBeNull();
  });

  it("loopback redirects work on another port (Claude Code)", async () => {
    const { client_id } = await newClient();
    const { verifier, challenge } = pkce();
    const cb = "http://localhost:50999/callback";
    const code = await authorize(client_id, challenge, cb);
    const res = await token(tokenReq({ grant_type: "authorization_code", code, redirect_uri: cb, client_id, code_verifier: verifier }));
    expect(res.status).toBe(200);
  });

  it("rejects unknown grant types", async () => {
    expect((await (await token(tokenReq({ grant_type: "password" }))).json()).error).toBe("unsupported_grant_type");
  });
});
