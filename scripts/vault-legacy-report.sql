-- How many bring-your-own provider rows still hold plaintext keys (seal_version 0).
-- Run: docker exec -i smshub-dev-supabase-db psql -U postgres -d postgres < scripts/vault-legacy-report.sql
select
  count(*) filter (where api_key not in ('__managed__', '__sealed__'))            as legacy_plaintext_rows,
  count(distinct user_id) filter (where api_key not in ('__managed__', '__sealed__')) as legacy_users,
  count(*) filter (where seal_version >= 2)                                        as sealed_rows,
  (select count(*) from public.user_vaults)                                         as vaults
from public.providers;
