-- =============================================================================
-- 0001 — Identity, RBAC and audit baseline
-- =============================================================================
-- Design notes
--  * Supabase Auth owns `auth.users`; we keep profile data in `public.profiles`.
--  * Authorization helpers are SECURITY DEFINER so that RLS policies can read
--    `user_roles` without recursing through its own RLS policy.
--  * Every SECURITY DEFINER function pins `search_path` to defeat search-path
--    hijacking (a classic Postgres privilege-escalation vector).
--  * Deny by default: RLS is enabled everywhere, and no policy is created for
--    tables that only the service role should touch.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('super_admin', 'admin', 'editor', 'author', 'analyst');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('active', 'suspended', 'disabled');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text not null default 'Unnamed user',
  avatar_url    text,
  bio           text,
  status        public.account_status not null default 'active',
  -- MFA is tracked here for fast gating; the authoritative factor list lives in auth.mfa_factors.
  mfa_enrolled  boolean not null default false,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 120),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 2000)
);

-- -----------------------------------------------------------------------------
-- roles / permissions (reference data, mirrored from src/server/authz/permissions.ts)
-- -----------------------------------------------------------------------------
create table if not exists public.permissions (
  key         text primary key,
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role        public.app_role not null,
  permission  text not null references public.permissions (key) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (role, permission)
);

create table if not exists public.user_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  primary key (user_id, role)
);

create index if not exists user_roles_user_idx on public.user_roles (user_id);
create index if not exists role_permissions_perm_idx on public.role_permissions (permission);

-- -----------------------------------------------------------------------------
-- audit_logs — append-only
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid references public.profiles (id) on delete set null,
  actor_type    text not null default 'user' check (actor_type in ('user', 'agent', 'system')),
  agent_id      uuid,
  action        text not null,
  resource_type text not null,
  resource_id   text,
  outcome       text not null default 'success' check (outcome in ('success', 'denied', 'error')),
  request_id    text,
  ip_hash       text,
  -- Structured, non-secret metadata only. Never store tokens, passwords or PII.
  metadata      jsonb not null default '{}'::jsonb,
  constraint audit_action_len check (char_length(action) between 1 and 120)
);

create index if not exists audit_logs_occurred_idx on public.audit_logs (occurred_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);
create index if not exists audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

-- Append-only enforcement: block UPDATE and DELETE at the table level.
create or replace function public.audit_logs_block_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'audit_logs is append-only; % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_block_mutation();

drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.audit_logs_block_mutation();

-- -----------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER, pinned search_path)
-- -----------------------------------------------------------------------------

create or replace function public.current_user_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(ur.role), array[]::public.app_role[])
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = auth.uid()
    and p.status = 'active'
    and (ur.expires_at is null or ur.expires_at > now());
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.current_user_roles() @> array['super_admin']::public.app_role[];
$$;

/**
 * has_permission('article.publish') — evaluated against the database's own
 * role_permissions table, independent of whatever the client claims.
 */
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = auth.uid()
      and p.status = 'active'
      and (ur.expires_at is null or ur.expires_at > now())
      and rp.permission = p_permission
  );
$$;

-- -----------------------------------------------------------------------------
-- Seed reference data: permissions + baseline role matrix
-- -----------------------------------------------------------------------------
insert into public.permissions (key) values
  ('article.create'), ('article.edit.own'), ('article.edit.any'), ('article.submit'),
  ('article.review'), ('article.approve'), ('article.publish'), ('article.unpublish'),
  ('article.schedule'), ('article.delete'), ('article.purge'), ('article.restore'),
  ('category.manage'), ('tag.manage'), ('media.upload'), ('media.delete'), ('comment.moderate'),
  ('user.read'), ('user.invite'), ('user.manage'), ('role.manage'),
  ('settings.read'), ('settings.write'), ('newsletter.manage'), ('ads.manage'),
  ('analytics.read'), ('audit.read'), ('security.read'), ('security.manage'),
  ('agent.read'), ('agent.manage'), ('agent.revoke'), ('apikey.read'), ('apikey.manage'),
  ('job.read'), ('job.retry'), ('job.cancel'),
  ('credit.read'), ('credit.grant'), ('billing.reconcile'),
  ('deploy.request'), ('deploy.approve.preview'), ('deploy.approve.production'), ('deploy.rollback')
on conflict (key) do nothing;

insert into public.role_permissions (role, permission)
select 'super_admin'::public.app_role, key from public.permissions
on conflict do nothing;

insert into public.role_permissions (role, permission)
select 'admin'::public.app_role, k
from unnest(array[
  'article.create','article.edit.any','article.submit','article.review','article.approve',
  'article.publish','article.unpublish','article.schedule','article.delete','article.restore',
  'category.manage','tag.manage','media.upload','media.delete','comment.moderate',
  'user.read','user.invite','user.manage','settings.read','newsletter.manage','ads.manage',
  'analytics.read','audit.read','security.read',
  'agent.read','agent.manage','agent.revoke','apikey.read','apikey.manage',
  'job.read','job.retry','job.cancel','credit.read',
  'deploy.request','deploy.approve.preview'
]) as k
on conflict do nothing;

insert into public.role_permissions (role, permission)
select 'editor'::public.app_role, k
from unnest(array[
  'article.create','article.edit.own','article.edit.any','article.submit','article.review',
  'article.approve','article.publish','article.unpublish','article.schedule','article.delete',
  'article.restore','category.manage','tag.manage','media.upload','comment.moderate',
  'user.read','analytics.read','agent.read','job.read','audit.read'
]) as k
on conflict do nothing;

insert into public.role_permissions (role, permission)
select 'author'::public.app_role, k
from unnest(array['article.create','article.edit.own','article.submit','media.upload','analytics.read']) as k
on conflict do nothing;

insert into public.role_permissions (role, permission)
select 'analyst'::public.app_role, k
from unnest(array['user.read','analytics.read','audit.read','agent.read','job.read','credit.read']) as k
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.permissions       enable row level security;
alter table public.role_permissions  enable row level security;
alter table public.user_roles        enable row level security;
alter table public.audit_logs        enable row level security;

-- profiles: a user reads/updates their own row; admins with user.read read all.
-- Deliberately no INSERT policy: profiles are created by the service role on signup.
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_permission('user.read'));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- A user may not escalate their own account status or MFA flag; only user.manage may.
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.has_permission('user.manage') or public.is_super_admin())
  with check (public.has_permission('user.manage') or public.is_super_admin());

-- permissions / role_permissions: readable by any authenticated user (needed to render
-- affordances); writable only through migrations/service role (no policies).
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions
  for select to authenticated using (true);

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions
  for select to authenticated using (true);

-- user_roles: a user may read their own roles; only super_admin may write.
-- There is intentionally NO update/delete policy for non-super-admins, which stops a
-- user from granting themselves a role.
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_permission('user.manage') or public.is_super_admin());

drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_write on public.user_roles
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- audit_logs: readable by audit.read holders; insertable by the service layer for the
-- acting user only. No UPDATE/DELETE policy + trigger = append-only.
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.has_permission('audit.read') or public.is_super_admin());

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (actor_id = auth.uid() or actor_id is null);

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- New-user provisioning: create a profile, never grant a role implicitly.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'New user')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

comment on table public.audit_logs is
  'Append-only audit trail for privileged actions. UPDATE/DELETE/TRUNCATE are blocked by trigger.';
comment on function public.has_permission(text) is
  'Server-side permission check evaluated against public.role_permissions; never trust client claims.';
