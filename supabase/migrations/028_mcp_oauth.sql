-- OAuth 2.1 for the MCP server at /api/mcp (claude.ai connectors, ChatGPT
-- apps, Claude Code), per the MCP authorization spec. Same shape as
-- ThreatCrush (profullstack/threatcrush#450).
--
--   oauth_clients  dynamic client registration (RFC 7591): public clients only
--                  (token_endpoint_auth_method none), so there is no secret.
--   oauth_codes    authorization codes: single use, ~5 minutes, bound to the
--                  client, redirect_uri, PKCE S256 challenge and the user.
--   oauth_tokens   one row per grant: the current access and refresh token
--                  hashes. A refresh rotates both in place; revoked_at ends it.
--
-- Only SHA-256 hashes of codes and tokens are stored. Service role only: RLS
-- on, no policies, every read and write goes through src/lib/mcp-oauth.ts.

create table if not exists public.oauth_clients (
  client_id     text primary key,
  client_name   text not null check (length(client_name) between 1 and 200),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 20),
  client_uri    text,
  logo_uri      text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create table if not exists public.oauth_codes (
  code_hash      text primary key,
  client_id      text not null references public.oauth_clients(client_id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,
  scope          text not null default 'mcp',
  resource       text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz
);
create index if not exists oauth_codes_expires_idx on public.oauth_codes (expires_at);

create table if not exists public.oauth_tokens (
  id                 uuid primary key default gen_random_uuid(),
  client_id          text not null references public.oauth_clients(client_id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  scope              text not null default 'mcp',
  access_hash        text not null unique,
  refresh_hash       text not null unique,
  access_expires_at  timestamptz not null,
  refresh_expires_at timestamptz not null,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz,
  revoked_at         timestamptz
);
create index if not exists oauth_tokens_user_idx on public.oauth_tokens (user_id);

alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_tokens enable row level security;
revoke all on public.oauth_clients, public.oauth_codes, public.oauth_tokens from anon, authenticated;
