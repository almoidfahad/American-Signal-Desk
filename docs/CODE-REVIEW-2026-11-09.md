# Code review — current state of the branch

Reviewed at `1bf9c8c` (branch `arena/7401e56b-american-signal-desk`).
89 files, ~11,000 lines of TypeScript. Gates at time of review: `tsc` clean,
`eslint --max-warnings=0` clean, 154 tests passing across 13 files, production
build compiles.

This is a review of what the code does, not a list of things that are merely
unfinished by design. Every item below was verified by running something: a
grep, a script, a contrast calculation, or a request against the built
application.

---

## What is genuinely sound

These are the parts I would not change, and the reasons they are worth keeping.

1. **The honesty constraint is structural, not stylistic.** `StatCard` takes
   `value: number | null` and has no default. There is no way to pass `0` and
   have it render as "no data", or to omit a value and have it render as `0`.
   The type system enforces the distinction the product depends on. Same idea in
   `src/server/admin/queries.ts`: every read returns `ok | not_configured |
   error`, and the three are rendered differently, so "empty" and "unreachable"
   can never collapse into the same blank table.

2. **Authorization is a pure module with 25 tests, and the deny path is the
   default.** `can()` returns false for an unknown permission, an unknown role,
   or a missing `userId`. Agent scopes live in a namespace that structurally
   cannot contain `article.publish`. That is the sort of rule that survives a
   refactor because it is a test, not a convention.

3. **The database enforces what the UI claims.** Append-only tables have both a
   blocking trigger and no UPDATE/DELETE policy; the migration suites prove it
   by dropping the trigger and watching the test fail. The admin pages describe
   these rules on `/admin/security`, and every claim there maps to a migration.

4. **Every public page is server-rendered with correct heading order.** Measured
   on the running app: sequences are `1-2-2-3-3-3…` with no level skipped, one
   `h1` per page, no duplicate `id`s, no nested `<a>`, no `<div>` inside `<p>`.
   Images always carry alt text; the schema makes it mandatory on upload.

5. **Contrast passes AA.** Computed, not eyeballed: `navy-300` on `navy-950` is
   8.23:1, `navy-500` on white 6.17:1, `signal-600` on white 5.21:1 — all above
   4.5:1 for body text.

6. **The security headers are correct and pinned in both directions.** Framing
   is closed in production and open only in development, and
   `tests/security-headers.test.ts` fails if either half changes.

---

## Defects found

### P1 — real, but nothing is on fire

**1. The rate limiter does not limit on the target platform.**
`src/server/http/respond.ts:73` keeps counters in a module-level `Map`. On
Vercel that module is a per-invocation Lambda, so the map is usually empty when
a request arrives and the limiter effectively does nothing in production. It
works in a long-lived single process, which is what the comment says
("single-instance deployments") — but nothing in the code fails or warns when it
is deployed somewhere it cannot work. The newsletter endpoint is the only
caller, so the exposure is newsletter spam, not account takeover. The honest fix
is either Redis or an explicit startup warning that names the deployment as
unsupported for rate limiting. **Recommendation: warning now, Redis later.**

**2. Nine copies of Supabase client construction.**
`src/server/admin/categories.ts`, `admin/queries.ts`, `admin/stats.ts`,
`content/{breaking,by-category,repository,search,corrections}.ts`,
`editorial/service.ts`. Two of them use a service-role key, seven an anon key,
and the options differ between them (`autoRefreshToken` on some, off on others).
Nothing currently leaks — the service-role clients are all in `src/server/` and
are never imported by a client component — but "which client am I holding?" is a
security-relevant question that should have exactly one answer. **Medium risk,
easy fix, worth doing before the file count grows.**

**3. Two "current time" surfaces can disagree.**
`src/components/news/article-card.tsx:21` formats `publishedAt` in
`America/New_York`; `src/components/news/correction-list.tsx:85` formats in
`UTC`. A correction published at 21:00 ET shows a different date from the
article it corrects. For a newsroom the dateline is a factual claim, so it
should come from one place. **Low severity, but exactly the kind of thing a
reader notices on a corrections page.**

