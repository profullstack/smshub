-- Key vault (additive; apply BEFORE deploying the code that uses it).
--
-- Bring-your-own provider keys were stored in plaintext (providers.api_key /
-- api_secret). From now on they are sealed under a data key only the user can
-- open (passphrase or recovery key, in their browser or CLI): see
-- src/lib/vault/. The server keeps an unlocked data key in memory only.
--
--   user_vaults.seal          public vault record: KDF params, wrapped data key,
--                             recovery-wrapped data key, key check. Opens nothing
--                             without the passphrase or recovery key.
--   providers.seal_version    0 = legacy plaintext, 2 = sealed
--   providers.sealed_credentials  AES-256-GCM blob {api_key, api_secret}
--   providers.api_key_hint    masked key for display (first 8 + last 4)
--
-- Idempotent: safe to re-run.

create table if not exists public.user_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seal jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_vaults enable row level security;
-- Writes go through the API (service role). Owners may read their own record.
drop policy if exists "Users read their own vault" on public.user_vaults;
create policy "Users read their own vault" on public.user_vaults
  for select using (auth.uid() = user_id);
revoke insert, update, delete, truncate on public.user_vaults from anon, authenticated;

alter table public.providers add column if not exists seal_version smallint not null default 0;
alter table public.providers add column if not exists sealed_credentials jsonb;
alter table public.providers add column if not exists api_key_hint text;

-- CoinPay OAuth tokens are never used after "Sign in with CoinPay"; stop requiring one.
alter table public.coinpay_connections alter column access_token drop not null;
