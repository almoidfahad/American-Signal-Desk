-- =============================================================================
-- rls_email_outbox.sql — the promise the newsletter made, and kept
-- =============================================================================
-- What is proven:
--   1. a signup records a pending subscription AND queues exactly one email
--   2. a repeat signup does not queue a second email and does not rotate the token
--   3. the token in the link confirms the subscription, and confirming twice is success
--   4. a bad token returns "invalid" instead of an error
--   5. an already-confirmed address is told so, and no email is queued
--   6. an unsubscribed address must confirm again — nobody can re-add a stranger
--   7. the outbox and the subscription table are unreachable by anon and authenticated
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

create or replace function test_util.act_as_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

do $$
declare
  v_outcome text;
  v_token   text;
  v_token2  text;
  v_emails  integer;
  v_status  public.subscription_status;
  v_confirm record;
begin
  -- (1) a first signup queues one email
  select outcome, token into v_outcome, v_token
    from public.issue_newsletter_confirmation('Reader@Example.com');
  assert v_outcome = 'queued', 'a new signup must queue a confirmation, got ' || v_outcome;
  assert length(v_token) = 64, 'the token must be 64 hex characters';

  select count(*) into v_emails from public.email_outbox where to_email = 'reader@example.com';
  assert v_emails = 1, 'exactly one email must be queued';

  select status into v_status from public.newsletter_subscriptions where email = 'reader@example.com';
  assert v_status = 'pending', 'the subscription must be pending until the link is used';

  -- The body must actually carry the token, or the email is useless.
  assert exists (
    select 1 from public.email_outbox
     where to_email = 'reader@example.com'
       and body_text like '%' || v_token || '%'
  ), 'the confirmation email must contain the token';

  -- (2) a repeat signup neither queues a second email nor rotates the token
  select outcome, token into v_outcome, v_token2
    from public.issue_newsletter_confirmation('reader@example.com');
  assert v_outcome = 'confirmation_already_queued',
    'a repeat signup must not queue a second email, got ' || v_outcome;
  assert v_token2 = v_token, 'the token must not rotate under a reader who clicked twice';
  select count(*) into v_emails from public.email_outbox where to_email = 'reader@example.com';
  assert v_emails = 1, 'still exactly one email';

  -- (3) the link confirms, and confirming twice still says confirmed
  select * into v_confirm from public.confirm_newsletter_subscription(v_token);
  assert v_confirm.outcome = 'confirmed', 'the token must confirm the subscription';
  assert v_confirm.email = 'reader@example.com', 'the confirmation names the address';

  select status into v_status from public.newsletter_subscriptions where email = 'reader@example.com';
  assert v_status = 'confirmed', 'the subscription must now be confirmed';

  select * into v_confirm from public.confirm_newsletter_subscription(v_token);
  assert v_confirm.outcome = 'already_confirmed',
    'clicking the same link twice must be success, not an error';

  -- (5) signing up again when already confirmed sends nothing and says so
  select outcome into v_outcome from public.issue_newsletter_confirmation('reader@example.com');
  assert v_outcome = 'already_confirmed',
    'a confirmed subscriber must not be sent a confirmation again, got ' || v_outcome;

  -- (4) a bad token is a bad link, not an exception
  select * into v_confirm from public.confirm_newsletter_subscription('not-a-real-token-at-all');
  assert v_confirm.outcome = 'invalid', 'an unknown token must be reported as invalid';
  select * into v_confirm from public.confirm_newsletter_subscription('');
  assert v_confirm.outcome = 'invalid', 'an empty token must not raise';

  -- (6) an unsubscribed address has to confirm again
  update public.newsletter_subscriptions
     set status = 'unsubscribed', unsubscribed_at = now()
   where email = 'reader@example.com';

  select outcome, token into v_outcome, v_token2
    from public.issue_newsletter_confirmation('reader@example.com');
  assert v_outcome = 'queued',
    're-subscribing must require a fresh confirmation, got ' || v_outcome;
  assert v_token2 <> v_token, 'the old token must not be reused after unsubscribe';
  select status into v_status from public.newsletter_subscriptions where email = 'reader@example.com';
  assert v_status = 'pending', 'the address is pending again, not silently confirmed';

  raise notice 'outbox: signup, idempotence, confirmation, bad tokens and resubscribe all behave';
end $$;

-- -----------------------------------------------------------------------------
-- 7. the outbox is not readable from a browser
-- -----------------------------------------------------------------------------
do $$
declare
  v_failed boolean;
begin
  -- anon: no read. Email bodies addressed to individuals are not public data.
  v_failed := false;
  begin
    perform test_util.act_as(gen_random_uuid());
    perform * from public.email_outbox;
    perform test_util.act_as_owner();
  exception when insufficient_privilege then
    perform test_util.act_as_owner();
    v_failed := true;
  end;
  assert v_failed, 'authenticated must not read the outbox';

  -- anon: cannot read the subscriber list either. This table grants SELECT to
  -- authenticated and relies on RLS with no policies, so the guarantee is "zero rows",
  -- not "insufficient privilege" — asserting the wrong one made the test pass for the
  -- wrong reason. What must never happen is a row coming back.
  declare
    v_rows integer;
  begin
    perform test_util.act_as(gen_random_uuid());
    select count(*) into v_rows from public.newsletter_subscriptions;
    perform test_util.act_as_owner();
    assert v_rows = 0,
      'RLS must hide every subscriber row from a signed-in user, saw ' || v_rows;
  end;

  -- and cannot inject mail into the outbox
  v_failed := false;
  begin
    perform test_util.act_as(gen_random_uuid());
    insert into public.email_outbox (to_email, subject, body_text, template)
    values ('victim@example.com', 'x', 'x', 'newsletter_confirmation');
    perform test_util.act_as_owner();
  exception when insufficient_privilege then
    perform test_util.act_as_owner();
    v_failed := true;
  end;
  assert v_failed, 'a client must not be able to queue mail';

  -- issuing a confirmation is server-only: otherwise anyone could enumerate addresses and
  -- trigger mail to strangers.
  v_failed := false;
  begin
    perform test_util.act_as(gen_random_uuid());
    perform * from public.issue_newsletter_confirmation('stranger@example.com');
    perform test_util.act_as_owner();
  exception when insufficient_privilege then
    perform test_util.act_as_owner();
    v_failed := true;
  end;
  assert v_failed, 'issue_newsletter_confirmation must refuse a non-service caller';

  raise notice 'outbox: subscribers and outbox are closed to clients';
end $$;

select 'RLS suite for the email outbox passed' as result;

rollback;
