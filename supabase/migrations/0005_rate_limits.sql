-- =============================================================================
-- 0005_rate_limits.sql — rate limiting that survives a process restart
-- =============================================================================
-- Why this table exists
--
-- The API rate limiter used a module-level Map. On a serverless platform each request
-- may be a fresh process, so the map is usually empty when the request arrives and the
-- limiter silently does nothing. On a long-lived server it works — until there are two
-- instances, at which point the effective limit is multiplied by the instance count.
--
-- Both failures are invisible: the code looks correct, the tests pass, and the protection
-- is absent. A limiter that cannot count across processes is not a limiter, so the counter
-- moves into the database.
--
-- What this is NOT
--
-- This is not a security boundary and it is not an anti-abuse system. It is back-pressure
-- against accidental hammering: a retrying client, a stuck form, a cheap script. It does
-- not stop a determined attacker — a distributed source simply consumes more budget, and
-- the primary key lookup itself costs a round trip. Anything that needs real protection
-- (credential stuffing, scraping) needs an edge/WAF control, not this table.
--
-- Design notes
--
--   * Fixed window, not sliding: one row per (bucket, window), so the table stays small
--     and the update is a single atomic statement. The cost is a client can spend the full
--     budget at the end of one window and again at the start of the next — a 2x burst. That
--     is an acceptable trade for something that is back-pressure rather than defence, and
--     is stated here so nobody mistakes it for a precise limit.
--   * The key is hashed in the application before it is written, so no raw IP address or
--     email lands in this table. An IP address is personal data in several jurisdictions
--     and this table is retained for hours, not years.
--   * `expires_at` makes every row self-describing, so cleanup is `delete where expires_at
--     < now()` with no knowledge of any bucket's window.
-- =============================================================================

create table if not exists public.rate_limit_hits (
  -- Opaque application-computed bucket key: "<scope>:<sha256(client) truncated>".
  bucket        text        not null,
  -- Start of the fixed window, truncated by the application to the window size.
  window_start  timestamptz not null,
  hits          integer     not null default 0 check (hits >= 0),
  expires_at    timestamptz not null,
  primary key (bucket, window_start)
);

-- Cleanup index: the only bulk query this table ever gets.
create index if not exists rate_limit_hits_expiry_idx on public.rate_limit_hits (expires_at);

comment on table public.rate_limit_hits is
  'Fixed-window counters for API back-pressure. Pure plumbing: no personal data, no authorisation meaning.';

-- -----------------------------------------------------------------------------
-- consume_rate_limit — count one hit and say whether the caller is under budget
-- -----------------------------------------------------------------------------
-- Done as one statement so two concurrent requests cannot both read count = limit and
-- both decide they are allowed. Returns the post-increment count, which the API turns
-- into an honest `Retry-After` instead of a guess.
create or replace function public.consume_rate_limit(
  p_bucket      text,
  p_limit       integer,
  p_window_ms   integer,
  p_now         timestamptz default now()
)
returns table (allowed boolean, hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window_start timestamptz;
  v_hits         integer;
begin
  if p_limit is null or p_limit <= 0 then
    raise exception 'p_limit must be positive' using errcode = '22023';
  end if;
  if p_window_ms is null or p_window_ms <= 0 then
    raise exception 'p_window_ms must be positive' using errcode = '22023';
  end if;

  -- Truncate to the window boundary so every request inside the same window competes for
  -- the same row. Without this every request would create its own window and never limit.
  v_window_start := to_timestamp(
    floor(extract(epoch from p_now) / (p_window_ms / 1000.0)) * (p_window_ms / 1000.0)
  );

  insert into public.rate_limit_hits as r (bucket, window_start, hits, expires_at)
  values (p_bucket, v_window_start, 1, p_now + make_interval(secs => p_window_ms / 1000.0))
  on conflict (bucket, window_start) do update
    set hits = r.hits + 1
  returning r.hits into v_hits;

  return query
    select v_hits <= p_limit,
           v_hits,
           v_window_start + make_interval(secs => p_window_ms / 1000.0);
end;
$$;

comment on function public.consume_rate_limit(text, integer, integer, timestamptz) is
  'Atomically increments a fixed-window counter. Returns whether the caller is still under budget.';

-- -----------------------------------------------------------------------------
-- purge_rate_limits — keep the table from growing without bound
-- -----------------------------------------------------------------------------
create or replace function public.purge_rate_limits(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_hits where expires_at < p_now;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.purge_rate_limits(timestamptz) is
  'Deletes expired counters. Safe to call on a schedule; returns the number of rows removed.';

-- -----------------------------------------------------------------------------
-- RLS — plumbing, not data
-- -----------------------------------------------------------------------------
-- Enabled with no policies, which denies every anon/authenticated access. Only the
-- service role (which bypasses RLS) and the security-definer functions above touch it.
-- Nobody can read another client's counters, and nobody can inflate them.
alter table public.rate_limit_hits enable row level security;

revoke all on table public.rate_limit_hits from anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, timestamptz) to anon, authenticated;
grant execute on function public.purge_rate_limits(timestamptz) to service_role;
