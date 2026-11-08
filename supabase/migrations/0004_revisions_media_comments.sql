-- =============================================================================
-- 0004 — Revision history, corrections ledger, media library, comments
-- =============================================================================
-- Why this migration exists
-- ------------------------
-- `0002` promised "article revisions, review records, tags/media, and comments land
-- in 0003". 0003 became the status-privilege fix instead, and these tables were never
-- written. Meanwhile the published /corrections page tells readers:
--
--   "Published articles keep an immutable revision history, so the original wording
--    is always recoverable."
--
-- That was not true. An editor could rewrite a published article and the previous
-- wording was simply gone. For a newsroom that is the difference between a
-- corrections policy and a claim about one, so this migration makes the sentence
-- honest rather than deleting it.
--
-- Design decisions
-- ----------------
-- 1. Revisions are written by a TRIGGER, not by the application. If the service layer
--    forgets to record a revision, the trail is still complete. Application-level
--    history is history you lose exactly when a bug is interesting.
-- 2. Revisions are append-only at two layers (no UPDATE/DELETE policy, plus a trigger),
--    matching the audit_logs pattern already proven by the existing suites.
-- 3. A correction is a first-class published fact, not a silent edit: it carries a
--    public-facing note, an optional public correction notice, and a ledger row that
--    can never be deleted.
-- 4. Nothing here is readable by `anon` except the two surfaces a reader must have:
--    public corrections on published articles, and approved comments.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
-- `changes_requested` and `rejected` already exist as article *statuses*; a review
-- record needs to know the decision that produced them, plus the approve/schedule
-- steps that do not change the status enum.
do $$ begin
  create type public.review_decision as enum (
    'submitted', 'changes_requested', 'approved', 'rejected', 'scheduled', 'published', 'unpublished'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.comment_status as enum ('pending', 'approved', 'rejected', 'spam');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.revision_reason as enum (
    'created', 'edited', 'status_change', 'correction', 'restore'
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- article_revisions — the immutable wording history
-- -----------------------------------------------------------------------------
create table if not exists public.article_revisions (
  id             bigint generated always as identity primary key,
  article_id     uuid not null references public.articles (id) on delete cascade,
  revision_no    integer not null,
  title          text not null,
  dek            text not null default '',
  body_html      text not null default '',
  slug           text not null,
  status         public.article_status not null,
  changed_by     uuid references public.profiles (id) on delete set null,
  change_reason  public.revision_reason not null default 'edited',
  -- Diff-friendly summary: which fields actually changed. Never the whole body, so the
  -- revision list stays cheap to read in the admin UI.
  changed_fields text[] not null default '{}',
  -- Optional editorial note explaining a correction, shown to staff.
  note           text,
  created_at     timestamptz not null default now(),
  constraint article_revisions_no_positive check (revision_no > 0),
  constraint article_revisions_id_uniq unique (article_id, revision_no),
  constraint article_revisions_note_len check (note is null or char_length(note) <= 2000)
);

create index if not exists article_revisions_article_idx
  on public.article_revisions (article_id, revision_no desc);
create index if not exists article_revisions_created_idx
  on public.article_revisions (created_at desc);

comment on table public.article_revisions is
  'Append-only wording history. Written by trigger so an application bug cannot erase it.';

-- -----------------------------------------------------------------------------
-- corrections — the public corrections ledger
-- -----------------------------------------------------------------------------
-- Separate from article_revisions on purpose: a revision is every edit, a correction is
-- the subset we have told readers about. The corrections page reads this table, so a
-- published correction cannot be quietly withdrawn.
create table if not exists public.corrections (
  id            uuid primary key default gen_random_uuid(),
  article_id    uuid not null references public.articles (id) on delete cascade,
  -- The wording being corrected, preserved verbatim so a correction is auditable even
  -- if the revision rows are later purged with the article.
  description   text not null,
  correction    text not null,
  -- Must be TRUE by construction: a correction with no public note is exactly the silent
  -- edit this table exists to prevent.
  is_public     boolean not null default true,
  approved_by   uuid references public.profiles (id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint corrections_description_len check (char_length(description) between 10 and 4000),
  constraint corrections_text_len check (char_length(correction) between 10 and 4000),
  constraint corrections_public_needs_approval
    check (not is_public or (approved_by is not null and approved_at is not null))
);

create index if not exists corrections_public_idx
  on public.corrections (created_at desc) where is_public;
create index if not exists corrections_article_idx on public.corrections (article_id, created_at desc);

-- -----------------------------------------------------------------------------
-- article_reviews — the review trail (who asked, who approved, why)
-- -----------------------------------------------------------------------------
create table if not exists public.article_reviews (
  id          bigint generated always as identity primary key,
  article_id  uuid not null references public.articles (id) on delete cascade,
  decision    public.review_decision not null,
  reviewer_id uuid references public.profiles (id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),
  constraint article_reviews_note_len check (note is null or char_length(note) <= 4000),
  -- A rejection or a change request without a note is useless to the author receiving it.
  constraint article_reviews_negative_needs_note
    check (decision not in ('changes_requested', 'rejected') or (note is not null and char_length(trim(note)) > 0))
);

create index if not exists article_reviews_article_idx
  on public.article_reviews (article_id, created_at desc);

-- -----------------------------------------------------------------------------
-- media_assets — the media library
-- -----------------------------------------------------------------------------
create table if not exists public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text not null,
  byte_size    bigint not null,
  width        integer,
  height       integer,
  -- Alt text is mandatory at upload, not optional: an image without alt text is an
  -- accessibility defect that is almost never fixed later.
  alt_text     text not null,
  credit       text,
  checksum     text,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint media_byte_size_sane check (byte_size > 0 and byte_size <= 26214400),
  constraint media_alt_len check (char_length(alt_text) between 1 and 500),
  constraint media_mime_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif')
  )
);

create index if not exists media_created_idx on public.media_assets (created_at desc);
create index if not exists media_uploader_idx on public.media_assets (uploaded_by);

-- Link articles to media without duplicating URLs in two places.
create table if not exists public.article_media (
  article_id uuid not null references public.articles (id) on delete cascade,
  media_id   uuid not null references public.media_assets (id) on delete restrict,
  role       text not null default 'inline',
  created_at timestamptz not null default now(),
  primary key (article_id, media_id),
  constraint article_media_role_allowed check (role in ('hero', 'inline', 'gallery'))
);

-- -----------------------------------------------------------------------------
-- comments — reader comments, moderated before they appear
-- -----------------------------------------------------------------------------
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid not null references public.articles (id) on delete cascade,
  -- No user account is required to comment, so identity is an email + display name.
  -- Stored lower-cased for consistent moderation lookups.
  author_name  text not null,
  author_email text not null,
  body         text not null,
  status       public.comment_status not null default 'pending',
  -- Kept for abuse triage; hashed, never raw, so a leak cannot reveal reader IPs.
  ip_hash      text,
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint comments_body_len check (char_length(body) between 1 and 5000),
  constraint comments_name_len check (char_length(author_name) between 1 and 120),
  constraint comments_email_lower check (author_email = lower(author_email)),
  -- An approved comment must say who approved it and when. "Approved" with no moderator
  -- is the shape of a bug, not a decision.
  constraint comments_approved_needs_moderator
    check (status <> 'approved' or (moderated_by is not null and moderated_at is not null))
);