**4. Dead export.** `formatRelative()` in `article-card.tsx` is defined and never
called (verified: `grep` finds only the definition). It also uses `Date.now()`,
which would be a hydration hazard the moment someone used it in a client
component. Delete it rather than leaving a trap.

### P2 — access and clarity

**5. The article form's error wiring is half-connected.**
`article-form.tsx:145` sets `aria-describedby="title-error"` only when the title
has an error, but the element that renders the message has no `id`.
`FieldError` emits `<p role="alert">` with no id, so the attribute points at
nothing. The alert does announce on insert (role=alert), so the error is not
silently lost — but `aria-describedby` is lying about the element it describes.
The other four fields (`slug`, `dek`, `bodyHtml`, `heroImageUrl`) render errors
with no `aria-describedby` and no `aria-invalid` at all, so a screen-reader user
learns about them only through the alert. Fix: give `FieldError` an id
parameter and wire all five fields consistently.

**6. `text-navy-400` on `navy-900` is 4.33:1 — just under AA.**
Used for the account role line in the admin top bar
(`admin-shell.tsx:131`), the sidebar's "Server-authorised" note (`:195`), and the
capability details on the login brand panel (`login/page.tsx:93`). Small text at
10.5px makes this worse, not better. `navy-300` on the same background is 7.46:1
and is already the colour used elsewhere on dark surfaces. **Recommendation:
swap those three to `navy-300`.**

**7. Search results count is computed after a capped fetch.**
`src/server/content/search.ts` limits rows before the page reports "N results".
With more matches than the cap the number is wrong. Either label it "showing the
first N" or return the count from the database. The page currently says
`{results.length} result(s)`, which reads as a total.

**8. Publishing does not flush the section page.**
`actions.ts:190` revalidates `/`, `/article/{slug}` and `/sitemap.xml`. The
article also disappears from `/category/{slug}`, which keeps serving its cached
copy for up to 60s. That is within the stated ISR window, so it is not a
correctness bug — but the comment claims immediate read-your-own-writes, and for
the section page that is not true. Add the section path, or narrow the comment.

### P3 — cosmetic / future

**9. `console.warn` is the only unstructured log** (`src/lib/env.ts:100`).
Everything else uses `console.error` with a bracketed scope. Fine, but the log
line format should be one convention before there is anything to parse.

**10. Nine `it()` blocks in `ui-contract.test.ts` cover three unrelated
concerns** (language, icons, typography, navigation) in one file. It works; if
it grows, split by concern so a failure names its subject.

**11. Untested modules:** `content/search.ts`, `content/breaking.ts`,
`content/by-category.ts`, `admin/queries.ts`, `admin/stats.ts`,
`http/respond.ts`. The last one has real logic (`rateLimit`, `clientKey`,
error mapping) and is the most valuable of the six to cover.

---

## What I did not verify, and why

- **Browser-side behaviour.** There is no headless browser in this environment
  (`npx playwright install chromium` fails on download; `--with-deps` also fails
  on missing fonts). Everything above about rendering was measured by parsing
  the server's HTML output, not by running the page. Client-side interaction —
  the nav drawer, the ticker's step buttons, form validation before submit — is
  argued from the code, not observed.
- **A real Supabase project.** Not authorised, and not created. The admin pages
  have therefore never rendered with real data: every list has been exercised
  only in its `not_configured` branch.
- **Postgres RLS beyond the local shim.** The migration suites run against local
  PostgreSQL 16.2 via a socket-only shim. That proves the triggers and policies;
  it does not prove behaviour under GoTrue or PostgREST.

---

## Recommended order of work

