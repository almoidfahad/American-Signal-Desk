-- =============================================================================
-- Local test harness — the minimum of Supabase's environment the migrations need
-- =============================================================================
-- This is NOT part of the deployed schema. It reproduces the parts of a Supabase
-- project that the migrations depend on, so migrations and RLS policies can be tested
-- against a real PostgreSQL without touching a hosted project:
--
--   * roles: anon, authenticated, service_role
--   * schema auth with auth.users and auth.uid()
--   * the `request.jwt.claims` GUC convention PostgREST uses
--
-- auth.uid() here reads the same GUC PostgREST sets, so `set_config('request.jwt.claims',
-- '{"sub":"<uuid>"}', true)` behaves exactly like a real signed-in request. That is what
-- makes the RLS assertions meaningful rather than decorative.
-- =============================================================================

-- Roles -----------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Table privileges — reproducing Supabase's defaults
-- -----------------------------------------------------------------------------
-- On Supabase, `anon` and `authenticated` already hold table privileges in `public`;
-- Row Level Security — not GRANT — is what actually restricts access. Without this,
-- every test would fail with "permission denied" and we would be testing the GRANT
-- system instead of the RLS policies, which is the whole point of the suite.
--
-- Default privileges are used so tables created later by the migrations inherit them.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- auth schema ------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  aud                text default 'authenticated',
  role               text default 'authenticated',
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Mirrors Supabase's auth.uid(): reads the sub claim from the request JWT claims.
-- Note: empty strings must be treated as "absent". A plain coalesce() does not do that —
-- '' is not NULL, so it wins and the whole expression evaluates to NULL. That subtlety
-- silently made every RLS policy think no user was signed in.
create or replace function auth.uid()
returns uuid
language plpgsql
stable
as $$
declare
  from_claim text;
  from_json text;
begin
  from_claim := nullif(current_setting('request.jwt.claim.sub', true), '');
  if from_claim is not null then
    return from_claim::uuid;
  end if;

  from_json := nullif(current_setting('request.jwt.claims', true), '');
  if from_json is not null then
    return nullif(from_json::jsonb ->> 'sub', '')::uuid;
  end if;

  return null;
exception when others then
  return null;
end;
$$;

create or replace function auth.role()
returns text
language plpgsql
stable
as $$
declare
  from_claim text;
  from_json text;
begin
  from_claim := nullif(current_setting('request.jwt.claim.role', true), '');
  if from_claim is not null then
    return from_claim;
  end if;
  from_json := nullif(current_setting('request.jwt.claims', true), '');
  if from_json is null then
    return null;
  end if;
  return from_json::jsonb ->> 'role';
exception when others then
  return null;
end;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- pgcrypto is used by the migrations for gen_random_uuid().
--
-- On Supabase it is always available. In a minimal local build the extension files may be
-- absent, but PostgreSQL 13+ has gen_random_uuid() built into core, so the migrations work
-- either way. Try the extension, fall back to the built-in and say which was used — a
-- silent fallback would hide a real difference between here and production.
do $$
begin
  create extension if not exists "pgcrypto";
  raise notice 'pgcrypto installed (matches Supabase)';
exception when others then
  raise notice 'pgcrypto unavailable; using built-in gen_random_uuid() (PostgreSQL 13+)';
end $$;
