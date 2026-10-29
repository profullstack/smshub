-- Sign in with CoinPay. CoinPay is the fleet's master account.
--
-- A coinpay_connections row is now also a way in: the account it belongs to
-- can sign in with that CoinPay identity. It is bound by the CoinPay `sub`
-- (coinpay_user_id), never by email: CoinPay does not verify addresses, so the
-- email on the row is contact information only and never reaches auth.users.

-- One smshub account per CoinPay identity (11 rows on 2026-10-29, all distinct).
create unique index if not exists coinpay_connections_coinpay_user_id_key
  on public.coinpay_connections (coinpay_user_id);

-- Disconnecting goes through POST /api/coinpay/disconnect, which refuses when
-- CoinPay is the only way into the account. A direct PostgREST delete would
-- skip that check and could lock the account out.
drop policy if exists "Users can delete own CoinPay connection" on public.coinpay_connections;

-- One row per authorization request in flight, keyed by sha256(state). The
-- PKCE verifier and nonce never leave the server; the callback deletes the
-- row, so a state works once. Server-only.
create table if not exists public.coinpay_oauth_pending (
  id           text primary key,
  verifier     text not null,
  nonce        text not null,
  mode         text not null check (mode in ('login', 'connect')),
  next_path    text not null,
  link_user_id uuid,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists coinpay_oauth_pending_expires_idx on public.coinpay_oauth_pending (expires_at);
alter table public.coinpay_oauth_pending enable row level security;
revoke all on public.coinpay_oauth_pending from anon, authenticated;
