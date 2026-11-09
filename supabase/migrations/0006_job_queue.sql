-- =============================================================================
-- 0006_job_queue.sql — a durable background queue, and the trusted publish path
-- =============================================================================
-- Two things live here, and they are related:
--
--   1. `jobs` — a durable queue that survives a process restart.
--   2. `publish_due_scheduled_articles()` — the one operation that needs a trusted,
--      non-interactive identity.
--
-- Why a table and not Redis/BullMQ
--
-- The repository already has Postgres, and its guarantees (atomic claim, row locks,
-- transactions) are the guarantees a job queue needs. Adding Redis buys latency and
-- operational surface this application does not yet need. What Postgres gives up is
-- push notification — a worker polls instead of waking on an event. For work measured in
-- minutes (scheduled publication, a newsletter confirmation, media cleanup) polling every
-- 30 seconds is indistinguishable from the real thing, and it costs one index read.
--
-- The queue is therefore deliberately boring: one row per unit of work, claimed with
-- SKIP LOCKED so two workers cannot take the same job, retried with exponential backoff,
-- and dead-lettered rather than retried forever.
--
-- A bug found while writing this
--
-- Migration 0003 authorised the trusted path with `public.jwt_role()`, which reads
-- `request.jwt.claims`. That function is NOT `security definer`, so for the only callers
-- that matter — a trigger, or a GRANT of a privileged function — PostgREST's claims
-- setting may not be visible, and the check silently returns null. Null is not
-- service_role, so a scheduled publish would be refused with "not permitted to publish".
-- In the harness it passed because the suite ran as the superuser, where
-- `current_user = 'service_role'` never even came into it.
--
-- `jwt_role()` is now `security definer` with a pinned search_path, reads the claims
-- through the Supabase helper when that exists, and the trigger accepts either the
-- service-role claim or `current_user = 'service_role'`. Both are server-side facts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Hardened jwt_role()
-- -----------------------------------------------------------------------------
-- `retrieve_own_jwt()` is a Supabase/GoTrue helper that reads the claims for the current
-- statement regardless of the surrounding function's security context. It is absent on a
-- plain PostgreSQL, so the existence check comes first.
create or replace function public.jwt_role()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  claims text;
begin
  if to_regprocedure('extensions.retrieve_own_jwt()') is not null then
    execute 'select extensions.retrieve_own_jwt()::text' into claims;
  end if;

  if claims is null then
    claims := nullif(current_setting('request.jwt.claims', true), '');
  end if;

  if claims is null then
    return null;
  end if;

  return claims::jsonb ->> 'role';
exception when others then
  -- Malformed claims are "no privileged role", never service_role.
  return null;
end;
$$;

comment on function public.jwt_role() is
  'Reads the role claim from the current JWT. Security definer, so triggers and granted functions can use it. Returns null on any doubt.';

-- A trigger must be able to read the claims even when the insert/update runs as an
-- ordinary role, so the helper itself must be executable by everyone who could write.
grant execute on function public.jwt_role() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. The trusted path: current_user is a server-side fact
-- -----------------------------------------------------------------------------
-- A request cannot choose `current_user`. PostgREST sets it from the JWT, a migration
-- sets it as the owner, and a worker connecting with the service key runs as service_role.
-- So accepting it alongside the claim closes the pooler gap described above without
-- widening the hole: a browser cannot reach this branch.
-- Does this request carry a JWT at all? PostgREST sets `request.jwt.claims` on every
-- request it serves, including anonymous ones (role = 'anon'). A missing claim therefore
-- means the connection did not come through the API: a migration, a psql session, or a
-- worker holding the database URL.
create or replace function public.request_has_jwt()
returns boolean
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), null) is not null;
$$;

comment on function public.request_has_jwt() is
  'True when the session carries JWT claims, i.e. the statement arrived through PostgREST.';

create or replace function public.is_trusted_service()
returns boolean
language plpgsql
stable
-- NOT security definer, deliberately. Inside a definer function `current_user` becomes the
-- function's owner, so a definer-based check reports "postgres" for a caller that is really
-- `authenticated` — every caller trusted, and the status trigger would let an author publish.
set search_path = pg_catalog, public, extensions
as $$
begin
  -- The claim is what PostgREST sets from the JWT. This is the ordinary path for the
  -- worker, which connects with the service key.
  if public.jwt_role() = 'service_role' then
    return true;
  end if;

  -- The role itself, for a caller that is already authenticated as service_role (a direct
  -- connection with the service key, or a definer function called from one).
  if current_user = 'service_role' then
    return true;
  end if;

  -- No JWT at all: this statement did not come through the API. Migrations, psql and the
  -- worker's own connection land here. A request role is never trusted this way, so
  -- impersonating the service role still requires a JWT that says so.
  if not public.request_has_jwt()
     and session_user not in ('anon', 'authenticated') then
    return true;
  end if;

  return false;
