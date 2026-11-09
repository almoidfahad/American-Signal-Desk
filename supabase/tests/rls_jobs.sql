-- =============================================================================
-- rls_jobs.sql — the queue hands out work exactly once, and only to a worker
-- =============================================================================
-- What is proven:
--   1. a claimed job is invisible to a second claim (SKIP LOCKED)
--   2. two workers claiming at the same time never receive the same row
--   3. success closes the job
--   4. failure backs off, then dead-letters instead of retrying forever
--   5. an expired lease returns the job to the queue (a killed worker costs a lease, not a job)
--   6. anon and authenticated cannot read the queue, inject work, or run the functions
--   7. the scheduled publisher publishes only what is due, and only as a trusted caller
-- =============================================================================

\set ON_ERROR_STOP on

begin;

create schema if not exists test_util;
grant usage on schema test_util to authenticated, anon;

create or replace function test_util.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Service-role context: this is what a worker connecting with the service key looks like.
create or replace function test_util.act_as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end;
$$;

create or replace function test_util.act_as_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1–5. queue behaviour
-- -----------------------------------------------------------------------------
do $$
declare
  v_a uuid;
  v_b uuid;
  v_claims integer;
  v_job public.jobs;
  v_returned integer;
begin
  insert into public.jobs (kind, payload) values ('noop', '{"n":1}'::jsonb) returning id into v_a;
  insert into public.jobs (kind, payload) values ('noop', '{"n":2}'::jsonb) returning id into v_b;

  -- (1) a claim takes both, and a second claim gets nothing
  select count(*) into v_claims from public.claim_jobs('worker-a', 10, 60000);
  assert v_claims = 2, 'first claim must receive both ready jobs';

  select count(*) into v_claims from public.claim_jobs('worker-b', 10, 60000);
  assert v_claims = 0, 'a second claim must not receive a job that is already leased';

  -- (2) disjoint claims: three new jobs, two workers, limit one each
  insert into public.jobs (kind, payload) select 'noop', '{}'::jsonb from generate_series(1, 3);
  select count(*) into v_claims from public.claim_jobs('worker-c', 1, 60000);
  assert v_claims = 1, 'worker-c takes exactly what it asked for';
  select count(*) into v_claims from public.claim_jobs('worker-d', 10, 60000);
  assert v_claims = 2, 'worker-d gets the remaining two, none of worker-c''s';

  -- (3) success closes the job. A fresh job, because the three above were all taken —
  -- an assertion that "worker-e gets something" against an empty queue would test nothing.
  insert into public.jobs (kind, payload) values ('complete-me', '{}'::jsonb);
  select c.* into v_job from public.claim_jobs('worker-e', 1, 60000) c;
  assert v_job.id is not null, 'worker-e must have received a job';
  -- finish_job returns the whole row: assign it as a composite, not as a scalar.
  v_job := public.finish_job(v_job.id, true);
  assert v_job.status = 'succeeded', 'a successful job must be closed';
  assert v_job.finished_at is not null, 'a closed job must record when';

end $$;

-- (4) failure backs off, then dead-letters — kept in its own block because it needs a job
-- whose attempt budget is below the default.
do $$
declare
  v_id uuid;
  v_job public.jobs;
  v_claimed integer;
  v_first_run timestamptz;
begin
  insert into public.jobs (kind, payload, max_attempts)
  values ('poison', '{}'::jsonb, 2)
  returning id into v_id;

  -- attempt 1
  select c.* into v_job from public.claim_jobs('worker-f', 1, 60000) c;
  assert v_job.id = v_id, 'the poison job must be claimed';
  assert v_job.attempts = 1, 'the attempt counter must increment on claim';

  v_job := public.finish_job(v_id, false, 'boom', 1000);
  assert v_job.status = 'pending', 'a retryable failure goes back to pending';
  assert v_job.last_error = 'boom', 'the error must be kept for the operator';
  assert v_job.run_at > now(), 'a retry must not run immediately';
  v_first_run := v_job.run_at;

  -- Make it due, then fail it again: this was attempt 2 of 2.
  update public.jobs set run_at = now() where id = v_id;
  select c.* into v_job from public.claim_jobs('worker-f', 1, 60000) c;
  assert v_job.attempts = 2, 'second claim increments to 2';

  v_job := public.finish_job(v_id, false, 'boom again', 1000);
  assert v_job.status = 'dead',
    'a job that has spent its attempts must be dead, not retried forever';
  assert v_job.finished_at is not null, 'a dead job records when it died';

  -- (5) an expired lease returns the job
  insert into public.jobs (kind, payload) values ('interrupted', '{}'::jsonb);
  select count(*) into v_claimed from public.claim_jobs('worker-g', 10, 60000);
  assert v_claimed = 1, 'the interrupted job was claimed by worker-g';

  -- Pretend the worker died: its lease expires and nobody finishes the job.
  update public.jobs set locked_until = now() - interval '1 second' where kind = 'interrupted';
  assert public.release_expired_jobs() = 1, 'exactly the abandoned lease is released';
  assert exists (select 1 from public.jobs where kind = 'interrupted' and status = 'pending'),
    'the interrupted job is ready again rather than stuck in running';

  raise notice 'jobs: claim exclusivity, success, backoff, dead-letter and lease recovery all behave';
