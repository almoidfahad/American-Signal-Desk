# American Signal Desk (ASD)

A US-focused digital news platform: a public news site, a role-aware editorial CMS, and an
AI newsroom / agent control plane.

**Brand line:** *Trusted News. A Stronger America.*

---

## Status — Phases 1 & 3 built; migrations and RLS suites now verified against real PostgreSQL

This repository was empty when work began (one 23-byte README). See
[`docs/PHASE-0-AUDIT.md`](docs/PHASE-0-AUDIT.md) for the audit that justified a greenfield build.

| Phase | State | Evidence |
| --- | --- | --- |
| 0 — Audit & plan | **Done** | `docs/PHASE-0-AUDIT.md` |
| 1 — Foundation | **Done** | typecheck, lint, 130 unit tests, production build all pass locally |
| 2 — Identity & security | **Verified locally** | `docs/PHASE-2-VERIFICATION.md`; migrations apply cleanly, RLS suite passes |
| 3 — Editorial CMS | **Verified locally** | `docs/PHASE-3-REPORT.md`, `docs/PHASE-3B-REVISIONS-CORRECTIONS.md`, migrations `0002`–`0004`, 3 RLS suites pass |
| 4 — Public website | **Scaffolded** | homepage, article, category, search, policy pages, sitemap/robots |
| 5–8 — Agents, billing, deploy, QA | **Not started** | — |

> **Migrations and RLS suites now run against a real PostgreSQL 16.2** (local, via the
> `supabase/tests/harness/` shim) and pass — see `docs/PHASE-2-VERIFICATION.md`. They have
> **not** yet been applied to a hosted Supabase project.
> No test result below is inferred; each was run and is reproduced in the phase reports.

### Verified locally

```
npm run typecheck   → pass (tsc --noEmit, strict, noUncheckedIndexedAccess)
npm run lint        → pass (eslint, --max-warnings=0)
npm test            → pass (130 tests, 9 files)
npm run build       → pass (22 routes prerendered)
npm run test:db     → pass (4 migrations applied + 3 RLS suites, real PostgreSQL 16.2)
```

Live smoke checks against `next dev`: `/` `/article/:slug` `/category/:slug` `/api/health`
`/robots.txt` `/sitemap.xml` return 200; unknown paths return 404; `/admin` redirects to
`/admin/login`; CSP, `X-Frame-Options`, `X-Content-Type-Options` and `Referrer-Policy` are
present on responses; the newsletter endpoint returns **503 NOT_CONFIGURED** (not a fake
success) when no database exists.

### Deployment

Production is live at **https://american-signal-desk.vercel.app** (Vercel, project
`american-signal-desk`, region `iad1`), built from this repository.

**What that deployment actually is:** Phase 1 + 3 code with **no Supabase project, no Redis
and no payments configured**. That is why the homepage states "Content service is not
configured" and `/admin/login` disables sign-in instead of simulating it. The site is a
faithful view of an unbacked build, not a working newsroom. Supplying
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
in the hosting provider's encrypted settings is what turns it into one.

`/api/health` reports that state rather than hiding it: with dependencies missing it returns
**HTTP 503 and `"status": "degraded"`**, so an uptime monitor surfaces the gap instead of
showing green. It returns 200 only when every check is genuinely verified.

### Not verified (and not claimed)

- RLS policies have been executed **only against local PostgreSQL**, not a hosted Supabase
  instance. The shim does not reproduce GoTrue, PostgREST or MFA.
- No Supabase project exists, so auth, session resolution and MFA gating are **unexercised**
  in any environment — including the live deployment.
- Redis, BullMQ, payments, AI providers and GitHub deployment control are **not implemented**.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # leave values blank to run in sample-data mode
npm run dev                    # http://localhost:3000
```

With no environment variables set the site runs in **sample mode**: the UI renders clearly
labelled placeholder articles and a visible banner. It never presents synthetic content as
real reporting, and in a production build it shows an explicit "not configured" notice
instead of sample news.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `start` | Production build and serve |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm test` | Unit tests (Vitest) |
| `npm run test:db` | Migrations + RLS/authorization suites against a real PostgreSQL |
| `npm run test:all` | Unit tests, then the database suites |
| `npm run verify` | typecheck → lint → test → build |

---

## Architecture

```
Browser
  │ https
  ▼
Next.js 16 (App Router, React 19) on Vercel
  ├─ (public)   Server Components, ISR 60s, no private data in shared caches
  ├─ /admin     Cookie session + server-side permission gate on every page/action
  └─ /api/v1    Route Handlers, Zod-validated, request-id correlated
        │
        ├─ src/server/authz     ← pure permission checks (unit-tested)
        ├─ src/server/services  ← business rules (next phases)
        ├─ src/server/content   ← public read layer (published rows only)
        └─ src/server/db        ← Supabase clients
        ▼
Supabase PostgreSQL — UUID PKs, RLS everywhere, append-only audit + ledgers
        ▲
        │
Redis + BullMQ ← separate long-lived Node worker (workers/, Phase 5)
```

### Security decisions already in force

- **Deny by default.** `can()` returns false for unknown roles, unknown permissions, and
  missing actors. Authorization is a pure, tested function — never a UI condition.
- **Agent scopes are a separate namespace from human permissions.** No agent scope maps to
  `article.publish`; a tampered database row still cannot let an agent publish, because
  `agentCan()` rejects forbidden scopes at evaluation time.
- **No development auth bypass.** With no auth backend configured, the admin panel denies
  everything and explains why.
- **Article HTML is sanitised server-side** with an allowlist before render (19 XSS tests).
- **Audit log is append-only at the database level** (trigger blocks UPDATE/DELETE/TRUNCATE).
- **Secrets never reach the browser:** `serverEnv()` throws if called client-side.
- **CSP with a per-request nonce**; `frame-ancestors 'none'`; HSTS in production.
- **Honest states by default.** Missing integrations render "not configured" rather than a
  green light or a fake success response.

---

## Repository layout

```
src/app/(public)/      Homepage, article, category, search, policy pages
src/app/admin/         Admin shell, dashboard, sign-in
src/app/api/           Health probe, versioned API routes
src/components/        Brand, UI primitives, news cards, site chrome
src/server/authz/      Permission matrix + role/agent authorization (pure, tested)
src/server/auth/       Server-side session resolution
src/server/content/    Public read layer, sanitisation, demo fixtures
src/server/editorial/  Article state machine + authorization-checked service layer
supabase/migrations/   Versioned SQL migrations
supabase/tests/        RLS/authorization SQL assertions
tests/                 Vitest unit suites
docs/                  Audit, phase reports, runbooks
```

---

## Before this goes live

1. Create the Supabase project and apply migrations after review (see the Phase 1 report).
2. Run `npm run test:db` against a non-production database and confirm the RLS suite passes.
3. Enable MFA in Supabase Auth; keep `REQUIRE_MFA_FOR_ADMIN` unset or `true`.
4. Have counsel review every draft policy page under `src/app/(public)/policies.ts`.
5. Replace the placeholder `ads@` / `corrections@` addresses with real, monitored mailboxes.
6. Stand up the BullMQ worker before enabling any background feature.

Policy and legal copy in this repository is a working draft, not legal advice.