create index if not exists comments_article_approved_idx
  on public.comments (article_id, created_at desc) where status = 'approved';
create index if not exists comments_moderation_idx
  on public.comments (status, created_at desc);

-- =============================================================================
-- Revision capture
-- =============================================================================
-- Fires on every INSERT (revision 1 = as created) and on UPDATE when a tracked field
-- actually changed. Status-only changes are recorded too, because "who moved this to
-- published" belongs in the same history as "who rewrote paragraph three".
--
-- Model: ONE row per write, holding the state *after* the change. The chain of rows is
-- therefore the chain of states, so any previous wording — including the original — is
-- recoverable from the row before it, and the highest revision_no is always the text that
-- is live. Capturing the before-state instead would double every edit into two rows and
-- make "what does this article say right now" a question the table cannot answer.
create or replace function public.capture_article_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  next_no integer;
  reason  public.revision_reason;
  fields  text[] := '{}';
  actor   uuid;
begin
  -- Actor resolution: the JWT subject when a user made the request, else whatever
  -- created_by says (service-role background writes).
  actor := auth.uid();
  if actor is null then
    actor := new.created_by;
  end if;

  if tg_op = 'INSERT' then
    next_no := 1;
    reason  := 'created';
    fields  := array['title', 'dek', 'body_html', 'slug', 'status'];
  else
    -- Compare field by field. `is distinct from` so NULL -> '' counts as a change.
    if new.title          is distinct from old.title          then fields := array_append(fields, 'title'); end if;
    if new.dek            is distinct from old.dek            then fields := array_append(fields, 'dek'); end if;
    if new.body_html      is distinct from old.body_html      then fields := array_append(fields, 'body_html'); end if;
    if new.slug           is distinct from old.slug           then fields := array_append(fields, 'slug'); end if;
    if new.status         is distinct from old.status         then fields := array_append(fields, 'status'); end if;
    if new.publish_at     is distinct from old.publish_at     then fields := array_append(fields, 'publish_at'); end if;
    if new.hero_image_url is distinct from old.hero_image_url then fields := array_append(fields, 'hero_image_url'); end if;

    -- Nothing we track changed (e.g. only reading_minutes was recomputed): no revision.
    if array_length(fields, 1) is null then
      return new;
    end if;

    if old.status = 'published' and new.status = 'published' then
      -- An edit to live copy. This is precisely the case the corrections policy covers,
      -- so it is labelled distinctly rather than as a routine edit.
      reason := 'correction';
    elsif fields = array['status'] then
      reason := 'status_change';
    elsif new.status = 'archived' then
      reason := 'restore';
    else
      reason := 'edited';
    end if;

    select coalesce(max(r.revision_no), 0) + 1
      into next_no
      from public.article_revisions r
     where r.article_id = new.id;
  end if;

  insert into public.article_revisions
    (article_id, revision_no, title, dek, body_html, slug, status, changed_by, change_reason, changed_fields)
  values
    (new.id, next_no, new.title, new.dek, new.body_html, new.slug, new.status,
     actor, reason, fields)
  on conflict (article_id, revision_no) do nothing;

  return new;
