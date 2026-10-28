-- Key vault lockdown (restrictive; apply AFTER the 023 code is deployed).
--
-- 1. No new plaintext provider keys: a provider's api_key may only be written as
--    the managed or sealed placeholder; a non-Telnyx api_secret may only be
--    cleared. Legacy plaintext rows are left as they are until their owner
--    unlocks and they are sealed in place (POST /api/vault/migrate), or the
--    cutoff (LEGACY_KEY_MIGRATION=off) retires them. Telnyx api_secret holds the
--    account's public webhook-signing key, which is not a secret.
-- 2. CoinPay OAuth access/refresh tokens are never used by smshub: drop the
--    stored copies. "Connected" status keeps working (email/name/updated_at).
--
-- Idempotent: safe to re-run.

create or replace function public.providers_no_plaintext_keys()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.api_key is distinct from '__managed__' and new.api_key is distinct from '__sealed__'
     and (tg_op = 'INSERT' or new.api_key is distinct from old.api_key) then
    raise exception 'provider api keys must be sealed (smshub key vault)' using errcode = '22023';
  end if;
  if new.type::text <> 'telnyx' and new.api_secret is not null
     and (tg_op = 'INSERT' or new.api_secret is distinct from old.api_secret) then
    raise exception 'provider api secrets must be sealed (smshub key vault)' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists providers_no_plaintext_keys on public.providers;
create trigger providers_no_plaintext_keys
  before insert or update of api_key, api_secret on public.providers
  for each row execute function public.providers_no_plaintext_keys();

update public.coinpay_connections
   set access_token = null, refresh_token = null
 where access_token is not null or refresh_token is not null;
