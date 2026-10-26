-- Lock down function defaults and privileged columns (2026-10-26 fleet audit).
--
-- The four SECURITY DEFINER helpers (is_org_admin, is_org_member,
-- is_team_member, is_team_owner) are safe: they only answer for auth.uid()
-- and the RLS policies need them, so they keep their grants.
--
-- Fixed here:
-- * default privileges granted EXECUTE on every new function to anon and
--   authenticated;
-- * a signed-in user could rewrite telnyx_number_id on their own managed
--   number. The expiry job releases whatever Telnyx id is on the row, so a
--   lapsing number pointed at another customer's id would release theirs.
--   released_at is server-only as well, and provider_id must be one of the
--   caller's own providers;
-- * direct inserts into phone_numbers skipped the API's provider check and
--   BYO plan limit; numbers are now added only through the API (service role);
-- * organizations.plan was writable by org admins (display only today, the
--   real plan comes from managed numbers, but it is the server's field).

-- Trigger and event-trigger functions are never RPCs.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- New functions are not executable by PUBLIC/anon/authenticated by default.
-- A new function the browser calls (or an RLS policy uses) needs an explicit
-- GRANT EXECUTE ... TO anon, authenticated.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- current_user is anon/authenticated only for direct (PostgREST) requests:
-- the server runs as service_role, definer functions as their owner.
create or replace function public.phone_numbers_guard_managed()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    -- POST /api/phone-numbers (service role) checks the provider, the plan
    -- limit and that the number is not taken; a direct insert skipped all three.
    if tg_op = 'INSERT' then
      raise exception 'phone numbers are added through the API';
    end if;
    if tg_op = 'UPDATE' and (new.managed is distinct from old.managed
        or new.expires_at is distinct from old.expires_at
        or new.status is distinct from old.status
        or new.number is distinct from old.number
        or new.telnyx_number_id is distinct from old.telnyx_number_id
        or new.released_at is distinct from old.released_at) then
      raise exception 'managed number fields are read-only';
    end if;
    -- RLS on providers shows the caller only their own rows.
    if new.provider_id is not null
       and new.provider_id is distinct from old.provider_id
       and not exists (select 1 from public.providers p where p.id = new.provider_id) then
      raise exception 'unknown provider';
    end if;
  end if;
  return new;
end $function$;
revoke execute on function public.phone_numbers_guard_managed() from public, anon, authenticated;

create or replace function public.organizations_pin_plan()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
    else
      new.plan := old.plan;
    end if;
  end if;
  return new;
end $function$;
revoke execute on function public.organizations_pin_plan() from public, anon, authenticated;

drop trigger if exists organizations_pin_plan on public.organizations;
create trigger organizations_pin_plan
  before insert or update on public.organizations
  for each row execute function public.organizations_pin_plan();
