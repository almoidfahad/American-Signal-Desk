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
-- The suites switch into the `authenticated` role to exercise RLS, so that role must be
-- able to call the helper functions. Safe: test_util lives only in this throwaway database.
grant usage on schema test_util to authenticated, anon;

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

-- Returns to the table-owner context with no JWT claims.
-- Needed for fixtures and append-only tests: writing a row *as* a normal user would
-- conflate two separate controls (RLS policy vs. the control being tested).
create or replace function test_util.act_as_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  reset role;
end;
$$;

-- Expects the statement inside to raise. Fails loudly if it does not.
create or replace function test_util.expect_error(p_sql text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'ASSERTION FAILED: % — statement succeeded but should have been rejected', p_label;
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

grant execute on all functions in schema test_util to authenticated, anon;

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
-- Fixtures are written as the table owner, deliberately: writing them *as* an
-- authenticated user would conflate two different controls. The INSERT policy is
-- verified separately in section 5b below; this section only proves append-only.
select test_util.act_as_owner();
insert into public.audit_logs (actor_id, action, resource_type, resource_id)
values ('11111111-1111-1111-1111-111111111111', 'test.append', 'test', 'x');

select test_util.act_as('22222222-2222-2222-2222-222222222222');
select test_util.assert_true((select count(*) from public.audit_logs) >= 1, 'editor with audit.read should read audit log');

-- 5b. An authenticated user may only write an audit row attributing themselves.
select test_util.act_as('33333333-3333-3333-3333-333333333333');
select test_util.expect_error(
  $$insert into public.audit_logs (actor_id, action, resource_type) values
    ('11111111-1111-1111-1111-111111111111', 'forged.actor', 'test')$$,
  'author writes an audit row attributed to someone else'
);

-- Append-only is defended at two distinct layers, and they behave differently:
--
--   Layer 1 — RLS. audit_logs has no UPDATE or DELETE policy at all. With RLS enabled and
--   no permissive policy, those statements match zero rows and raise no error. The write
--   is therefore a silent no-op: the row survives.
--   Layer 2 — a BEFORE UPDATE/DELETE trigger, which raises. This catches the table owner
--   and the service role, i.e. exactly the callers that are exempt from RLS.
--
-- Asserting "must raise" for layer 1 would be wrong: no error is the correct behaviour,
-- and asserting that alone would miss the case where a row silently changed. Both layers
-- and the stored content are checked below.

-- Layer 1: an authenticated editor can read the row but must not be able to change it.
select test_util.act_as('22222222-2222-2222-2222-222222222222');
update public.audit_logs set action = 'tampered' where action = 'test.append';
delete from public.audit_logs where action = 'test.append';

select test_util.act_as_owner();
select test_util.assert_true(
  (select count(*) from public.audit_logs where action = 'test.append') = 1,
  'audit row was silently modified or deleted by an authenticated user'
);
select test_util.assert_true(
  (select count(*) from public.audit_logs where action = 'tampered') = 0,
  'audit row content was tampered with'
);

-- Layer 2: the trigger must stop even a caller that bypasses RLS (owner / service role).
select test_util.expect_error(
  $$update public.audit_logs set action = 'tampered' where action = 'test.append'$$,
  'table owner was able to UPDATE an audit row (trigger not enforcing append-only)'
);
select test_util.expect_error(
  $$delete from public.audit_logs where action = 'test.append'$$,
  'table owner was able to DELETE an audit row (trigger not enforcing append-only)'
);
-- ---------------------------------------------------------------------------
-- 6. Expired role grants stop conferring permissions
-- ---------------------------------------------------------------------------
update public.user_roles set expires_at = now() - interval '1 second'
where user_id = '22222222-2222-2222-2222-222222222222';

select test_util.act_as('22222222-2222-2222-2222-222222222222');
select test_util.assert_true(not public.has_permission('article.publish'), 'expired role must not grant permissions');

select 'RLS suite passed' as result;
rollback;