1. Give `FieldError` an id and wire all five fields (accessibility defect, small).
2. Move the three `navy-400`-on-dark strings to `navy-300` (contrast, tiny).
3. Delete `formatRelative`, or use it — leaving it is a trap.
4. Unify the date/dateline formatting into one module.
5. Collapse the nine Supabase client constructions into one factory.
6. Add the rate-limiter deployment warning.
7. Fix or relabel the search count.
8. Add the section path to revalidation.

Items 1–4 are small enough to do together. 5 is a refactor with no behaviour
change and should be its own commit so it can be reverted on its own.

---

## Follow-up: the three-port preview

Reported from a screenshot of the preview panel: one website, three tiles
(`:3000`, `:3111`, `:3112`).

**Cause.** Not a build problem and not a configuration mistake — `next dev` does
not fail when its port is taken. It moves to 3111, then 3112, silently. In this
environment each listening port is surfaced as its own preview, so every dev
server left running from an earlier session added another identical tile, and
nothing on screen said which one was the current build. Two orphaned
`next-server` processes from earlier turns (started 02:56 and 02:57, both with
`cwd` = this repo) were holding 3111 and 3112.

**Fix, in two parts.**

1. `npm run dev` now runs `scripts/dev.mjs` instead of `next dev`. It probes the
   port first and passes `-p` explicitly, so Next cannot choose a port of its
   own. If the port is held by something that is not our own dev server it exits
   `1` with the owner's pid, command and cwd — it refuses to drift. If it *is*
   our own server, it says so and exits `0` rather than starting a twin.
2. `npm run dev:clean` stops every dev server whose cwd is this repo, reporting
   the ports each one held. `next dev` itself is still available as
   `npm run dev:next`, so the launcher can never be the reason someone is
   blocked.

The launcher also clears a stale `.next/dev/lock` (Next 16 writes one containing
pid and port). A lock whose process has died makes Next refuse to boot with
"Another next dev server is already running" and point at a pid that no longer
exists — a genuinely confusing failure after a container restart.

**Note on the check itself:** identity is decided by process (`cwd` + listening
port), not by an `X-Powered-By` header. `next.config.ts` sets
`poweredByHeader: false` on purpose, so a header-based check called our own
healthy server a stranger. That mistake was made and caught by the first run of
the launcher.

`tests/dev-server.test.ts` (4 tests) pins it: the npm scripts point where they
claim, `-p` is passed explicitly, no header-based detection creeps back in, and a
real non-Next process on a real port makes the launcher exit `1` with the
refusal message. Sabotage check: restoring `"dev": "next dev"` fails the first
test with the file named.

---

## Fixed: items 1–4 from the list above (commit follows)

**Dateline, unified — `src/lib/dates.ts`.** Six formatters became one module. The
corrections ledger printed `UTC` while story cards printed `America/New_York`, so a
correction filed at 21:00 in New York carried a date one day later than the article
it corrected. Everything a reader sees is now New York; admin tables are explicitly
the newsroom's clock; `formatDate(null)` returns an em dash rather than an empty
span, and `admin` tables get a hyphen so a dash in a numeric column cannot read as a
minus sign. DST is `Intl`'s problem — there is no offset arithmetic anywhere.

The masthead also had a quieter flaw: `<time dateTime>` was `now.toISOString()` —
the *UTC* date — while the label was the New York date. For four hours every evening
the machine-readable value contradicted the visible one. The `<time datetime>` is now
the New York calendar date (`en-CA` gives ISO-8601 for free). `SiteHeader` also takes
`renderedAt` instead of calling `new Date()` internally, so the render is a pure
function of its input and cannot diverge between server and client.

**Article form, error wiring — all five fields.** `FieldError` now *requires* an
`id`, so an error that `aria-describedby` cannot address is a compile error rather
than a silent half-announcement. `title`, `slug`, `dek`, `bodyHtml` and `heroImageUrl`
each set `aria-invalid` and a `aria-describedby` that names both the help text and
the error when one exists. `bodyHtml`'s "allowed tags" paragraph gained the
`bodyHtml-help` id it was named by but never had.