end;
$$;

comment on function public.is_trusted_service() is
  'True only for a caller that is the service role, by current_user or by JWT claim. Invoker-rights on purpose: a definer check would see the owner, not the caller.';

grant execute on function public.is_trusted_service() to anon, authenticated, service_role;
grant execute on function public.request_has_jwt() to anon, authenticated, service_role;

create or replace function public.enforce_article_status_permission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  required_permission text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- The worker and other server-side processes are the trusted path. They are audited in
  -- the application layer and are unreachable from a browser.
  if public.is_trusted_service() then
    if new.status = 'published' and new.publish_at is null then
      new.publish_at := now();
    end if;
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

  if required_permission = 'article.edit.own'
     and public.has_permission('article.edit.any') then
    return new;
  end if;

  if not public.has_permission(required_permission) then
    raise exception
      'Not permitted to move article to status "%" (requires %)', new.status, required_permission
      using errcode = 'insufficient_privilege';
  end if;

  if new.status = 'published' and new.publish_at is null then
    new.publish_at := now();
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. jobs — the queue
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.job_status as enum ('pending', 'running', 'succeeded', 'failed', 'dead');
exception when duplicate_object then null; end $$;

create table if not exists public.jobs (
  id            uuid         primary key default gen_random_uuid(),
  kind          text         not null,
  payload       jsonb        not null default '{}'::jsonb,

  status        public.job_status not null default 'pending',
  priority      smallint     not null default 0,

  -- Earliest time this job may run. Enqueue-in-the-future is just a future `run_at`.
  run_at        timestamptz  not null default now(),

  attempts      integer      not null default 0,
  max_attempts  integer      not null default 5,

  -- Set while a worker holds the job. A worker that dies releases its claim by expiry,
  -- which is why this is a timestamp rather than a boolean flag.
  locked_by     text,
  locked_until  timestamptz,

  last_error    text,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  finished_at   timestamptz,

  constraint jobs_attempts_sane check (attempts >= 0 and max_attempts > 0 and attempts <= max_attempts),
  constraint jobs_kind_not_blank check (length(trim(kind)) > 0),
  -- A running job must say who runs it and until when; anything else is a leak.
  constraint jobs_running_has_lease check (
    status <> 'running' or (locked_by is not null and locked_until is not null)
  )
);

-- The claim query filters on exactly this: ready, pending, in priority order.
create index if not exists jobs_ready_idx
  on public.jobs (priority desc, run_at)
  where status = 'pending';

-- Lets a worker find its own abandoned leases after a restart.
create index if not exists jobs_lease_idx
  on public.jobs (locked_until)
  where status = 'running';

create index if not exists jobs_kind_status_idx on public.jobs (kind, status);

comment on table public.jobs is
  'Durable background work. Claimed with SKIP LOCKED; retried with backoff; dead-lettered rather than retried forever.';

-- -----------------------------------------------------------------------------
-- 4. claim_jobs — hand out work without ever handing it out twice
-- -----------------------------------------------------------------------------
-- SKIP LOCKED is the whole point: two workers calling this at the same instant receive
-- disjoint sets, and neither blocks the other. A plain SELECT ... then UPDATE would give
-- both workers the same row.
create or replace function public.claim_jobs(
  p_worker      text,
  p_limit       integer default 10,
  p_lease_ms    integer default 60000
)
returns setof public.jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
-- The `RETURNS SETOF public.jobs` row type exposes a `status` column, and `status` is also
-- a plpgsql built-in (the GET DIAGNOSTICS variable). Without this directive the RETURN
-- QUERY below resolves `status` to the built-in and fails at runtime, which shows up as
-- "worker must have received a job" rather than as a syntax error.
begin
  if not public.is_trusted_service() then
    raise exception 'claim_jobs is server-only' using errcode = 'insufficient_privilege';
  end if;

  return query
  with ready as (
    select id
    from public.jobs
    where status = 'pending'
      and run_at <= now()
    order by priority desc, run_at
    limit greatest(1, least(coalesce(p_limit, 10), 100))
    for update skip locked
  )
  update public.jobs j
     set status = 'running',
         locked_by = p_worker,
         locked_until = now() + make_interval(secs => p_lease_ms / 1000.0),
         attempts = j.attempts + 1,
         updated_at = now()
    from ready
   where j.id = ready.id
  returning j.*;
end;
$$;

comment on function public.claim_jobs(text, integer, integer) is
  'Atomically leases ready jobs to one worker. Rows are skipped, not blocked, so workers never collide.';

