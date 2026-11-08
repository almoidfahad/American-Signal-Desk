# Phase 0 — Repository Audit & Implementation Plan

**Project:** American Signal Desk (ASD)
**Branch:** `arena/34196fc7-american-signal-desk`
**Base commit:** `c7a0a503abd199a392d88b60149fad7b6dba6c6f` (`main`)
**Audit date:** 2026-11-08

---

## 1. Current State (verified, not assumed)

| Check | Command | Result |
| --- | --- | --- |
| Tracked files | `git ls-files \| wc -l` | **1** |
| Only tracked file | `git ls-files` | `README.md` (23 bytes, just the title line) |
| Commits | `git log --oneline` | 1 (`Initial commit`) |
| Remote branches | `git ls-remote --heads origin` | `refs/heads/main` only |
| Package manager | — | None (no `package.json`, no lockfile) |
| Framework | — | None |
| Routes | — | None |
| Database / migrations | — | None |
| Auth | — | None |
| Environment variables | — | None defined (no `.env`, no `.env.example`) |
| Tests | — | None |
| CI/CD | — | None (no `.github/`) |
| Deployment config | — | None (no `vercel.json`, no Dockerfile) |
| Local Postgres / psql / docker | `which psql postgres docker` | **Not installed** in this sandbox |

**Conclusion:** there is no existing architecture, data, or working functionality to preserve.
A greenfield build is justified here *by evidence*, not by preference. The "do not rebuild
from scratch" rule does not create a conflict because nothing exists to overwrite.

### What already works
- Git repo is connected to `github.com/almoidfahad/American-Signal-Desk` and authenticated via `gh`.
- Node 22.22.3 / npm 10.9.8 are available.
- A Supabase connector is authorized (org: `almoidfahad's Org`, id `nvzdtellxsolovaexwnr`).
  **No Supabase projects exist yet** (`list_projects` → empty).

### What is missing (blocking items, see §6)
- No Supabase project → no Auth, no PostgreSQL, no Storage, no MFA.
- No Redis instance → BullMQ workers cannot be verified end-to-end.
- No paid/`external` integrations available in this sandbox: no AI provider key configured,
  no Stripe/payment account, no Vercel project, no Cloudflare zone.