**Contrast.** The three `navy-400`-on-`navy-900` strings (role line, sidebar note,
login capability details) moved to `navy-300`: 4.33:1 → 7.46:1. The admin search
placeholder was the same 4.33:1 and is placeholder text, not decoration, so it moved
too. Icons stayed at `navy-400` — they are not text and 3:1 is the correct bar.

**`formatRelative` is no longer dead.** It moved into the date module and takes `now`
as a parameter, so it is testable without freezing the clock. It also no longer
prints "in -2 min" when a stamp is in the future (clock skew, scheduled publish).

**`tests/dates-and-a11y.test.ts` (14 tests).** The important ones are structural, not
example-based: no `Intl.DateTimeFormat` or `toLocaleDateString` may exist outside
`src/lib/dates.ts`; no component may call `Date.now()` during render; every
`aria-describedby` value in the form must resolve to an element that exists; every
`<FieldError>` must carry an id; Navy-400 may not be used for text on navy
backgrounds; and navy-300/navy-900 must compute to AA from the hex values actually
in `globals.css`.

Two of these tests were wrong at first and the sabotage run caught it. The
`aria-describedby` test inspected the call sites and passed while the rendered `<p>`
had lost its id — it only checked that `FieldError` was *handed* an id, not that it
used one. It now renders the component's markup and asserts `id={id}` is present.
The `Date.now()` test initially flagged rate limiting and session expiry, which are
legitimately server-side; it is now scoped to components and page files.

---

## Fixed: item 1 — the rate limiter

**The defect.** `respond.ts` kept counters in a module-level `Map`. On Vercel each
request may be a fresh process, so the map is usually empty when the request arrives and
the limiter does nothing. On two long-lived instances the effective limit is multiplied by
two. Neither failure is visible: the code looks correct, the tests pass, nobody is limited.

**The fix.** Counters live in Postgres (`supabase/migrations/0005_rate_limits.sql`), where
every instance reads the same number. The increment is one atomic statement —
`insert … on conflict … do update … returning` — because a read followed by a write lets
two concurrent requests both observe "under budget" and both proceed. Proven on real
PostgreSQL 16.2: 40 concurrent increments from 40 separate connections produce exactly 40.

**What it deliberately is not.** This is back-pressure, not a security boundary. It stops
a retrying client, a stuck form, a cheap script. It does not stop a distributed attacker;
that needs an edge/WAF control. The migration says so in its header, because a comment
claiming more than the code delivers is how the next person builds on sand.

**Degradation is stated, not hidden.** The previous version had one behaviour and no way
to tell how it was performing. Now every decision reports its source:

| situation | behaviour | `X-RateLimit-Source` |
| --- | --- | --- |
| database reachable | authoritative, global count | `database` |
| no database configured | per-instance counter, bounded not absent | `memory` |
| RPC fails / empty answer | same fallback, and the failure is logged | `memory` |

A limiter that quietly fails open is what this commit exists to remove, so the weaker
guarantee is named in a response header rather than being invisible. Denials also carry
`Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`.

**No raw identifiers are stored.** The bucket key is `<scope>:<sha256(identity)[0:32]>`,
computed in the application. An IP address is personal data in several jurisdictions and
an email certainly is; the limiter needs equality, never the value.

**The table is plumbing.** RLS is enabled with no policies and privileges are revoked from
`anon` and `authenticated`, so a client cannot read another client's counters or reset its
own. Only the `security definer` functions touch it.

**Verification**

- `supabase/tests/rls_rate_limits.sql` — counting, window rollover, bucket isolation,
  expiry cleanup, and that `anon`/`authenticated` can neither read nor write the table.
  Runs in the harness with the other suites: *all migrations and RLS suites pass*.
- `tests/rate-limit.test.ts` (12 tests) — hashing, identity extraction, the memory
  fallback, the database path, the empty-answer case, headers, and structural assertions
  that no module reintroduces a `Map` and that the migration uses an atomic upsert.
