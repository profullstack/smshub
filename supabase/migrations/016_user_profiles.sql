-- The shared @profullstack/profile fields (email, first_name, last_name,
-- company_domain, job_title, linkedin_url) in the package's own table,
-- keyed by auth.users.id. smshub has no per-user profiles table;
-- contacts.company is CRM data about other people and stays as it is.
--
-- Server-only: RLS on with NO anon/authenticated policies, so only the
-- service role (src/lib/profile.ts) reads or writes it.
--
-- dev2 self-hosted Supabase has no automatic migration step. Apply by hand:
--   docker exec -i smshub-dev-supabase-db psql -U postgres -d postgres -1 < this file
--   then: notify pgrst, 'reload schema';
-- Additive only. No backfill: no name columns exist for account holders.

create table if not exists "user_profiles" (
  "user_id" uuid primary key references auth.users(id) on delete cascade,
  "email" text,
  "first_name" text,
  "last_name" text,
  "company_domain" text,
  "job_title" text,
  "linkedin_url" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index if not exists "user_profiles_email" on "user_profiles" (lower("email"));
create index if not exists "user_profiles_company_domain" on "user_profiles" ("company_domain");

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon, authenticated;
