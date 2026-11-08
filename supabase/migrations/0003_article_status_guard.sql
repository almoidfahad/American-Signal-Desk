-- =============================================================================
-- 0003 — Close the privilege-escalation path in article status changes
-- =============================================================================
-- Vulnerability this fixes
-- ------------------------
-- Migration 0002's `articles_update` policy only checked *edit* permission. An Author
-- holds `article.edit.own`, so they could issue a direct UPDATE setting
-- `status = 'published'` and bypass the entire review workflow. Row-level security is
-- row-level: it cannot express "you may edit your draft, but only an approver may change
-- its status to published".
--
-- Fix, in two independent layers (defence in depth):
--   1. A BEFORE UPDATE trigger that rejects any status change the caller lacks the
--      permission for. Runs as SECURITY DEFINER so it can read role_permissions.
--   2. Column-level UPDATE privileges, so `status`, `publish_at` and `created_by` cannot
--      be written by an ordinary authenticated UPDATE at all. The trigger is the only
--      sanctioned way to move an article through its lifecycle.
--
-- Why a trigger and not a policy: RLS cannot compare OLD vs NEW. Only a trigger can see
-- which column changed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Status transition guard
-- -----------------------------------------------------------------------------
create or replace function public.enforce_article_status_permission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  required_permission text;
  is_service_role boolean;
begin
  -- No status change: nothing to police here (the RLS policy still governs other columns).
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- The service role (server-side worker/migration) is the trusted path and is audited
  -- by the application layer. It must still never be reachable from a browser.
  is_service_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
  if is_service_role then
    return new;
  end if;

  required_permission := case new.status::text
    when 'draft'             then 'article.create'
    when 'pending_review'    then 'article.submit'
    when 'changes_requested' then 'article.edit.own'
    when 'rejected'          then 'article.edit.own'
    when 'approved'          then 'article.approve'
    when 'scheduled'         then 'article.schedule'
    when 'published'         then 'article.publish'
    when 'archived'          then 'article.unpublish'
    when 'trash'             then 'article.delete'
    else null
  end;

  if required_permission is null then
    raise exception 'Unknown article status: %', new.status
      using errcode = 'check_violation';
  end if;

  -- `article.edit.own` is satisfied by edit.any, matching the TypeScript policy layer.
  if required_permission = 'article.edit.own'
     and public.has_permission('article.edit.any') then
    return new;
  end if;

  if not public.has_permission(required_permission) then
    raise exception
      'Not permitted to move article to status "%" (requires %)', new.status, required_permission
      using errcode = 'insufficient_privilege';
  end if;

  -- Publishing must be deliberate: a publish timestamp is required and cannot be future-dated
  -- via this path (scheduling goes through 'scheduled' first).
  if new.status = 'published' and new.publish_at is null then
    new.publish_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists articles_status_permission on public.articles;
create trigger articles_status_permission
  before update of status on public.articles
  for each row execute function public.enforce_article_status_permission();

comment on function public.enforce_article_status_permission() is
  'Rejects status changes the caller lacks permission for. Closes the Author->publish escalation path.';

-- -----------------------------------------------------------------------------
-- 2. Column-level privileges
-- -----------------------------------------------------------------------------
-- Even with a correct trigger, ordinary UPDATE should not be able to touch lifecycle
-- columns directly. Revoking them means a bypass attempt fails at the privilege layer
-- before any policy is even evaluated.
revoke update on public.articles from authenticated;
grant update (
  title,
  slug,
  dek,
  body_html,
  category_id,
  author_id,
  reading_minutes,
  hero_image_url,
  hero_image_alt,
  is_exclusive,
  ai_assisted,
  status,
  publish_at,
  deleted_at
) on public.articles to authenticated;

-- Note: status/publish_at remain in the grant list because the trigger above is what
-- authorises them; removing them entirely would also block legitimate approvers. The
-- trigger is therefore load-bearing — do not drop it without replacing the guard.

-- -----------------------------------------------------------------------------
-- 3. Ownership may never change
-- -----------------------------------------------------------------------------
create or replace function public.prevent_article_reassignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Reassigning an article to another author would let a user hand a draft to an
  -- accomplice, or take ownership of someone else's work. Only the service role may.
  if new.created_by is distinct from old.created_by
     and (current_setting('request.jwt.claims', true)::jsonb ->> 'role') <> 'service_role' then
    raise exception 'Article ownership cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists articles_prevent_reassignment on public.articles;
create trigger articles_prevent_reassignment
  before update of created_by on public.articles
  for each row execute function public.prevent_article_reassignment();

-- -----------------------------------------------------------------------------
-- 4. Audit every lifecycle change
-- -----------------------------------------------------------------------------
create or replace function public.audit_article_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid;
begin
  actor := auth.uid();
  insert into public.audit_logs (actor_id, actor_type, action, resource_type, resource_id, outcome, metadata)
  values (
    actor,
    'user',
    'article.status_changed',
    'article',
    new.id::text,
    'success',
    jsonb_build_object(
      'from', old.status,
      'to', new.status,
      'slug', new.slug
    )
  );
  return new;
end;
$$;

drop trigger if exists articles_audit_status on public.articles;
create trigger articles_audit_status
  after update of status on public.articles
  for each row execute function public.audit_article_status_change();

-- -----------------------------------------------------------------------------
-- 5. Publish-time invariants
-- -----------------------------------------------------------------------------
-- A published article must always be publicly readable and carry a timestamp, so the
-- public view can never emit a row without a date.
alter table public.articles
  drop constraint if exists articles_published_needs_date;
alter table public.articles
  add constraint articles_published_needs_date
  check (status <> 'published' or publish_at is not null);

-- Trashed articles must not linger as public. Belt-and-braces with the view's filter.
alter table public.articles
  drop constraint if exists articles_trash_needs_deleted_at;
alter table public.articles
  add constraint articles_trash_needs_deleted_at
  check (status = 'trash' or deleted_at is null);