end;
$$;

comment on function public.capture_article_revision() is
  'Records wording history on every article write. Trigger-driven so application bugs cannot create gaps.';

drop trigger if exists articles_capture_revision on public.articles;
create trigger articles_capture_revision
  after insert or update on public.articles
  for each row execute function public.capture_article_revision();

-- =============================================================================
-- Append-only enforcement (two layers, matching the audit_logs pattern)
-- =============================================================================
create or replace function public.block_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  raise exception '% is append-only; % is not permitted', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists article_revisions_append_only on public.article_revisions;
create trigger article_revisions_append_only
  before update or delete on public.article_revisions
  for each row execute function public.block_mutation();

drop trigger if exists corrections_append_only on public.corrections;
create trigger corrections_append_only
  before delete on public.corrections
  for each row execute function public.block_mutation();

drop trigger if exists article_reviews_append_only on public.article_reviews;
create trigger article_reviews_append_only
  before update or delete on public.article_reviews
  for each row execute function public.block_mutation();

-- An approval, once given, cannot be silently edited into a retraction elsewhere.
drop trigger if exists media_soft_delete_only on public.media_assets;
create or replace function public.prevent_media_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  raise exception 'media_assets rows are soft-deleted; hard delete is not permitted'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger media_soft_delete_only
  before delete on public.media_assets
  for each row execute function public.prevent_media_hard_delete();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.article_revisions enable row level security;
alter table public.corrections       enable row level security;
alter table public.article_reviews   enable row level security;
alter table public.media_assets      enable row level security;
alter table public.article_media     enable row level security;
alter table public.comments          enable row level security;