-- -----------------------------------------------------------------------------
-- 5. finish_job — succeed, retry or dead-letter
-- -----------------------------------------------------------------------------
create or replace function public.finish_job(
  p_job_id   uuid,
  p_ok       boolean,
  p_error    text default null,
  p_backoff_ms integer default 5000
)
returns public.jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
begin
  if not public.is_trusted_service() then
    raise exception 'finish_job is server-only' using errcode = 'insufficient_privilege';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'no such job: %', p_job_id using errcode = 'no_data_found';
  end if;

  if p_ok then
    update public.jobs
       set status = 'succeeded',
           locked_by = null,
           locked_until = null,
           last_error = null,
           finished_at = now(),
           updated_at = now()
     where id = p_job_id
    returning * into v_job;

  elsif v_job.attempts >= v_job.max_attempts then
    -- Dead, not failed: no amount of retrying will help, and keeping it "pending" would
    -- mean the queue silently retries a poison job until the sun burns out.
    update public.jobs
       set status = 'dead',
           locked_by = null,
           locked_until = null,
           last_error = coalesce(p_error, 'unknown error'),
           finished_at = now(),
           updated_at = now()
     where id = p_job_id
    returning * into v_job;

  else
    -- Back off exponentially: 5s, 10s, 20s, 40s... capped at an hour. A job that fails
    -- because a dependency is down should not be hammered while it is down.
    update public.jobs
       set status = 'pending',
           run_at = now() + make_interval(secs => least(
             (p_backoff_ms / 1000.0) * power(2, attempts - 1),
             3600
           )),
           locked_by = null,
           locked_until = null,
           last_error = coalesce(p_error, 'unknown error'),
           updated_at = now()
     where id = p_job_id
    returning * into v_job;
  end if;

  return v_job;
end;
$$;

comment on function public.finish_job(uuid, boolean, text, integer) is
  'Records the outcome of a claimed job. Failure backs off exponentially and eventually dead-letters.';

-- A job whose worker vanished is returned to the queue. Called by the runner before it
-- claims, so a crashed process costs one lease period rather than the job.
create or replace function public.release_expired_jobs()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if not public.is_trusted_service() then
    raise exception 'release_expired_jobs is server-only' using errcode = 'insufficient_privilege';
  end if;

  update public.jobs
     set status = 'pending',
         locked_by = null,
         locked_until = null,
         last_error = coalesce(last_error, 'worker lease expired'),
         updated_at = now()
   where status = 'running'
     and locked_until < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. publish_due_scheduled_articles — the one job that must exist
-- -----------------------------------------------------------------------------
-- Scheduling is only honest if the article actually appears. Until now nothing could
-- move a row out of 'scheduled', so the CMS would have silently missed every deadline it
-- accepted. This is the non-interactive publish path.
--
-- It publishes only what is due: status = 'scheduled' AND publish_at <= now(). It does not
-- touch drafts, and it cannot be tricked into publishing early by a future timestamp.
create or replace function public.publish_due_scheduled_articles(p_limit integer default 100)
returns table (article_id uuid, slug text, published_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_trusted_service() then
    raise exception 'publish_due_scheduled_articles is server-only' using errcode = 'insufficient_privilege';
  end if;

  return query
  update public.articles a
     set status = 'published',
         updated_at = now()
   where a.id in (
     select id from public.articles
      where status = 'scheduled'
        and deleted_at is null
        and publish_at is not null
        and publish_at <= now()
      order by publish_at
      limit greatest(1, least(coalesce(p_limit, 100), 1000))
      for update skip locked
   )
  returning a.id, a.slug, a.publish_at;
end;
$$;

comment on function public.publish_due_scheduled_articles(integer) is
  'Moves due scheduled articles to published. The only non-interactive publish path; server-only.';

-- -----------------------------------------------------------------------------
-- 7. Privileges — the queue is server infrastructure
-- -----------------------------------------------------------------------------
alter table public.jobs enable row level security;
-- No policies at all: every access goes through the security-definer functions above,
-- all of which refuse a non-trusted caller. A browser can neither read the queue (job
-- payloads are internal) nor inject work into it.
revoke all on table public.jobs from anon, authenticated;

revoke all on function public.claim_jobs(text, integer, integer) from anon, authenticated;
revoke all on function public.finish_job(uuid, boolean, text, integer) from anon, authenticated;
revoke all on function public.release_expired_jobs() from anon, authenticated;
revoke all on function public.publish_due_scheduled_articles(integer) from anon, authenticated;

grant execute on function public.claim_jobs(text, integer, integer) to service_role;
grant execute on function public.finish_job(uuid, boolean, text, integer) to service_role;
grant execute on function public.release_expired_jobs() to service_role;
grant execute on function public.publish_due_scheduled_articles(integer) to service_role;

-- updated_at is maintained here rather than by a shared trigger, so the queue has no
-- dependency on ordering between migration files.
create or replace function public.touch_job_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists jobs_touch_updated_at on public.jobs;
create trigger jobs_touch_updated_at
  before update on public.jobs
  for each row execute function public.touch_job_updated_at();
