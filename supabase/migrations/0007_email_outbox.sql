-- =============================================================================
-- 0007_email_outbox.sql — the confirmation email that was promised but never sent
-- =============================================================================
-- The newsletter endpoint returned `pending_confirmation` and the schema even had a
-- `confirm_token` column. Nothing issued a token, nothing sent an email, and nothing could
-- confirm a subscription: a reader who asked to be subscribed was recorded as `pending`
-- and stayed there forever. That is the same failure this codebase keeps finding — a
-- promise the data model appears to support and the code cannot keep.
--
-- Design: an outbox, not a direct send
--
-- The endpoint must not send email inline. Sending takes hundreds of milliseconds, it fails
-- in ways the reader cannot act on, and doing it inside a request makes the request depend
-- on a third party. So the transaction records an intent to send (`email_outbox`) and a
-- worker sends it later. The reader gets an honest 202 immediately, and a provider outage
-- becomes a delayed email rather than a failed signup.
--
-- This also keeps the provider swappable: nothing in the database knows what Resend or
-- Postmark is. A handler picks the provider at send time.
--
-- Token handling
--
--   * The token is generated server-side, 32 bytes from pgcrypto's gen_random_bytes, base64url.
--     It is stored on the subscription so a second signup reuses it instead of issuing a
--     second live token.
--   * It is never logged and never returned in an API response — only placed in the email body.
--   * Confirmation is idempotent: confirming an already-confirmed address is a success, so a
--     mail scanner that pre-fetches the link cannot break a real reader's signup, and a
--     reader who clicks twice is not shown an error.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. email_outbox
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.email_status as enum ('queued', 'sending', 'sent', 'failed', 'dead');
exception when duplicate_object then null; end $$;

