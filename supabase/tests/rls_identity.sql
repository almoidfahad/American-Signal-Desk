-- =============================================================================
-- RLS / authorization tests for migration 0001
-- =============================================================================
-- Run with:  npm run test:db        (needs DATABASE_URL pointing at a real database)
--
-- These are real assertions, not documentation. Each block raises an exception on
-- failure, and the whole script runs inside a transaction that is ROLLED BACK, so it
-- is safe to run against a staging database. It must NOT be run against production,
-- which is why it is not wired into the deploy pipeline.
--
-- Everything runs as the `authenticated` role with a forged JWT subject, which is
-- exactly what PostgREST does for a logged-in user. That is the only way to prove
-- RLS actually blocks things, as opposed to merely being enabled.
-- =============================================================================

begin;

create schema if not exists test_util;

-- Fixtures -------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'super@asd.test',  'x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'editor@asd.test', 'x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'author@asd.test', 'x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'super_admin'),
  ('22222222-2222-2222-2222-222222222222', 'editor'),
  ('33333333-3333-3333-3333-333333333333', 'author')
on conflict do nothing;

-- Helper: impersonate a user exactly the way PostgREST does.
create or replace function test_util.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function test_util.assert_true(p_condition boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Permission function matches the role matrix
-- ---------------------------------------------------------------------------
select test_util.act_as('22222222-2222-2222-2222-222222222222'); -- editor
select test_util.assert_true(public.has_permission('article.publish'), 'editor should hold article.publish');
select test_util.assert_true(not public.has_permission('role.manage'), 'editor must NOT hold role.manage');
select test_util.assert_true(not public.has_permission('article.purge'), 'editor must NOT hold article.purge');

select test_util.act_as('33333333-3333-3333-3333-333333333333'); -- author
select test_util.assert_true(public.has_permission('article.create'), 'author should hold article.create');
select test_util.assert_true(not public.has_permission('article.publish'), 'author must NOT publish');
select test_util.assert_true(not public.has_permission('article.approve'), 'author must NOT approve');
select test_util.assert_true(not public.is_super_admin(), 'author is not super admin');

-- ---------------------------------------------------------------------------
-- 2. Unauthenticated access is denied
-- ---------------------------------------------------------------------------
set local role anon;
select test_util.assert_true(not public.has_permission('article.publish'), 'anon must hold no permissions');
select test_util.assert_true(
  (select count(*) from public.audit_logs) = 0,
  'anon must not read audit logs'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3. An author cannot grant themselves a role (privilege escalation)
-- ---------------------------------------------------------------------------
select test_util.act_as('33333333-3333-3333-3333-333333333333');
do $$
begin
  begin
    insert into public.user_roles (user_id, role) values (auth.uid(), 'super_admin');
    raise exception 'ASSERTION FAILED: author was able to insert a super_admin role';
  exception
    when insufficient_privilege or check_violation or others then
      -- Expected: RLS rejects the insert. Distinguish a real policy block from our own raise.
      if sqlerrm like 'ASSERTION FAILED%' then
        raise;
      end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A user cannot read another user's profile
-- ---------------------------------------------------------------------------
select test_util.act_as('33333333-3333-3333-3333-333333333333');
select test_util.assert_true(
  (select count(*) from public.profiles) = 1,
  'author should only see their own profile'
);

select test_util.act_as('22222222-2222-2222-2222-222222222222'); -- editor holds user.read
select test_util.assert_true(
  (select count(*) from public.profiles) >= 3,
  'editor with user.read should see all profiles'
);

-- ---------------------------------------------------------------------------
-- 5. Audit log is append-only
-- ---------------------------------------------------------------------------
insert into public.audit_logs (actor_id, action, resource_type, resource_id)
values ('11111111-1111-1111-1111-111111111111', 'test.append', 'test', 'x');

select test_util.act_as('22222222-2222-2222-2222-222222222222');
select test_util.assert_true((select count(*) from public.audit_logs) >= 1, 'editor with audit.read should read audit log');

do $$
begin
  begin
    update public.audit_logs set action = 'tampered' where action = 'test.append';
    raise exception 'ASSERTION FAILED: audit_logs UPDATE was allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  end;
end $$;

do $$
begin
  begin
    delete from public.audit_logs where action = 'test.append';
    raise exception 'ASSERTION FAILED: audit_logs DELETE was allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Expired role grants stop conferring permissions
-- ---------------------------------------------------------------------------
update public.user_roles set expires_at = now() - interval '1 second'
where user_id = '22222222-2222-2222-2222-222222222222';

select test_util.act_as('22222222-2222-2222-2222-222222222222');
select test_util.assert_true(not public.has_permission('article.publish'), 'expired role must not grant permissions');

select 'RLS suite passed' as result;
rollback;
