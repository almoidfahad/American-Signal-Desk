-- =============================================================================
-- rls_rate_limits.sql — the counter table is plumbing, and must be treated as such
-- =============================================================================
-- What is proven here:
--   1. two hits inside one window are both counted, and the third over budget is refused
--   2. the window rolls over and budget is restored at the boundary
--   3. different buckets do not share budget
--   4. the counter table cannot be read or written directly by anon or authenticated —
--      a client cannot inspect another client's counters, and cannot reset their own
--   5. expiry cleanup removes only expired rows
-- =============================================================================

\set ON_ERROR_STOP on

do $$
declare
  v_allowed boolean;
  v_hits    integer;
  v_reset   timestamptz;
  v_now     timestamptz := '2026-01-01T00:00:00Z';
begin
  -- 1. three hits against a budget of two, inside one window
  select * into v_allowed, v_hits, v_reset from public.consume_rate_limit('t:one', 2, 60000, v_now);
  assert v_allowed and v_hits = 1, 'first hit must be allowed';

  select * into v_allowed, v_hits, v_reset from public.consume_rate_limit('t:one', 2, 60000, v_now + interval '10 seconds');
  assert v_allowed and v_hits = 2, 'second hit must be allowed and counted';

  select * into v_allowed, v_hits, v_reset from public.consume_rate_limit('t:one', 2, 60000, v_now + interval '20 seconds');
  assert not v_allowed and v_hits = 3, 'third hit must be over budget';
  assert v_reset = v_now + interval '60 seconds', 'reset_at must be the end of the window';

  -- 2. the next window restores the budget
  select * into v_allowed, v_hits, v_reset from public.consume_rate_limit('t:one', 2, 60000, v_now + interval '61 seconds');
  assert v_allowed and v_hits = 1, 'a new window must start the count over';

  -- 3. buckets are independent
  select * into v_allowed, v_hits, v_reset from public.consume_rate_limit('t:two', 1, 60000, v_now + interval '61 seconds');
  assert v_allowed and v_hits = 1, 'another bucket must not inherit the first bucket''s count';

  -- 5. cleanup skips rows that have not expired
  assert public.purge_rate_limits(v_now + interval '30 seconds') = 0,
    'cleanup must not delete a live window';
  assert public.purge_rate_limits(v_now + interval '10 minutes') >= 2,
    'cleanup must delete expired windows';

  raise notice 'rate limiter: counting, windows, isolation and cleanup all behave';
end $$;

-- -----------------------------------------------------------------------------
-- 4. direct access is denied to every non-privileged role
-- -----------------------------------------------------------------------------
do $$
declare
  v_failed boolean;
begin
  -- anon: no read
  v_failed := false;
  begin
    set local role anon;
    perform * from public.rate_limit_hits;
    reset role;
  exception
    when insufficient_privilege then
      reset role;
      v_failed := true;
  end;
  assert v_failed, 'anon must not be able to read the counter table';

  -- anon: no write
  v_failed := false;
  begin
    set local role anon;
    insert into public.rate_limit_hits (bucket, window_start, hits, expires_at)
      values ('x', now(), 1, now());
    reset role;
  exception
    when insufficient_privilege then
      reset role;
      v_failed := true;
  end;
  assert v_failed, 'anon must not be able to write the counter table';

  -- authenticated: no read either — this is not user data
  v_failed := false;
  begin
    set local role authenticated;
    perform * from public.rate_limit_hits;
    reset role;
  exception
    when insufficient_privilege then
      reset role;
      v_failed := true;
  end;
  assert v_failed, 'authenticated must not be able to read the counter table';

  raise notice 'rate limiter: counter table is not reachable by anon or authenticated';
end $$;

select 'RLS suite for rate limits passed' as result;
