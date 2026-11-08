# Phase 1 Report — Foundation

**Date:** 2026-11-08
**Branch:** `arena/34196fc7-american-signal-desk`

---

## 1. Files created

### Configuration
| File | Purpose |
| --- | --- |
| `package.json` | Pinned dependency set, scripts including `verify` and `test:db` |
| `next.config.ts` | Security headers, no-store on `/admin` and `/api`, AVIF/WebP images |
| `tsconfig.json` | Strict, `noUncheckedIndexedAccess`, `noImplicitOverride` |
| `eslint.config.mjs` | Next config + zero-warning policy + rule against encoding authz in markup |
| `vitest.config.mts` | Node environment, `@/` alias |
| `postcss.config.mjs` | Tailwind v4 plugin |
| `.env.example` | Full environment contract, documented as never-commit |
| `.gitignore` | Ignores `.env*` but keeps `.env.example` |
| `.github/workflows/ci.yml` | Typecheck, lint, test, build, `npm audit`, secret-scanning guards |

### Design system
- `src/app/globals.css` — navy/white/red tokens, `prefers-reduced-motion` handling, visible
  focus rings, `skip-link`, `prose-asd` article typography.
- `src/components/brand.tsx` — SVG star mark + wordmark (dark/light, three sizes).
- `src/components/ui/styles.ts` — button/card/status primitives, article-status metadata.
- `src/components/ui/states.tsx` — `EmptyState`, `NoticeBanner`, **`NotConfigured`**.

### Security core
- `src/lib/env.ts` — Zod env contract; `serverEnv()` throws if called in the browser.
- `src/lib/validation/auth.ts` — email, password, login, newsletter schemas.
- `src/server/authz/permissions.ts` — 44 human permissions, 5 roles, 9 agent scopes, 14
  forbidden agent scopes, `can()`, `requirePermission()`, `agentCan()`, `validateAgentScopes()`.
- `src/server/auth/session.ts` — `getAdminSession()` (memoised), `requireAdminSession()`,
  `requirePermission()`, `tryAdminSession()`; MFA policy defaults to required.
- `src/server/http/respond.ts` — uniform API envelope with request ids, safe error mapping,
  fixed-window rate limiter.
- `src/server/content/sanitize.ts` — allowlist HTML sanitiser for article bodies.
- `src/proxy.ts` — per-request CSP nonce, admin session refresh, cookie-presence gate.
- `src/server/editorial/workflow.ts` — article state machine (9 statuses, 12 transitions).

### Public site
`src/app/(public)/layout.tsx`, `page.tsx` (homepage), `article/[slug]/page.tsx`,
`category/[slug]/page.tsx`, `search/page.tsx`, `about`, `contact`, `advertise`, `newsletter`,
`[...policy]` + `policies.ts`. Plus `src/app/sitemap.ts`, `src/app/robots.ts`,
`src/app/not-found.tsx`, `src/app/error.tsx`.

Components: `site/header.tsx`, `site/footer.tsx`, `site/breaking-ticker.tsx`,
`news/article-card.tsx` (card, lead story, compact pick, meta line).

### Admin
`src/app/admin/layout.tsx`, `src/app/admin/page.tsx` (honest dashboard),
`src/app/admin/login/page.tsx` + `login-form.tsx`, `src/server/admin/stats.ts`.

### Database (written, **not applied**)
- `supabase/migrations/0001_identity_rbac.sql` — profiles, permissions, role_permissions,
  user_roles, audit_logs (append-only via trigger), SECURITY DEFINER helpers with pinned
  `search_path`, RLS on all five tables.
- `supabase/migrations/0002_editorial_content.sql` — categories, authors, articles (generated
  `tsvector`, status-dependent CHECK constraints), breaking_news, newsletter_subscriptions,
  `published_articles` view (`security_invoker`), `search_articles` RPC.
- `supabase/tests/rls_identity.sql` — 6 assertion groups impersonating `authenticated`/`anon`.

### Tests
`tests/permissions.test.ts` (25), `tests/workflow.test.ts` (16), `tests/sanitize.test.ts` (19),
`tests/validation.test.ts` (10).

---

## 2. Commands run and their real results

