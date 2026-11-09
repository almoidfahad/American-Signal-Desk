-- =============================================================================
-- Authorization tests for migration 0004
--   article_revisions · corrections · article_reviews · media_assets · comments
-- =============================================================================
-- Run with:  npm run test:db
--
-- The claim being tested is the one the public /corrections page makes to readers:
-- "Published articles keep an immutable revision history, so the original wording is
-- always recoverable." Before 0004 that sentence was false. These assertions are what
-- make it true, and they fail the moment someone deletes a policy that protects it.
--
-- Runs as `authenticated` with forged JWT claims, exactly like PostgREST does.
-- Inside a transaction that is ROLLED BACK at the end.
-- =============================================================================

begin;

create schema if not exists test_util;
grant usage on schema test_util to authenticated, anon;

-- Fixtures ---------------------------------------------------------------------
do $$ begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role)
  values
    ('11111111-1111-1111-1111-111111111111', 'super@asd.test',  'x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated'),
    ('22222222-2222-2222-2222-222222222222', 'editor@asd.test', 'x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated'),
    ('33333333-3333-3333-3333-333333333333', 'author@asd.test', 'x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated'),
    ('44444444-4444-4444-4444-444444444444', 'author2@asd.test','x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated'),
    ('55555555-5555-5555-5555-555555555555', 'analyst@asd.test','x', now(), '{}', '{}', now(), now(), 'authenticated', 'authenticated')
  on conflict (id) do nothing;
exception when others then null; end $$;

do $$ begin
  insert into public.user_roles (user_id, role) values
    ('11111111-1111-1111-1111-111111111111', 'super_admin'),
    ('22222222-2222-2222-2222-222222222222', 'editor'),
    ('33333333-3333-3333-3333-333333333333', 'author'),
    ('44444444-4444-4444-4444-444444444444', 'author'),
    ('55555555-5555-5555-5555-555555555555', 'analyst')
  on conflict do nothing;
exception when others then null; end $$;

create or replace function test_util.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function test_util.act_as_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  reset role;
end;
$$;

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

-- A category and one article owned by the author, created through the normal path so the
-- revision trigger runs exactly as it would in production.
do $$ begin
  insert into public.categories (slug, name) values ('probe-news', 'Probe News')
  on conflict (slug) do nothing;
exception when others then null; end $$;

select test_util.act_as('33333333-3333-3333-3333-333333333333');
insert into public.articles (slug, title, dek, body_html, created_by, category_id)
values (
  'revision-probe',
  'Original headline',
  'Original dek',
  '<p>Original first paragraph.</p>',
  '33333333-3333-3333-3333-333333333333',
  (select id from public.categories where slug = 'probe-news')
);

