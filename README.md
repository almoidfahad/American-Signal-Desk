# American Signal Desk

A newsroom platform: public site, editorial CMS, permissions, audit trail, and the
background work that keeps a publication's promises.

This repository was empty when work began (one 23-byte README). See
[`docs/PHASE-0-AUDIT.md`](docs/PHASE-0-AUDIT.md) for the audit that justified a greenfield
build, and [`docs/CODE-REVIEW-2026-11-09.md`](docs/CODE-REVIEW-2026-11-09.md) for a candid
review of what is and is not yet sound.

> **Every number in this file was produced by running something.** Where a claim is not
> verified, it says so and says why. That rule is the reason the project exists in this
> shape: a status document that flatters the code is worse than no status document.

---

## Status

| Area | State | Evidence |
| --- | --- | --- |
| Foundation | **Done** | strict TypeScript, ESLint zero-warning, 300 unit tests, production build |
| Identity & RBAC | **Verified against real PostgreSQL** | `docs/PHASE-2-VERIFICATION.md`, `rls_identity.sql` |
| Editorial CMS | **Verified against real PostgreSQL** | `docs/PHASE-3-REPORT.md`, migrations `0002`–`0004` |
| Public website | **Built** | homepage, article, category, search, corrections, policy pages, sitemap/robots |
| Rate limiting | **Done** | `0005_rate_limits.sql`, `rls_rate_limits.sql` — counted in the database, not per process |
| Background jobs | **Done** | `0006_job_queue.sql`, `rls_jobs.sql`, `src/server/jobs/` |
| Newsletter double opt-in | **Done** | `0007_email_outbox.sql`, `rls_email_outbox.sql`, `src/server/email/` |
| Agents, billing, deploy control, QA sweep | **Not started** | — |

Verified locally, at the time of writing:

```
npm run typecheck   → pass (tsc --noEmit, strict, noUncheckedIndexedAccess)
npm run lint        → pass (eslint --max-warnings=0)
npm test            → pass (300 tests, 24 files)
npm run build       → pass (16 pages prerendered, 3 API routes)
npm run test:db     → pass (6 migrations applied + 6 RLS/authorization suites, PostgreSQL 16.2)
```

### Not verified, and therefore not claimed

- **A hosted Supabase project does not exist.** Migrations and RLS suites run against local
  PostgreSQL 16.2 through `supabase/tests/harness/`, which reproduces roles, `auth.users` and
  `auth.uid()`. It does **not** reproduce GoTrue, PostgREST or MFA. Auth, session resolution
  and MFA gating are therefore unexercised in every environment, including the live
  deployment.
- **The browser is untested.** There is no headless browser in the build environment, so
  rendering claims were measured by parsing server HTML, not by running a page. Client-side
  interaction — the nav drawer, the ticker, form validation before submit — is argued from
  the code, not observed.