- Live: sixth request in a minute returns `429` with `retry-after: 60`,
  `x-ratelimit-scope: memory` — honest about running without a database.
- Newsletter endpoint still returns `503 NOT_CONFIGURED` rather than a fake success.

**A sabotage that got away, and what it taught.** Replacing the fallback's
`source: "memory"` with `"database"` passed the first version of the suite — because the
suite never exercised the database path at all, so the only branch that could report
`database` was unreachable in tests. The suite now stubs the client to drive both branches,
and that sabotage fails. The lesson is the same one as in the typography work: a test that
cannot reach the code path cannot defend it.

---

## Phase 5 began: a durable job queue, and the publish path that was missing

**Why this was the next backend step.** Scheduling was a promise the CMS could not keep.
An editor could move an article to `scheduled` with a future `publish_at`, and the UI said
so — but nothing in the system could move a row *out* of `scheduled`. Every deadline the
product accepted would have been silently missed, with the article sitting in a state that
looks like it is queued.

**Architecture: the database is the queue.**

| | choice | reason |
| --- | --- | --- |
| queue backend | a `jobs` table in Postgres | the guaranteed atomic claim already exists; adding Redis buys latency this application does not need |
| delivery | polling (`tick()`), not push | work here is measured in minutes, so a 15s poll is indistinguishable from a notification, and a crashed worker needs no reconnection logic |
| claiming | `SELECT … FOR UPDATE SKIP LOCKED` | two workers receive disjoint sets and neither blocks the other |
| failure | exponential backoff, then dead-letter | a dependency that is down is not improved by hammering it; a poison job is not improved by retrying forever |
| driver | the same `tick()` from two places | `POST /api/cron/tick` (platform scheduler) and `npm run worker` (long-lived loop) |

**The trusted path, and a real bug found by building it.** `publish_due_scheduled_articles`
must run with no user present. Migration 0003 authorised that with `jwt_role()`, which reads
`request.jwt.claims`. Two problems surfaced:

1. `jwt_role()` was not `security definer`, so a trigger or a granted function could not rely
   on the claims being visible to it. It now is, with a pinned `search_path`, and reads them
   through Supabase's `retrieve_own_jwt()` when that exists.
2. **The first version of my replacement was wrong in a way that silently disabled
   authorisation.** `is_trusted_service()` checked `current_user = 'service_role'` — but
   inside a `security definer` function `current_user` is the *function's owner*, not the
   caller. Proven with a probe: inside a definer function, an `authenticated` session still
   reports `current_user = postgres`. That made every caller trusted, and the existing
   workflow suite caught it: *"author publishes own draft directly — statement succeeded but
   should have been rejected"*. The function is now invoker-rights on purpose, and trusts
   either the service-role claim or a missing JWT on a non-request session.

A related trap worth recording: `RETURNS SETOF public.jobs` exposes a `status` column, and
`status` is also a plpgsql built-in (the `GET DIAGNOSTICS` variable). Without
`#variable_conflict use_column`, `claim_jobs` returned zero rows at runtime with no error at
definition time.

**Security posture.** `jobs` has RLS enabled and no policies; every access goes through
`security definer` functions that each refuse a non-trusted caller. `anon` and
`authenticated` are revoked from the table *and* the functions, so a signed-in editor cannot
read the queue, inject work, or publish early by calling the publisher directly — proven in
the suite.

**Verification**

- `supabase/tests/rls_jobs.sql` — claim exclusivity, success, backoff, dead-letter, lease
  recovery, scheduled publication publishing only what is due, and anon/authenticated
  denial. Runs with the other suites: 5 suites pass, all migrations apply.
- `tests/jobs.test.ts` (21 tests) — kinds and handlers stay in step, retryable vs permanent
  failures, a thrown handler, an unknown kind dead-lettered rather than dropped, one bad job
  not stopping the batch, the worker calling the *same* `tick()`, and the cron endpoint's
  constant-time secret comparison.