-- ---------------------------------------------------------------------------
-- 1. The original wording is captured on creation
-- ---------------------------------------------------------------------------
select test_util.assert_true(
  (select count(*) from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe' and r.revision_no = 1) = 1,
  'creating an article must write revision 1'
);

select test_util.assert_true(
  (select r.body_html from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe' and r.revision_no = 1) like '%Original first paragraph%',
  'revision 1 must store the created body'
);

select test_util.assert_true(
  (select r.change_reason from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe' and r.revision_no = 1) = 'created',
  'revision 1 must be labelled created'
);

-- ---------------------------------------------------------------------------
-- 2. An edit appends a revision — one row, holding the new state
-- ---------------------------------------------------------------------------
select test_util.act_as('33333333-3333-3333-3333-333333333333');
update public.articles
   set body_html = '<p>Rewritten paragraph.</p>'
 where slug = 'revision-probe';

select test_util.assert_true(
  (select count(*) from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe') = 2,
  'one edit must append exactly one revision, not two'
);

select test_util.assert_true(
  (select r.body_html from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe' and r.revision_no = 2) like '%Rewritten paragraph%',
  'the newest revision must hold the current wording'
);

-- This is the recoverability claim, asserted directly.
select test_util.assert_true(
  (select r.body_html from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe' and r.revision_no = 1) like '%Original first paragraph%',
  'the original wording must still be recoverable after an edit'
);

select test_util.assert_true(
  (select r.changed_fields from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe' and r.revision_no = 2) = array['body_html'],
  'revision 2 must record that only body_html changed'
);

-- ---------------------------------------------------------------------------
-- 3. A no-op update writes no revision
-- ---------------------------------------------------------------------------
update public.articles set title = 'Original headline' where slug = 'revision-probe';
select test_util.assert_true(
  (select count(*) from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe') = 2,
  'a write that changes nothing must not create a revision'
);

-- ---------------------------------------------------------------------------
-- 4. Revisions are append-only for everyone, including staff
-- ---------------------------------------------------------------------------
-- Layer 1 is RLS: there is no UPDATE policy on this table, so a privileged user's UPDATE
-- matches zero rows and raises nothing. "No error" is therefore not proof of protection —
-- the proof is that the stored wording did not change. This is the same subtlety the
-- audit_logs suite records, and asserting an error here would be asserting the wrong thing.
select test_util.act_as('11111111-1111-1111-1111-111111111111'); -- super admin
update public.article_revisions set body_html = 'tampered';

select test_util.act_as_owner();
select test_util.assert_true(
  (select count(*) from public.article_revisions where body_html = 'tampered') = 0,
  'even a super admin must not be able to rewrite revision history (RLS: zero rows matched)'
);

select test_util.assert_true(
  (select r.body_html from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe' and r.revision_no = 1) like '%Original first paragraph%',
  'the original wording must survive an attempted rewrite'
);

-- As the table owner there is no RLS to hide behind: the trigger itself must refuse.
select test_util.act_as_owner();
select test_util.expect_error(
  $sql$ update public.article_revisions set body_html = 'tampered' $sql$,
  'the append-only trigger must reject an owner-level UPDATE'
);
select test_util.expect_error(
  $sql$ delete from public.article_revisions $sql$,
  'the append-only trigger must reject an owner-level DELETE'
);

-- ---------------------------------------------------------------------------
-- 5. Revision visibility — an author sees their own history, not a colleague's
-- ---------------------------------------------------------------------------
select test_util.act_as('44444444-4444-4444-4444-444444444444'); -- author2
select test_util.assert_true(
  (select count(*) from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe') = 0,
  'author2 must not see another author''s revision history'
);

select test_util.act_as('33333333-3333-3333-3333-333333333333'); -- author (owner)
select test_util.assert_true(
  (select count(*) from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe') = 2,
  'the owning author must see their own revision history'
);

-- Anonymous readers get no revision access at all.
select test_util.act_as_owner();
set local role anon;
select test_util.assert_true(
  (select count(*) from public.article_revisions) = 0,
  'anon must not read revision history'
);
reset role;

-- ---------------------------------------------------------------------------
-- 6. Publish, then correct: the published-article edit is labelled a correction
-- ---------------------------------------------------------------------------
select test_util.act_as('22222222-2222-2222-2222-222222222222'); -- editor
update public.articles set status = 'pending_review' where slug = 'revision-probe';
update public.articles set status = 'approved' where slug = 'revision-probe';
update public.articles set status = 'published', publish_at = now() where slug = 'revision-probe';

select test_util.assert_true(
  (select status from public.articles where slug = 'revision-probe') = 'published',
  'the editor must be able to publish through the review chain'
);

update public.articles
   set body_html = '<p>Corrected paragraph.</p>'
 where slug = 'revision-probe';

select test_util.assert_true(
  (select r.change_reason from public.article_revisions r
     join public.articles a on a.id = r.article_id
    where a.slug = 'revision-probe'
    order by r.revision_no desc limit 1) = 'correction',
  'editing live copy must be recorded as a correction, not a routine edit'
);

-- ---------------------------------------------------------------------------
-- 7. Corrections ledger — approval is required, and only reviewers may publish
-- ---------------------------------------------------------------------------
-- Build the article id as a stable value the assertions can reuse.
select test_util.act_as_owner();
create temp table if not exists probe_ids as
  select (select id from public.articles where slug = 'revision-probe') as article_id;
grant select on probe_ids to authenticated, anon;

-- An author must not be able to publish a correction to live copy.
select test_util.act_as('33333333-3333-3333-3333-333333333333');
select test_util.expect_error(
  $sql$ insert into public.corrections (article_id, description, correction, is_public, approved_by, approved_at)
        select article_id, 'A claim in paragraph two was wrong.', 'Paragraph two now states the corrected figure.',
               true, '33333333-3333-3333-3333-333333333333', now() from probe_ids $sql$,
  'an author must not publish a public correction'
);

-- An editor may, and the row must be readable by readers.
select test_util.act_as('22222222-2222-2222-2222-222222222222');
insert into public.corrections (article_id, description, correction, is_public, approved_by, approved_at)
select article_id, 'A claim in paragraph two was wrong.', 'Paragraph two now states the corrected figure.',
       true, '22222222-2222-2222-2222-222222222222', now()
  from probe_ids;

select test_util.assert_true(
  (select count(*) from public.corrections) = 1,
  'the editor must be able to record a correction'
);

-- A public correction with no approver must be impossible by construction.
select test_util.act_as_owner();
select test_util.expect_error(
  $sql$ insert into public.corrections (article_id, description, correction, is_public)
        select article_id, 'Unapproved public correction attempt.', 'This must never be visible.' from probe_ids $sql$,
  'a public correction without an approver must violate the constraint'
);

-- Readers can see it.
set local role anon;
select test_util.assert_true(
  (select count(*) from public.public_corrections) = 1,
  'a reader must see the published correction on a live article'
);
reset role;

-- Deletion is blocked for the owner too — the ledger is permanent.
select test_util.act_as_owner();
select test_util.expect_error(
  $sql$ delete from public.corrections $sql$,
  'the corrections ledger must reject deletion'
);

-- ---------------------------------------------------------------------------
-- 8. Corrections on unpublished articles stay private
-- ---------------------------------------------------------------------------
select test_util.act_as('33333333-3333-3333-3333-333333333333');
insert into public.articles (slug, title, body_html, created_by, category_id)
values ('draft-probe', 'Draft headline', '<p>Draft body.</p>',
        '33333333-3333-3333-3333-333333333333',
        (select id from public.categories where slug = 'probe-news'));

select test_util.act_as('22222222-2222-2222-2222-222222222222');
insert into public.corrections (article_id, description, correction, is_public, approved_by, approved_at)
select id, 'A draft-only correction entry.', 'Not visible to readers yet.',
       true, '22222222-2222-2222-2222-222222222222', now()
  from public.articles where slug = 'draft-probe';

select test_util.act_as_owner();
set local role anon;
select test_util.assert_true(
  (select count(*) from public.public_corrections) = 1,
  'a correction on an unpublished article must not reach readers'
);
reset role;

-- ---------------------------------------------------------------------------
-- 9. Review records — negative decisions must carry a note
-- ---------------------------------------------------------------------------
select test_util.act_as('22222222-2222-2222-2222-222222222222');
select test_util.expect_error(
  $sql$ insert into public.article_reviews (article_id, decision, reviewer_id)
        select article_id, 'rejected', '22222222-2222-2222-2222-222222222222' from probe_ids $sql$,
  'a rejection without a note must be rejected — the author would learn nothing'
);

insert into public.article_reviews (article_id, decision, reviewer_id, note)
select article_id, 'rejected', '22222222-2222-2222-2222-222222222222', 'Unverified sourcing in paragraph two.'
  from probe_ids;

select test_util.assert_true(
  (select count(*) from public.article_reviews) = 1,
  'a rejection with a note must be accepted'
);

-- An author must not be able to write a review record approving their own work.
select test_util.act_as('33333333-3333-3333-3333-333333333333');
select test_util.expect_error(
  $sql$ insert into public.article_reviews (article_id, decision, reviewer_id)
        select article_id, 'approved', '33333333-3333-3333-3333-333333333333' from probe_ids $sql$,
  'an author must not write an approval record for their own article'
);

-- ---------------------------------------------------------------------------
-- 10. Review records are append-only
-- ---------------------------------------------------------------------------
select test_util.act_as_owner();
select test_util.expect_error(
  $sql$ update public.article_reviews set decision = 'approved' $sql$,
  'a rejection record must not be rewritable into an approval'
);

-- ---------------------------------------------------------------------------
-- 11. Media library — staff only, alt text mandatory, no hard delete
-- ---------------------------------------------------------------------------
select test_util.act_as('22222222-2222-2222-2222-222222222222'); -- editor holds media.upload
insert into public.media_assets (storage_path, file_name, mime_type, byte_size, alt_text, uploaded_by)
values ('articles/2026/11/probe.jpg', 'probe.jpg', 'image/jpeg', 204800,
        'A protester holds a sign outside a courthouse.', '22222222-2222-2222-2222-222222222222');

select test_util.assert_true(
  (select count(*) from public.media_assets) = 1,
  'an editor with media.upload must be able to add an asset'
);

-- An analyst (read-only) must not upload.
select test_util.act_as('55555555-5555-5555-5555-555555555555');
select test_util.expect_error(
  $sql$ insert into public.media_assets (storage_path, file_name, mime_type, byte_size, alt_text, uploaded_by)
        values ('articles/2026/11/analyst.jpg', 'analyst.jpg', 'image/jpeg', 1024,
                'Attempted upload by a read-only account.', '55555555-5555-5555-5555-555555555555') $sql$,
  'an analyst must not upload media'
);

-- Alt text is NOT NULL, so "upload without alt text" cannot even be expressed.
select test_util.act_as_owner();
select test_util.expect_error(
  $sql$ insert into public.media_assets (storage_path, file_name, mime_type, byte_size, uploaded_by)
        values ('articles/2026/11/noalt.jpg', 'noalt.jpg', 'image/jpeg', 1024,
                '22222222-2222-2222-2222-222222222222') $sql$,
  'media without alt text must be impossible'
);

-- Only image types are allowed; a disguised HTML upload must be refused.
select test_util.expect_error(
  $sql$ insert into public.media_assets (storage_path, file_name, mime_type, byte_size, alt_text, uploaded_by)
        values ('articles/2026/11/evil.html', 'evil.html', 'text/html', 1024,
                'Disguised payload.', '22222222-2222-2222-2222-222222222222') $sql$,
  'non-image media types must be refused'
);

select test_util.expect_error(
  $sql$ delete from public.media_assets $sql$,
  'media rows must be soft-deleted, never hard-deleted'
);

-- Readers must not be able to enumerate the media library.
set local role anon;
select test_util.assert_true(
  (select count(*) from public.media_assets) = 0,
  'anon must not read the media library'
);
reset role;

-- ---------------------------------------------------------------------------
-- 12. Comments — pending stays invisible, approval must be attributed
-- ---------------------------------------------------------------------------
select test_util.act_as_owner();
insert into public.comments (article_id, author_name, author_email, body)
select article_id, 'A Reader', 'reader@example.com', 'This is a pending comment.' from probe_ids;

set local role anon;
select test_util.assert_true(
  (select count(*) from public.comments) = 0,
  'a pending comment must not be visible to readers'
);
reset role;

-- An approved comment must name its moderator — the constraint enforces it.
select test_util.act_as_owner();
select test_util.expect_error(
  $sql$ update public.comments set status = 'approved' $sql$,
  'an approved comment without a moderator must violate the constraint'
);

select test_util.act_as('22222222-2222-2222-2222-222222222222'); -- editor holds comment.moderate
update public.comments set status = 'approved',
       moderated_by = '22222222-2222-2222-2222-222222222222',
       moderated_at = now();

set local role anon;
select test_util.assert_true(
  (select count(*) from public.comments) = 1,
  'an approved comment must become visible to readers'
);
reset role;

-- The author must not be able to moderate comments (no comment.moderate).
select test_util.act_as('33333333-3333-3333-3333-333333333333');
update public.comments set body = 'Rewritten by someone without moderation rights.';
select test_util.assert_true(
  (select body from public.comments where author_name = 'A Reader') = 'This is a pending comment.',
  'an author must not be able to edit a moderated comment'
);

-- ---------------------------------------------------------------------------
-- 13. The correction-publish permission is not handed to authors
-- ---------------------------------------------------------------------------
select test_util.act_as('33333333-3333-3333-3333-333333333333');
select test_util.assert_true(not public.has_permission('correction.publish'),
  'an author must not hold correction.publish');

select test_util.act_as('22222222-2222-2222-2222-222222222222');
select test_util.assert_true(public.has_permission('correction.publish'),
  'an editor must hold correction.publish');

select test_util.act_as('55555555-5555-5555-5555-555555555555');
select test_util.assert_true(not public.has_permission('correction.publish'),
  'an analyst must not hold correction.publish');

-- ---------------------------------------------------------------------------
-- 14. Article purge cascades histories away with the article (no orphans)
-- ---------------------------------------------------------------------------
select test_util.act_as_owner();
select test_util.assert_true(
  (select count(*) from public.article_revisions r
    where not exists (select 1 from public.articles a where a.id = r.article_id)) = 0,
  'no revision may reference a missing article'
);

select 'RLS suite for revisions, corrections, media and comments passed' as result;

rollback;
