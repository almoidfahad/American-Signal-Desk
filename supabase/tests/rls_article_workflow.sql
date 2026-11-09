-- =============================================================================
-- Authorization tests for the article lifecycle (migrations 0002 + 0003)
-- =============================================================================
-- Run with:  npm run test:db
--
-- Proves the acceptance criteria that matter most:
--   * an Author cannot approve or publish, even via a direct UPDATE
--   * an Author cannot publish by writing status = 'published'
--   * an Author cannot edit another author's article
--   * an Editor can move an article through review and publish it
--   * ownership cannot be reassigned
--   * every status change is audited
--
-- Runs as `authenticated` with forged JWT claims, exactly like PostgREST does.
-- Inside a transaction that is ROLLED BACK at the end.
-- =============================================================================

begin;

create schema if not exists test_util;
-- The suites switch into the `authenticated` role to exercise RLS, so that role must be
-- able to call the helper functions. Safe: test_util lives only in this throwaway database.
grant usage on schema test_util to authenticated, anon;

do $$ begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role)
  values
    ('11111111-1111-1111-1111-111111111111', 'super@asd.test',  'x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated'),
    ('22222222-2222-2222-2222-222222222222', 'editor@asd.test', 'x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated'),
    ('33333333-3333-3333-3333-333333333333', 'author@asd.test', 'x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated'),
    ('44444444-4444-4444-4444-444444444444', 'author2@asd.test','x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated')
  on conflict (id) do nothing;
exception when others then null; end $$;

do $$ begin
  insert into public.user_roles (user_id, role) values
    ('11111111-1111-1111-1111-111111111111', 'super_admin'),
    ('22222222-2222-2222-2222-222222222222', 'editor'),
    ('33333333-3333-3333-3333-333333333333', 'author'),
    ('44444444-4444-4444-4444-444444444444', 'author')
  on conflict do nothing;
exception when others then null; end $$;

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

create or replace function test_util.assert_true(p_condition boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
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

grant execute on all functions in schema test_util to authenticated, anon;

-- Fixture: one draft owned by author A -----------------------------------------
-- Written as the owner on purpose. Inserting *as* the author would test the INSERT
-- policy, not the fixtures; the insert path is covered by migration 0002's policy and
-- by the service layer, and a failure here should not mask a status-guard regression.
select test_util.act_as_owner();
insert into public.articles (slug, title, dek, body_html, status, created_by, publish_at)
values ('test-draft-a', 'Test draft A', 'dek', '<p>body</p>', 'draft',
        '33333333-3333-3333-3333-333333333333', null);

-- ---------------------------------------------------------------------------
-- 1. Author CANNOT publish their own draft (the escalation path)
-- ---------------------------------------------------------------------------
-- Every section states its actor explicitly. Relying on the actor left behind by the
-- previous block is what made this suite silently test the wrong thing.
select test_util.act_as('33333333-3333-3333-3333-333333333333');
select test_util.expect_error(
  $$update public.articles set status = 'published', publish_at = now()
    where slug = 'test-draft-a'$$,
  'author publishes own draft directly'
);

-- 1b. Author cannot approve their own draft either
select test_util.expect_error(
  $$update public.articles set status = 'approved' where slug = 'test-draft-a'$$,
  'author approves own draft'
);

-- 1c. Author cannot schedule
select test_util.expect_error(
  $$update public.articles set status = 'scheduled', publish_at = now() + interval '1 day'
    where slug = 'test-draft-a'$$,
  'author schedules own draft'
);

-- ---------------------------------------------------------------------------
-- 2. Author CAN submit for review and edit their own copy
-- ---------------------------------------------------------------------------
select test_util.act_as('33333333-3333-3333-3333-333333333333');
update public.articles set status = 'pending_review' where slug = 'test-draft-a';
select test_util.assert_true(
  (select status from public.articles where slug = 'test-draft-a') = 'pending_review',
  'author should be able to submit own draft for review'
);

update public.articles set title = 'Test draft A (revised)' where slug = 'test-draft-a';
select test_util.assert_true(
  (select title from public.articles where slug = 'test-draft-a') = 'Test draft A (revised)',
  'author should be able to edit own draft'
);

-- ---------------------------------------------------------------------------
-- 3. Another author cannot touch it
-- ---------------------------------------------------------------------------
select test_util.act_as('44444444-4444-4444-4444-444444444444');
select test_util.assert_true(
  (select count(*) from public.articles where slug = 'test-draft-a') = 0,
  'author B must not see author A''s unpublished draft'
);

-- ---------------------------------------------------------------------------
-- 4. Ownership cannot be reassigned
-- ---------------------------------------------------------------------------
select test_util.act_as('33333333-3333-3333-3333-333333333333');
select test_util.expect_error(
  $$update public.articles set created_by = '44444444-4444-4444-4444-444444444444'
    where slug = 'test-draft-a'$$,
  'author reassigns ownership of their draft'
);

-- ---------------------------------------------------------------------------
-- 5. Editor reviews, approves and publishes
-- ---------------------------------------------------------------------------
select test_util.act_as('22222222-2222-2222-2222-222222222222');

update public.articles set status = 'approved' where slug = 'test-draft-a';
select test_util.assert_true(
  (select status from public.articles where slug = 'test-draft-a') = 'approved',
  'editor should be able to approve'
);

update public.articles set status = 'published' where slug = 'test-draft-a';
select test_util.assert_true(
  (select status from public.articles where slug = 'test-draft-a') = 'published',
  'editor should be able to publish an approved article'
);

-- publish_at was filled in automatically by the trigger
select test_util.assert_true(
  (select publish_at from public.articles where slug = 'test-draft-a') is not null,
  'publishing must set publish_at'
);

-- ---------------------------------------------------------------------------
-- 6. The published article is now publicly readable, and only now
-- ---------------------------------------------------------------------------
set local role anon;
select test_util.assert_true(
  (select count(*) from public.published_articles where slug = 'test-draft-a') = 1,
  'published article should appear in the public view'
);
reset role;

-- ---------------------------------------------------------------------------
-- 7. Unpublishing removes it from the public surface immediately
-- ---------------------------------------------------------------------------
select test_util.act_as('22222222-2222-2222-2222-222222222222');
update public.articles set status = 'archived' where slug = 'test-draft-a';

set local role anon;
select test_util.assert_true(
  (select count(*) from public.published_articles where slug = 'test-draft-a') = 0,
  'archived article must disappear from the public view'
);
reset role;

-- ---------------------------------------------------------------------------
-- 8. Every status change was audited
-- ---------------------------------------------------------------------------
select test_util.act_as('11111111-1111-1111-1111-111111111111');
select test_util.assert_true(
  (select count(*) from public.audit_logs
    where action = 'article.status_changed' and resource_id = (
      select id::text from public.articles where slug = 'test-draft-a'
    )) >= 4,
  'each status change should produce an audit row'
);

select 'Article workflow authorization suite passed' as result;
rollback;