- End to end against real PostgreSQL 16.2: a `scheduled` article with `publish_at` five
  minutes in the past becomes `published` with a timestamp; a future one does not.
- `POST /api/cron/tick` without a secret returns `401` with no detail about which part failed.
- Sabotage ×2: trusting any JWT fails the *existing* workflow suite; removing
  `publish_at <= now()` fails the job suite.

---

## Newsletter double opt-in: the promise is now kept

**The gap.** The endpoint answered `pending_confirmation`, the schema even had a
`confirm_token` column — and nothing issued a token, sent an email, or could confirm a
subscription. A reader who asked to subscribe was recorded as `pending` and stayed there
forever. Exactly the shape of failure this codebase keeps finding: a data model that appears
to support a promise, and code that cannot keep it.

**The shape of the fix: an outbox, not a direct send.** The endpoint must not send email
inline — it takes hundreds of milliseconds, fails in ways the reader cannot act on, and makes
a signup depend on a third party. So one database function records the subscription, issues
or reuses the token, and queues exactly one row in `email_outbox`; a worker sends it later.
The reader gets an honest 202 immediately, and a provider outage becomes a delayed email
rather than a failed signup. Nothing in the schema knows what Resend is, so the provider stays
swappable.

**Details that are decisions, not defaults**

| situation | behaviour | why |
| --- | --- | --- |
| repeat signup, still pending | no second email, token unchanged | a reader who clicked twice must not be mailed twice |
| already confirmed | `200 already_confirmed`, no email | saying "check your inbox" would be a lie |
| unsubscribed, then returns | new token, new email required | otherwise re-adding a stranger is a one-request attack |
| link opened twice | `already_confirmed` | mail scanners pre-fetch links; a real reader must not see an error |
| database unreachable | `unavailable` — **not** `invalid` | "your link is broken" sends them to request a mail that will also fail |
| no mail provider configured | nothing marked, worker says so | a no-op provider would make every send look successful |

**The token never leaves the server.** It is 64 hex characters from two `gen_random_uuid()`
calls (deliberately not pgcrypto's `gen_random_bytes`, which is absent on the test harness — a
generator that cannot run where tests run is a generator nobody can test). It is stored, put in
the email body, and never returned by the API: a caller holding the token could confirm an
address they do not control.

**A test caught a design mistake.** `src/app/(public)/newsletter/confirm/page.tsx` initially
called `serviceClient()` directly, and `tests/db-client.test.ts` — written when the credential
guard was added — failed with the file named. The fix was not to exempt the page but to move
the decision into `src/server/newsletter/confirm.ts`: a page that talks to the database can
only be tested through HTTP, and the service key should be reachable from exactly one layer.

**Two bugs found by running it**

1. `RETURNS TABLE (outcome, token)` and `RETURNS TABLE (outcome, email)` shadow table columns
   of the same name; without `#variable_conflict use_column` the updates are ambiguous and
   fail at runtime rather than at definition time.
2. The "one queued email per address" guard also fired for a *returning* subscriber, because
   by the time the guard ran the status had already been set back to `pending`. A separate
   `v_returning` flag fixes it — without which unsubscribe-then-return would queue nothing and
   the address could never be confirmed again.

And one test that was asserting the wrong guarantee: `authenticated` can `SELECT` from
`newsletter_subscriptions`; RLS with no policies means **zero rows**, not an exception. The
suite now asserts the row count, which is the property that actually matters.

**Verification.** `supabase/tests/rls_email_outbox.sql` — six behaviour groups plus the
anon/authenticated denials; 19 unit tests covering the outbox states, the provider boundary
(4xx permanent, 5xx and 429 retryable), and the endpoint's refusal to echo the token.
Sabotage ×3 (no-op provider success, retryability inverted, token echoed) all fail. Live: a
bad token renders "We could not check that link" rather than "invalid" while no database is
configured, which is the correct answer in that state.