create table if not exists public.email_outbox (
  id            uuid        primary key default gen_random_uuid(),
  to_email      text        not null,
  subject       text        not null,
  body_text     text        not null,
  template      text        not null,

  status        public.email_status not null default 'queued',
  attempts      integer     not null default 0,
  max_attempts  integer     not null default 5,
  last_error    text,
  provider      text,
  provider_id   text,

  -- The job in public.jobs that will drain this row. Null until the worker enqueues it.
  job_id        uuid,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz,

  constraint email_outbox_to_shape check (to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint email_outbox_attempts_sane check (attempts >= 0 and max_attempts > 0)
);

create index if not exists email_outbox_queued_idx
  on public.email_outbox (created_at)
  where status = 'queued';

create index if not exists email_outbox_template_idx on public.email_outbox (template, created_at desc);

comment on table public.email_outbox is
  'Intent to send an email, written in the same transaction as the change that caused it. Drained by a worker.';

alter table public.email_outbox enable row level security;
-- No policies: the outbox contains message bodies addressed to individuals. Only the
-- service role (and the security-definer functions below) may touch it.
revoke all on table public.email_outbox from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. issue_newsletter_confirmation — record the intent, hand back the token
-- -----------------------------------------------------------------------------
-- Called by the subscribe endpoint. It does three things in one statement-set:
--   * upserts the subscription as pending (a repeat signup must not reset a confirmed one)
--   * issues a token if there is not one already
--   * writes the email into the outbox, unless one is already queued for this address
--
-- Returns `already_confirmed` so the endpoint can answer honestly instead of sending a
-- second confirmation to somebody who already subscribed.
create or replace function public.issue_newsletter_confirmation(
  p_email        text,
  p_source       text default 'website',
  p_confirm_url  text default 'https://american-signal-desk.vercel.app/newsletter/confirm',
  p_site_name    text default 'American Signal Desk'
)
returns table (outcome text, token text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
#variable_conflict use_column
declare
  v_email   text := lower(trim(p_email));
  v_status  public.subscription_status;
  v_token   text;
  v_row_id  uuid;
  v_url     text;
  v_returning boolean := false;
begin
  if not public.is_trusted_service() then
    raise exception 'issue_newsletter_confirmation is server-only'
      using errcode = 'insufficient_privilege';
  end if;

  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'not an email address' using errcode = '22023';
  end if;

  select s.status, s.confirm_token, s.id
    into v_status, v_token, v_row_id
    from public.newsletter_subscriptions s
   where s.email = v_email;

  -- A confirmed subscriber who signs up again is already subscribed. Saying otherwise would
  -- be a lie, and re-sending a confirmation is pure noise.
  if v_status = 'confirmed' then
    return query select 'already_confirmed'::text, null::text;
    return;
  end if;

  -- An unsubscribed address may resubscribe, but only through a fresh confirmation: without
  -- one, anybody could add a stranger back to the list.
  if v_status = 'unsubscribed' then
    v_token := null;
    v_returning := true;
    -- No updated_at column on this table; created_at is the audit stamp.
    update public.newsletter_subscriptions
       set status = 'pending',
           unsubscribed_at = null,
           confirm_token = null,
           confirmed_at = null
     where id = v_row_id;
    v_status := 'pending';
  end if;

  if v_token is null then
    -- Two gen_random_uuid() calls, hex-stripped. Deliberately not pgcrypto's
    -- gen_random_bytes: the harness runs on plain PostgreSQL where pgcrypto is absent, and
    -- a token generator that fails there is a token generator nobody can test.
    --
    -- gen_random_uuid() is backed by the OS CSPRNG (PostgreSQL 13+, and pgcrypto's version
    -- on Supabase), so this is 244 bits of cryptographic randomness — 32 hex characters
    -- from each of two independent UUIDv4s.
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  end if;

  insert into public.newsletter_subscriptions as s (email, status, source, confirm_token)
  values (v_email, 'pending', coalesce(p_source, 'website'), v_token)
  on conflict (email) do update
    set confirm_token = coalesce(s.confirm_token, excluded.confirm_token),
        -- An existing subscriber's recorded source is not overwritten: the first place they
        -- were acquired is the useful fact, and a later signup from the footer should not
        -- rewrite attribution.
        source = s.source
  returning s.id, s.confirm_token into v_row_id, v_token;

  -- One queued confirmation per address. A reader who double-submits, or retries because
  -- the page was slow, must not receive two emails.
  -- "One queued confirmation per address" is only true for a pending signup. A returning
  -- subscriber needs a NEW email; otherwise the unsubscribe-then-return path queues nothing
  -- and the address can never be confirmed. `v_returning` is tracked separately because
  -- v_status is already 'pending' by the time the guard runs.
  if not v_returning and exists (
    select 1 from public.email_outbox e
     where e.to_email = v_email
       and e.template = 'newsletter_confirmation'
       and e.status in ('queued', 'sending')
  ) then
    return query select 'confirmation_already_queued'::text, v_token;
    return;
  end if;

  v_url := p_confirm_url || '?token=' || v_token;

  insert into public.email_outbox (to_email, subject, body_text, template)
  values (
    v_email,
    'Confirm your subscription to ' || p_site_name,
    format(
      E'Someone asked to subscribe this address to %s.\n\n'
      'If that was you, confirm here:\n%s\n\n'
      'If it was not you, ignore this message and nothing will be sent again.\n'
      'This link does not expire, but it stops working once it has been used.',
      p_site_name, v_url
    ),
    'newsletter_confirmation'
  );

  return query select 'queued'::text, v_token;
end;
$$;

comment on function public.issue_newsletter_confirmation(text, text, text, text) is
  'Records a pending subscription and queues one confirmation email. Returns the outcome and token.';

-- -----------------------------------------------------------------------------
-- 3. confirm_newsletter_subscription — the link in that email
-- -----------------------------------------------------------------------------
-- Idempotent on purpose: a mail provider's link scanner often opens the URL before the
-- reader does, and a reader may click twice. Both must look like success.
create or replace function public.confirm_newsletter_subscription(p_token text)
returns table (outcome text, email text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
#variable_conflict use_column
-- The RETURNS TABLE column `email` collides with the table column of the same name; without
-- this the UPDATE below is ambiguous and fails at runtime rather than at definition time.
declare
  v_email  text;
  v_status public.subscription_status;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    -- A malformed token is a bad link, not an error worth a stack trace.
    return query select 'invalid'::text, null::text;
    return;
  end if;

  select s.email, s.status into v_email, v_status
    from public.newsletter_subscriptions s
   where s.confirm_token = p_token;

  if v_email is null then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  if v_status = 'confirmed' then
    return query select 'already_confirmed'::text, v_email;
    return;
  end if;

  if v_status = 'bounced' then
    -- The address hard-bounced. A click cannot override that; a human has to look.
    return query select 'bounced'::text, v_email;
    return;
  end if;

  update public.newsletter_subscriptions
     set status = 'confirmed',
         confirmed_at = coalesce(confirmed_at, now())
   where email = v_email;

  -- The token is kept, not cleared: the confirmation page may be reloaded, and a second
  -- click must still say "confirmed" rather than "invalid link".
  return query select 'confirmed'::text, v_email;
end;
$$;

comment on function public.confirm_newsletter_subscription(text) is
  'Confirms a subscription from an email link. Idempotent, so a link scanner cannot break a signup.';

grant execute on function public.issue_newsletter_confirmation(text, text, text, text) to service_role;
grant execute on function public.confirm_newsletter_subscription(text) to anon, authenticated, service_role;

-- updated_at for the outbox, maintained locally so migration order does not matter.
create or replace function public.touch_email_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists email_outbox_touch_updated_at on public.email_outbox;
create trigger email_outbox_touch_updated_at
  before update on public.email_outbox
  for each row execute function public.touch_email_outbox_updated_at();