- No local PostgreSQL/Redis binaries, and the sandbox's outbound network is restricted to
  `github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org`,
  `files.pythonhosted.org` — so I cannot install system packages or reach arbitrary hosts
  (e.g. Supabase's data plane, Redis, payment APIs) from `bash`.

---

## 2. Hard Constraint Discovered During Audit (important)

The build prompt asks for automated **integration tests against real Supabase, RLS tests, and
queue/webhook failure tests**. Two environment facts limit how far I can *verify* those here:

1. `bash` can reach only the allow-listed hosts above. Postgres/Redis/AI/payment calls from
   scripts will fail. Supabase work must go through the Supabase connector tools, not raw
   connections from the sandbox.
2. No local database engine is installed and no package installation is possible.

**Therefore my testing strategy is layered, and I will label results honestly:**

- **Tier A — runs here, in CI, and on your machine:** unit tests (pure logic: permissions
  matrix, credit ledger arithmetic, API-key hashing, state-machine transitions, Zod schemas),
  TypeScript typecheck, ESLint, production build.
- **Tier B — runs wherever a real Postgres exists (Supabase CI or your machine):** SQL test
  suites that assert RLS policies and ledger concurrency behave correctly. I will write
  these, ship them runnable (`npm run test:db`), and report them as *written but not yet
  executed* unless a database becomes reachable.
- **Tier C — requires your accounts:** payment webhooks, AI provider calls, GitHub App
  deployment, Vercel/Cloudflare. Code will be written against documented contracts with
  signature verification and idempotency; it will be reported as *unverified until keys exist*.

I will never report a Tier B/C check as passing when it has not actually run.

---

## 3. Architecture (proposed)

```
Browser
  │  https
  ▼
Next.js 16 App Router on Vercel
  ├── (public)   Server Components + ISR/revalidate-tag, no private data in shared cache
  ├── (admin)    Cookie session (httpOnly, SameSite=Lax) + server-side policy gate on every action
  └── /api/v1    Route Handlers: public read / editorial / agent / billing / deploy
        │
        ├── Service layer (src/server/services)   ← all business rules, Zod-validated
        ├── Policy layer  (src/server/authz)      ← deny-by-default permission checks, pure & testable
        ├── Repo layer    (src/server/db)         ← parameterized SQL / Supabase clients
        ▼
Supabase PostgreSQL  (UUID PKs, FKs, RLS on every user-facing table, append-only ledgers/audit)
        ▲
        │
Cloudflare (DNS/WAF/CDN) ── Vercel (web)
                                  │  enqueue
                                  ▼
                          Redis + BullMQ  ←──── separate persistent Node worker (workers/)
                                  │
                                  └── AI provider / news sources / email / GitHub / deploy
```

**Layering rule enforced by lint boundaries:** route handlers may call services; services may
call policy + repo; repos may call SQL. Nothing skips layers. UI never contains authorization.

### Security boundaries
- Public read API and authenticated APIs are separate surfaces.
- Agent machine identities: scoped, expiring, revocable keys; **hashed at rest**; plaintext shown once.
- Agent tool scopes (`articles:draft`, `jobs:run`, `repo:read`…) are a disjoint namespace from
  human editorial permissions (`article.publish`). An agent can never hold `article.publish`.
- All privileged mutations write an **append-only** `audit_logs` row.
- Credits: append-only `credit_ledger`; balance = SUM(ledger). Reservation/settlement in one
  SQL transaction with `SELECT … FOR UPDATE` on the account row + idempotency key uniqueness.

---

## 4. Phased Plan, Dependencies, Acceptance Criteria

| Phase | Scope | Depends on | Exit criteria (verifiable) |
| --- | --- | --- | --- |
| **0** | This audit + plan | — | Report committed; no code changes made blindly ✅ |
| **1** | Next.js 16 + TS strict + Tailwind 4 design system + env validation (Zod) + CI + error/logging spine | 0 | `npm run typecheck`, `npm run lint`, `npm run build` pass; CI workflow committed |
| **2** | Identity: profiles/roles/permissions/user_roles schema + RLS + auth session + MFA gate + audit log | 1 | Permission matrix unit tests pass; RLS policies written with SQL tests; unauthenticated request to `/admin` and to a privileged action both denied (test) |
| **3** | Editorial CMS: categories, authors, articles, revisions, reviews, state machine, media | 2 | State-machine unit tests; Author-cannot-publish-other's-article test; soft-delete + audited purge path |
| **4** | Public site: homepage, category, article, author, search, SEO (metadata/OG/canonical/sitemap/robots/JSON-LD), newsletter | 3 | Build passes; public queries only hit published rows; no admin data in public bundle |
| **5** | Agents + versioned API + keys + BullMQ queues + Redis/queue monitor | 2,3 | Key hashing/revocation tests; scope-enforcement tests; queue retry/backoff/DLQ config with failure tests (Tier C for live Redis) |
| **6** | Credits + billing: ledger, reservations, webhook verification, idempotency, reconciliation | 3,5 | Concurrent-spend test (Tier B SQL); duplicate-webhook idempotency unit test |
| **7** | Deployment control: GitHub App/PAT-scoped checks, PR-only, preview → approval → production, rollback | 5 | "No production deploy without approval" enforced in service + test |
| **8** | QA: security review, perf, backup/restore runbook, monitoring, deploy checklist | all | Documented runbooks; known-risk register closed or accepted |

### Risk register (initial)
| # | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | No Supabase project → cannot apply migrations or run RLS tests | Phase 2+ unverifiable | Build migrations as plain SQL in `supabase/migrations/`; ask for approval to create a project |
| R2 | No Redis → BullMQ unverifiable | Phase 5/6 | Ship docker-compose + worker; label as unverified |
| R3 | Sandbox network lockdown | Can't smoke-test live integrations | Tier A/B/C labeling above |
| R4 | Scope is enormous (16 sections, 8 phases) | Half-finished breadth | Build vertical slices that actually work; honest status per phase |
| R5 | TypeScript 7 / dependencies are very new | Instability | Pin exact versions; pin TS 5.9.3 stable rather than 7.x RC-era |
| R6 | Payments/credits are money-adjacent | Financial bug | No fake success paths; ledger-only balance; idempotency keys mandatory |
| R7 | AI-generated news integrity/legal | Reputational/legal | Untrusted-draft-by-default, provenance trail, human approval, no auto-publish |

### Dependency/version decisions (checked against the registry today, not assumed)
- `next@16.4.5`, `react@19.3.1`, `react-dom@19.3.1` (Next 16 peer range accepts React 19).
- `typescript@5.9.3` — deliberately **not** the 7.0.x `latest` tag. TypeScript 7 is a brand-new
  major; for a production build I pin the last proven 5.9 line and note the upgrade as a
  follow-up decision for you.
- `tailwindcss@4.3.5` (v4 CSS-first config), `@supabase/supabase-js@2.119.0`,
  `zod@4.6.7`, `bullmq@6.7.2` + `ioredis@6.0.0`, `vitest@5.1.0`.

---

## 5. Proposed Next Slice (safest, highest value)

**Phase 1 + the Phase 2 schema, in one reviewable slice:**

1. Project scaffold that builds and passes lint/typecheck/CI (real, runnable).
2. ASD design system matching the supplied screens (navy/white/red, branded header, footer).
3. Environment contract (`src/env.ts`, Zod, fails fast on missing secrets, server-only guards).
4. `supabase/migrations/0001_init.sql` — identity + RBAC + audit tables with RLS enabled and
   policies, plus pure-TS permission logic and its unit tests.

This ordering is deliberate: no feature can be secured before roles/permissions exist, and no
migration should be applied to your database before you approve it.

---

## 6. Decisions I need from you

1. **Supabase project** — may I create one on org `almoidfahad's Org` (free plan), and in which
   region? Creating it is an externally visible action, so I want explicit approval first.
2. **Migrations** — I will author SQL in `supabase/migrations/`. Apply to the live project now,
   or hold until you review?
3. **TypeScript** — accept my pin of 5.9.3, or do you want 7.0.x?
4. **Redis/BullMQ hosting** — Upstash (Vercel-friendly) or a container on a VPS? Affects the
   worker deployment target.
5. **Payments** — Stripe assumed for the credit wallet; confirm provider before Phase 6.

Nothing above blocks Phase 1, so I am proceeding with the scaffold and schema now and will not
touch your database until you answer (1) and (2).