| Command | Result |
| --- | --- |
| `npm install` | 411 packages + 18 (sanitize-html) + 1 (`@types`) installed |
| `npm run typecheck` | **pass**, 0 errors |
| `npm run lint` | **pass**, 0 errors, 0 warnings (3 initial warnings fixed by using `next/link`) |
| `npm test` | **pass**, 70/70 tests, 4 files |
| `npm run build` | **pass**, compiled in 1.7s, 17 routes |
| `curl /` | 200 |
| `curl /article/sample-white-house-economic-plan` | 200 |
| `curl /category/business` | 200 |
| `curl /admin` (no redirect follow) | **307 → /admin/login** |
| `curl /api/health` | 200, `database: not_configured` |
| `curl /robots.txt`, `/sitemap.xml` | 200 |
| `curl /nonexistent-page` | 404 |
| `POST /api/v1/newsletter/subscribe` (valid email) | **503 NOT_CONFIGURED** — no fake success |
| `POST /api/v1/newsletter/subscribe` (bad email) | 422 VALIDATION |
| Response headers on `/` | CSP with nonce, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` all present |

### Defects found and fixed during the phase (by running the code, not by review)

1. **`npm install` dependency resolution failure** — three pinned versions did not exist.
   Resolved against the registry and pinned real versions.
2. **A published article could not be moved to trash.** Caught by `tests/workflow.test.ts`.
   The transition table was wrong, not the test; the table was fixed and the `publicImpact`
   flag documents that trashing a live article unpublishes it.
3. **`next.config.ts` rejected `eslint` key** — caught by `tsc`.
4. **`countOf` in `stats.ts` forced `any`/`never` casts** — rewritten with an explicit
   `status?` parameter that preserves Supabase's typed builder.
5. **Next 16 deprecates `middleware.ts`.** Verified against current documentation and migrated
   to `src/proxy.ts` exporting `proxy()` (Node.js runtime).
6. **Production build crashed** because the content layer threw when Supabase was absent.
   This was the most important find: a "refuse to fake news" guard turned a configuration gap
   into a dead deployment. Replaced with a third mode — `unavailable` — that renders a truthful
   notice on the page while still never serving synthetic stories. Documented in
   `types.ts` and `repository.ts`.

---

## 3. Migrations

| Migration | Created | Applied |
| --- | --- | --- |
| `0001_identity_rbac.sql` | yes | **no** |
| `0002_editorial_content.sql` | yes | **no** |

No database exists to apply them to (`list_projects` → empty). Applying them requires an
explicit decision from you (see §6). In particular, `0001` creates a trigger on `auth.users`
and seeds role data — that is a deliberate, reviewable step, not something to run blindly.

---

## 4. What is genuinely covered vs. not

**Covered and proven by execution:**
permission matrix and deny-by-default behaviour; agent scope isolation incl. tampered rows;
ownership-sensitive `article.edit.own`; role expiry; editorial transition legality;
public-visibility rules; XSS sanitisation; input validation; build/lint/typecheck; HTTP status
behaviour; security headers; honest failure responses.

**Written but NOT executed:**
the RLS SQL suite (no Postgres available); migrations themselves (never parsed by a database).

**Not started:**
article CRUD services, review queue UI, media library, tags/revisions/comments tables, agent
registry and API keys, BullMQ queues and worker, credit ledger and billing, deployment control,
observability/error monitoring, backup/restore runbook.

---

## 5. Unresolved risks

| # | Risk | Severity | Note |
| --- | --- | --- | --- |
| R1 | Migrations unexecuted — syntax/logic errors possible | High | Must run `npm run test:db` on a scratch database before production |
| R2 | `0001` triggers on `auth.users` | Medium | Standard Supabase pattern, but confirm before applying |
| R3 | Route-level rate limiter is per-instance memory | Medium | Serverless → ineffective across instances; Redis limiter in Phase 5 |
| R4 | `style-src 'unsafe-inline'` retained | Low | Tailwind/inline styles; tighten with nonce hashing later |
| R5 | No error monitoring (Sentry etc.) | Medium | Errors are logged to stdout only |
| R6 | Policy pages are unreviewed drafts | Medium | Legal review required before launch |
| R7 | Admin dashboard reads with the service-role key | Medium | Correct for counts, but needs a scoped server function + audit in Phase 3 |
| R8 | No pagination on public lists yet | Low | Limits are hard-capped (20/30) |

---

## 6. Decisions required from you

1. **Supabase project** — approve creating one (free plan, org `almoidfahad's Org`) and choose a
   region? This is externally visible, so I will not do it unasked.
2. **Apply migrations** — review first, or apply `0001`/`0002` as soon as the project exists?
3. **TypeScript** — I pinned **5.9.3** rather than the `latest` tag 7.0.x (brand-new major).
   Keep the pin, or move to 7.x?
4. **Redis/BullMQ host** — Upstash (Vercel-friendly) or a container on your VPS? Determines the
   worker deployment target in Phase 5.
5. **Payments** — Stripe assumed for the credit wallet. Confirm before Phase 6.

## 7. Proposed next slice

**Phase 2 completion, then Phase 3 vertical slice.** In order:

1. Apply `0001` to a scratch Supabase project and run the RLS suite until it passes — closing
   R1 before any feature is built on top of the policies.
2. Seed a Super Admin safely (invite + role grant through the service role, audited).
3. Finish admin MFA enrolment and the `/admin/login/mfa` + reset flows.
4. Build the **article editor → review → publish** vertical slice end to end, with service-layer
   tests proving an Author cannot approve or publish, and `revalidateTag` on publish.

Building forward on unverified policies would violate the brief's own acceptance criteria, so
step 1 is not optional.