- **Payments, AI providers, agent registry and deployment control are not implemented.** Their
  admin pages use a `PlannedFeature` panel that names what is missing (for example "No agents
  table"), rather than a disabled button or invented data. The authorization half of the agent
  model is real and unit-tested; the registry that would store agents is not built.
- **Redis is not used.** See "Background work" below — that is a decision, not a gap.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # leave values blank to run in sample-data mode
npm run dev                    # http://localhost:3000
```

With no environment variables the site runs in **sample mode**: clearly labelled placeholder
articles behind a visible banner. It never presents synthetic content as real reporting, and
a production build with no database shows an explicit "not configured" notice instead.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on a **fixed** port; refuses to drift to 3111 |
| `npm run dev:clean` | Stop every dev server belonging to this repo |
| `npm run dev:next` | Escape hatch: raw `next dev`, which may pick its own port |
| `npm run build` / `start` | Production build and serve |
| `npm run worker` | Background job worker, polling every 15s |
| `npm run worker:once` | One tick, print the result, exit |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm test` | Unit tests (Vitest) |
| `npm run test:db` | Migrations + RLS/authorization suites against a real PostgreSQL |
| `npm run test:all` | Unit tests, then the database suites |
| `npm run verify` | typecheck → lint → test → build |

`npm run dev` is a small launcher rather than `next dev` because `next dev` moves to the next
free port when its port is taken. In a preview environment every listening port becomes its
own tile, so a forgotten server produces three identical previews and nothing says which is
live. The launcher passes `-p` explicitly and exits non-zero instead of drifting.

---

## Architecture

```
Browser
  │ https
  ▼
Next.js 16 (App Router, React 19) on Vercel
  ├─ (public)    Server Components, ISR 60s, no private data in shared caches
  ├─ /admin      Cookie session + server-side permission gate on every page and action
  ├─ /api/v1     Route handlers, Zod-validated, request-id correlated
  └─ /api/cron   One job-queue tick, authenticated by a constant-time secret comparison
        │
        ├─ src/server/authz     ← pure permission checks (unit-tested)
        ├─ src/server/editorial ← article state machine + authorization-checked writes
        ├─ src/server/content   ← public read layer (published rows only)
        ├─ src/server/jobs      ← queue runner and handlers (one tick, two drivers)
        ├─ src/server/http      ← uniform responses, rate limiting
        └─ src/server/db        ← the only place a Supabase client is constructed
        ▼
Supabase PostgreSQL — UUID keys, RLS everywhere, append-only audit and ledgers
        ▲
        │  jobs table (SKIP LOCKED claim) + fixed-window rate-limit counters
        │
scripts/worker.mjs  (long-lived loop)     /api/cron/tick  (platform scheduler)
```

### Background work

The queue is a **table**, not a broker. Its guarantee — an atomic claim — is something
Postgres already provides, and adding Redis would buy latency this application does not need.
What it gives up is push notification: a worker polls. For work measured in minutes
(scheduled publication, counter cleanup) a 15-second poll is indistinguishable from a
notification, and a crashed worker then needs no reconnection logic.

- Claiming uses `SELECT … FOR UPDATE SKIP LOCKED`, so two workers receive disjoint batches.
- Failures back off exponentially and **dead-letter** after `max_attempts`. A poison job is
  not retried until the sun burns out, and a dependency that is down is not hammered.
- A worker that dies leaves a lease; the next tick releases it rather than losing the job.
- `tick()` is one function with two drivers — `npm run worker` and `POST /api/cron/tick` — so
  there is one implementation of the behaviour and no second copy to drift.

The queue exists because of one specific promise: an editor can schedule an article, and
until this was built nothing could move a row out of `scheduled`. Every deadline the product
accepted would have been silently missed.

The admin Queue Monitor reads this queue rather than describing it: counts per status, outbox
depth, the fifteen most recently touched jobs, and a "moving / no recent activity" verdict
derived from whether a job was actually claimed or finished in the last five minutes. That
verdict is deliberately **not** derived from `CRON_SECRET` or `REDIS_URL` being set — a secret
means a call *could* be authenticated, not that one is arriving. The page previously stated
that no worker process existed and that nothing promoted scheduled articles; both were true
once and were wrong by the time anyone read them again.

### Newsletter: double opt-in, in an outbox

The endpoint used to answer `pending_confirmation` while nothing sent that confirmation — a
reader who asked to subscribe was recorded as `pending` and stayed there. Now one database
function records the subscription, issues the token and queues exactly one email, in the same
statement set; a worker drains the outbox.

- **The token is never returned by the API.** It travels in the email only.
- **Repeat signups do not queue a second email** and do not rotate the token.
- **Confirming is idempotent.** A mail scanner that opens the link first, or a reader who
  clicks twice, is told "already confirmed" rather than shown an error.
- **An unsubscribed address must confirm again.** Re-adding a stranger's address is otherwise
  a one-request attack.
- **No provider configured is a supported state.** Nothing is marked, no attempt budget is
  spent, and the worker says so. A no-op provider would have made every send look successful.

### Rate limiting

Counters live in Postgres (`0005_rate_limits.sql`), because a module-level `Map` is not a
limiter on a serverless platform: the map is per process, so the count resets on every cold
start and is multiplied by the instance count. Every decision reports which guarantee applied
through `X-RateLimit-Source` (`database` when global, `memory` when the per-instance fallback
was used), so a degradation is visible rather than silent.

This is **back-pressure, not a security boundary**. It stops a retrying client, a stuck form
or a cheap script. It does not stop a distributed attacker; that needs an edge/WAF control.

### Security decisions in force

- **Deny by default.** `can()` returns false for unknown roles, unknown permissions and
  missing actors. Authorization is a pure, tested function — never a UI condition.
- **Agent scopes are a separate namespace from human permissions.** No agent scope maps to
  `article.publish`; `agentCan()` rejects forbidden scopes at evaluation time.
- **The service-role client is a type you cannot forge.** `ServiceClient` carries a brand
  built on a symbol that is never exported, so passing the publishable-key client where
  RLS-bypass is assumed is a compile error. One construction site, `src/server/db/client.ts`.
- **No development auth bypass.** With no auth backend configured, the admin panel denies
  everything and explains why.
- **Article HTML is sanitised server-side** with an allowlist before render (19 XSS tests).
- **The audit log is append-only at the database level** — a trigger blocks UPDATE, DELETE and
  TRUNCATE, and the suites prove it by dropping the trigger and watching the test fail.
- **Secrets never reach the browser:** `serverEnv()` throws if called client-side, and the
  service-role key may not be read outside the factory (enforced by test).
- **CSP with a per-request nonce**, `frame-ancestors 'none'` in production, HSTS in production.
- **Honest states by default.** A missing integration renders "not configured" rather than a
  green light or a fake success response. `/api/health` returns 503 while dependencies are
  missing, so an uptime monitor surfaces the gap instead of showing green.

---

## Repository layout

```
src/app/(public)/      Homepage, article, category, search, corrections, policy pages
src/app/admin/         Admin shell, dashboard, article workflow, sign-in
src/app/api/           health · v1/newsletter · cron/tick
src/components/        Brand, UI primitives, news cards, site chrome, admin controls
src/lib/               Environment schema, validation, dates (one formatter, one timezone)
src/server/authz/      Permission matrix + role/agent authorization (pure, tested)
src/server/auth/       Server-side session resolution
src/server/content/    Public read layer, sanitisation, demo fixtures
src/server/db/         The only Supabase client construction site
src/server/editorial/  Article state machine + authorization-checked service layer
src/server/jobs/       Queue runner, handlers, kinds and schedules
src/server/email/      Outbox drain and the mail-provider boundary
src/server/http/       Uniform responses and the rate limiter
scripts/               dev launcher, job worker, TypeScript alias resolver
supabase/migrations/   Versioned SQL migrations (0001–0007)
supabase/tests/        RLS/authorization SQL suites (6)
tests/                 Vitest unit suites (21 files)
docs/                  Audit, phase reports, code review
```

---

## Before this goes live

1. Create the Supabase project and apply migrations after review. Confirm `/api/health`
   returns 200 rather than 503.
2. Run `npm run test:db` against a non-production database and confirm all six suites pass.
3. Enable MFA in Supabase Auth; keep `REQUIRE_MFA_FOR_ADMIN` unset or `true`.
4. Set `CRON_SECRET` and point a scheduler at `POST /api/cron/tick`, or run `npm run worker`.
   **Without one of the two, scheduled articles never publish** — the queue exists but nothing
   drives it.
5. Have counsel review every draft policy page under `src/app/(public)/`.
6. Replace the placeholder `ads@` / `corrections@` addresses with real, monitored mailboxes.
7. Set `RESEND_API_KEY` and `EMAIL_FROM`, or the confirmation emails stay queued forever and
   every signup sits at `pending`. The queue reports "not configured" rather than pretending;
   the admin configuration page names the missing variables.

Policy and legal copy in this repository is a working draft, not legal advice.
