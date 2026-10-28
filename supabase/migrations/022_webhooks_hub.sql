-- Customer webhooks move onto @profullstack/webhooks 0.2.1.
--
-- The hub keeps endpoints and a durable delivery outbox (retries with backoff,
-- delivery log, auto-disable after 20 failures in a row). Its tables are the
-- package's own schemaSql('pg', 'hub_') so a later switch to postgresStore
-- needs no data change. smshub has no direct Postgres connection in the app
-- (only the Supabase URL + service role key), so src/lib/webhooks/supabase-store.ts
-- talks to these tables through PostgREST.
--
-- Only the server (service role) touches these tables: RLS on, no policies,
-- and the claim RPC is granted to service_role alone.
--
-- Idempotent: safe to re-run.

create table if not exists public.hub_webhook_endpoints (
  id text primary key,
  owner text not null,
  url text not null,
  secret text not null,
  events text not null default '["*"]',
  description text not null default '',
  enabled integer not null default 1,
  failures integer not null default 0,
  disabled_reason text,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists hub_webhook_endpoints_owner on public.hub_webhook_endpoints(owner);

create table if not exists public.hub_webhook_deliveries (
  id text primary key,
  endpoint_id text not null,
  owner text not null,
  event_id text not null,
  event_type text not null,
  payload text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_at bigint not null,
  last_status integer,
  last_error text,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists hub_webhook_deliveries_due on public.hub_webhook_deliveries(status, next_at);
create index if not exists hub_webhook_deliveries_endpoint on public.hub_webhook_deliveries(endpoint_id, created_at);
create index if not exists hub_webhook_deliveries_owner on public.hub_webhook_deliveries(owner, created_at);

alter table public.hub_webhook_endpoints enable row level security;
alter table public.hub_webhook_deliveries enable row level security;
revoke all on public.hub_webhook_endpoints from anon, authenticated;
revoke all on public.hub_webhook_deliveries from anon, authenticated;
grant all on public.hub_webhook_endpoints to service_role;
grant all on public.hub_webhook_deliveries to service_role;

-- Take up to p_limit due deliveries and lease them until p_lease_until, so two
-- app processes never send the same row (the package's postgresStore claim,
-- as an RPC because PostgREST cannot express FOR UPDATE SKIP LOCKED).
create or replace function public.claim_hub_webhook_deliveries(p_now bigint, p_limit integer, p_lease_until bigint)
returns setof public.hub_webhook_deliveries
language sql
volatile
set search_path to 'public'
as $function$
  update public.hub_webhook_deliveries
     set next_at = p_lease_until
   where id in (
     select id from public.hub_webhook_deliveries
      where status = 'pending' and next_at <= p_now
      order by next_at
      limit p_limit
      for update skip locked
   )
  returning *;
$function$;
revoke execute on function public.claim_hub_webhook_deliveries(bigint, integer, bigint) from public, anon, authenticated;
grant execute on function public.claim_hub_webhook_deliveries(bigint, integer, bigint) to service_role;

-- number.expiring is sent once per paid-until date: renewing moves expires_at,
-- so the next period gets its own reminder.
alter table public.phone_numbers add column if not exists expiry_notified_for timestamptz;

-- The old user_webhooks table (004_future_features) had a create/delete API but
-- no settings page, and prod held 0 rows when the hub replaced it (2026-10-28).
-- Refuse to drop it if anyone has added a row since, so nothing is lost silently.
do $$
begin
  if to_regclass('public.user_webhooks') is not null then
    if exists (select 1 from public.user_webhooks) then
      raise exception 'user_webhooks has rows: migrate them into hub_webhook_endpoints before dropping it';
    end if;
    drop table public.user_webhooks;
  end if;
end $$;

notify pgrst, 'reload schema';