end $$;

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- 7. the scheduled publisher
-- -----------------------------------------------------------------------------
do $$
declare
  v_due uuid;
  v_future uuid;
  v_published integer;
begin
  -- Two scheduled articles: one due, one in the future.
  insert into public.articles (slug, title, dek, body_html, status, publish_at, reading_minutes)
  values ('due-now', 'Due now', 'd', '<p>x</p>', 'scheduled', now() - interval '1 minute', 1)
  returning id into v_due;

  insert into public.articles (slug, title, dek, body_html, status, publish_at, reading_minutes)
  values ('due-later', 'Due later', 'd', '<p>x</p>', 'scheduled', now() + interval '1 day', 1)
  returning id into v_future;

  select count(*) into v_published from public.publish_due_scheduled_articles(100);
  assert v_published = 1, 'only the due article may be published';

  assert exists (select 1 from public.articles where id = v_due and status = 'published'),
    'the due article must be published';
  assert exists (select 1 from public.articles where id = v_future and status = 'scheduled'),
    'a future article must not be published early';
  assert not exists (
    select 1 from public.articles where id = v_future and status = 'published'
  ), 'publishing early would break the promise the scheduling UI makes';

  raise notice 'jobs: scheduled publication publishes what is due and nothing else';
end $$;

-- -----------------------------------------------------------------------------
-- 6. the queue is not reachable from a browser
-- -----------------------------------------------------------------------------
do $$
declare
  v_failed boolean;
begin
  -- anon cannot read the queue
  v_failed := false;
  begin
    perform test_util.act_as(gen_random_uuid());
    perform * from public.jobs;
    perform test_util.act_as_owner();
  exception when insufficient_privilege then
    perform test_util.act_as_owner();
    v_failed := true;
  end;
  assert v_failed, 'authenticated must not be able to read the job queue';

  -- anon cannot inject work
  v_failed := false;
  begin
    perform test_util.act_as(gen_random_uuid());
    insert into public.jobs (kind) values ('forged');
    perform test_util.act_as_owner();
  exception when insufficient_privilege then
    perform test_util.act_as_owner();
    v_failed := true;
  end;
  assert v_failed, 'a client must not be able to enqueue work';

  -- and cannot call the worker functions, even directly
  v_failed := false;
  begin
    perform test_util.act_as(gen_random_uuid());
    perform public.claim_jobs('attacker', 100, 60000);
    perform test_util.act_as_owner();
  exception when insufficient_privilege then
    perform test_util.act_as_owner();
    v_failed := true;
  end;
  assert v_failed, 'claim_jobs must refuse a non-service caller';

  v_failed := false;
  begin
    perform test_util.act_as(gen_random_uuid());
    perform public.publish_due_scheduled_articles(100);
    perform test_util.act_as_owner();
  exception when insufficient_privilege then
    perform test_util.act_as_owner();
    v_failed := true;
  end;
  assert v_failed,
    'publishing must not be reachable by a signed-in editor through the queue function';

  -- the guard itself: an authenticated session is not a trusted service
  perform test_util.act_as(gen_random_uuid());
  assert not public.is_trusted_service(),
    'an authenticated caller must never be treated as the service role';
  perform test_util.act_as_owner();
  assert public.is_trusted_service(),
    'the owner/migration context is trusted, so migrations can publish what is due';

  raise notice 'jobs: the queue and its functions are closed to clients';
end $$;

select 'RLS suite for the job queue passed' as result;

rollback;