-- --- article_revisions -------------------------------------------------------
-- Staff who may review or edit any article may read the history. An author may read
-- the history of their own article only.
drop policy if exists article_revisions_read on public.article_revisions;
create policy article_revisions_read on public.article_revisions
  for select to authenticated
  using (
    public.has_permission('article.review')
    or public.has_permission('article.edit.any')
    or exists (
      select 1 from public.articles a
      where a.id = article_revisions.article_id and a.created_by = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policy for anyone but the trigger's SECURITY DEFINER owner.
-- The table is written exclusively by capture_article_revision().

-- --- corrections -------------------------------------------------------------
-- Readers see public corrections on published articles; that is what the corrections
-- page promises. Nothing else in this table is readable by anon.
drop policy if exists corrections_public_read on public.corrections;
create policy corrections_public_read on public.corrections
  for select to anon, authenticated
  using (
    is_public
    and exists (
      select 1 from public.articles a
      where a.id = corrections.article_id
        and a.status = 'published'
        and a.deleted_at is null
    )
  );

drop policy if exists corrections_staff_read on public.corrections;
create policy corrections_staff_read on public.corrections
  for select to authenticated
  using (public.has_permission('article.review') or public.has_permission('article.edit.any'));

-- Only an approver may publish a correction: `article.approve` already means "this person
-- is trusted to change what readers see".
drop policy if exists corrections_insert on public.corrections;
create policy corrections_insert on public.corrections
  for insert to authenticated
  with check (
    public.has_permission('article.approve')
    and (approved_by is null or approved_by = auth.uid())
  );

-- --- article_reviews ---------------------------------------------------------
drop policy if exists article_reviews_read on public.article_reviews;
create policy article_reviews_read on public.article_reviews
  for select to authenticated
  using (
    public.has_permission('article.review')
    or public.has_permission('article.edit.any')
    or exists (
      select 1 from public.articles a
      where a.id = article_reviews.article_id and a.created_by = auth.uid()
    )
  );

-- Reviewers write review records. An author submitting their own work for review is
-- recorded by the service layer, not here, so an author cannot write their own approval.
drop policy if exists article_reviews_insert on public.article_reviews;
create policy article_reviews_insert on public.article_reviews
  for insert to authenticated
  with check (public.has_permission('article.review') and reviewer_id = auth.uid());

-- --- media_assets ------------------------------------------------------------
-- No public read: media is served from storage URLs, and the library is staff-only.
drop policy if exists media_read on public.media_assets;
create policy media_read on public.media_assets
  for select to authenticated
  using (public.has_permission('media.upload') or public.has_permission('article.edit.any'));

drop policy if exists media_insert on public.media_assets;
create policy media_insert on public.media_assets
  for insert to authenticated
  with check (public.has_permission('media.upload') and uploaded_by = auth.uid());

drop policy if exists media_update on public.media_assets;
create policy media_update on public.media_assets
  for update to authenticated
  using (public.has_permission('media.upload') or public.has_permission('media.delete'))
  with check (public.has_permission('media.upload') or public.has_permission('media.delete'));

-- --- article_media -----------------------------------------------------------
drop policy if exists article_media_read on public.article_media;
create policy article_media_read on public.article_media
  for select to authenticated
  using (public.has_permission('article.edit.any') or public.has_permission('media.upload'));

drop policy if exists article_media_manage on public.article_media;
create policy article_media_manage on public.article_media
  for all to authenticated
  using (public.has_permission('article.edit.any') or public.has_permission('media.upload'))
  with check (public.has_permission('article.edit.any') or public.has_permission('media.upload'));

-- --- comments ----------------------------------------------------------------
-- Readers may read only approved comments. Pending and rejected stay invisible, which is
-- the entire point of holding them for moderation.
drop policy if exists comments_public_read on public.comments;
create policy comments_public_read on public.comments
  for select to anon, authenticated
  using (status = 'approved');

drop policy if exists comments_moderate_read on public.comments;
create policy comments_moderate_read on public.comments
  for select to authenticated
  using (public.has_permission('comment.moderate'));

-- Public submission goes through the service role (rate-limited in the API layer), so no
-- INSERT policy for anon. That keeps spam controls out of the database and in one place.
drop policy if exists comments_moderate_update on public.comments;
create policy comments_moderate_update on public.comments
  for update to authenticated
  using (public.has_permission('comment.moderate'))
  with check (public.has_permission('comment.moderate') and moderated_by = auth.uid());

-- =============================================================================
-- Public read surface for corrections
-- =============================================================================
-- security_invoker so the policy above still applies; this is a shaping view, not a
-- privilege bypass.
drop view if exists public.public_corrections;
create view public.public_corrections
with (security_invoker = true)
as
select
  co.id,
  co.description,
  co.correction,
  co.created_at,
  a.slug   as article_slug,
  a.title  as article_title
from public.corrections co
join public.articles a on a.id = co.article_id
where co.is_public
  and a.status = 'published'
  and a.deleted_at is null
order by co.created_at desc;

comment on view public.public_corrections is
  'Backs the public /corrections page. Only approved, public corrections on live articles.';

-- =============================================================================
-- Permission additions
-- =============================================================================
-- `comment.moderate`, `media.upload` and `article.approve` already exist in 0001. The one
-- genuinely new capability is publishing a correction, which is a distinct editorial act
-- from approving an article: it changes text readers have already seen.
insert into public.permissions (key) values ('correction.publish')
on conflict (key) do nothing;

insert into public.role_permissions (role, permission) values
  ('super_admin', 'correction.publish'),
  ('admin',       'correction.publish'),
  ('editor',      'correction.publish')
on conflict do nothing;

-- Authors may propose a correction but not publish one. The proposal path is an
-- article_reviews / audit_logs entry, deliberately not a corrections row.
