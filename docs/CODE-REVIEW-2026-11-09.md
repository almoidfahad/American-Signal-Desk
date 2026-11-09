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
