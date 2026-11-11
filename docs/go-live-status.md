# Go-live status — American Signal Desk

Single source of truth for the "Before this goes live" checklist (README). Every claim below
is verified against the live project or the repository unless explicitly marked as pending.
Checked in the November 2026 activation session; individual checks dated inline.

## Checklist status

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Supabase project, migrations, `/api/health` 200 | **Done** | Live `/api/health` returns `status: "ok"` with database probe `"Probe verified: articles reachable"`. Migrations `0001`–`0007` applied to project `ugxiwbspmivugtriiehi` (19 tables + 2 views, 33 RLS policies). |
| 2 | `npm run test:db` on a non-production database | **Done** | "All migrations applied and all RLS suites passed." — 6 suites against scratch database `asd_golive` (local Postgres harness). |
| 3 | MFA enabled in Supabase Auth; `REQUIRE_MFA_FOR_ADMIN` unset or `true` | **Done** | Auth config verified: `mfa_totp_enroll_enabled: true`, `mfa_totp_verify_enabled: true`, `mfa_allow_low_aal: false`. `REQUIRE_MFA_FOR_ADMIN` is unset (allowed state per checklist). |
| 4 | `CRON_SECRET` in GitHub Actions secrets **and** Vercel env → queue driven | **Deferred by owner** | The workflow exists and the GitHub scheduler fires it (5 scheduled runs so far, every few hours under GitHub load), but every run takes the "no driver" path (warning + exit 0) until the same secret is set on both sides. Value can be regenerated at any time (`openssl rand -hex 32`); only equality of the two copies matters. |
| 5 | Counsel review of every draft policy page | **Owner action** | Draft pages to review: the `[...policy]` route (contents defined in `src/app/(public)/policies.ts`) plus `/about`, `/advertise`, `/contact`, `/corrections`, `/newsletter`. Policy and legal copy is a working draft, not legal advice. |
| 6 | Replace placeholder `ads@` / `corrections@` addresses with real, monitored mailboxes | **Owner action** | Placeholder occurrences: `ads@americansignaldesk.com` at `src/app/(public)/advertise/page.tsx:32` and `src/app/(public)/contact/page.tsx:37`; `corrections@americansignaldesk.com` at `src/app/(public)/contact/page.tsx:31`. Once real addresses exist, the swap is a two-file edit. |
| 7 | `RESEND_API_KEY` + `EMAIL_FROM` in Vercel env | **Owner action** | Without them, confirmation emails stay queued and every signup sits at `pending`; the queue reports "not configured" and the admin configuration page names the missing variables. |

## Environment facts (verified 2026-11)

- **Site:** https://american-signal-desk.vercel.app — production deployment from commit `fe3181d` (READY/PROMOTED).
- **Vercel project** `prj_Dx6ZNLaB1oSXyb3XCavjS7gT2bwk`, 6 environment variables set:
  `ASD_ALLOW_SAMPLE_CONTENT=1`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  **Not set:** `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`.
- **Supabase** `ugxiwbspmivugtriiehi`: email auth enabled, phone disabled, `mailer_autoconfirm`
  off (double opt-in), refresh-token rotation on. `site_url` corrected from `http://localhost:3000`
  to `https://american-signal-desk.vercel.app` on 2026-11-10 so auth emails link to production.
- **GitHub:** repository `almoidfahad/American-Signal-Desk`, workflow "Queue tick" (id `412115565`,
  schedule `*/5`, manual `workflow_dispatch`). The connected GitHub token cannot read or write
  Actions secrets or dispatch runs (HTTP 403), so both the secret and any manual trigger must be
  done by the owner in the GitHub UI.

## Resuming item 4 (queue driver) — exact steps

1. Generate or reuse a secret value (16+ characters). Use the **same** value in both places:
   - GitHub → repository **Settings → Secrets and variables → Actions → New repository secret**
     → name `CRON_SECRET` → paste value → **Add secret**.
   - Vercel → project **Settings → Environment Variables** → key `CRON_SECRET`, value = the same,
     target **Production** → **Save**.
2. **Redeploy the Vercel project** — environment variables only apply to new deployments.
3. Verify: the next "Queue tick" run must stop emitting the "no driver" warning and print the
   tick JSON summary (queue counts) in its step output. Scheduled articles then publish within
   the scheduling window. If GitHub's scheduler is slow, trigger the run manually from
   **Actions → Queue tick → Run workflow**, or run `npm run worker` on an always-on host
   (README fallback for minute-level scheduling).

## Resuming item 7 (email provider) — exact steps

1. Create a Resend account, verify a sending domain (or use the sandbox sender), create an API key.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` in the same Vercel environment UI as above, redeploy.
3. Verify: queued confirmation emails drain, new signups leave `pending`.

## Notes for later sessions

- The generated `CRON_SECRET` value lives only in the operator's hands (a workspace file during
  the session); it is intentionally never committed and never echoed in chat or logs. If lost,
  regenerate — nothing depends on a specific value as long as both sides match.
- Item 7's `EMAIL_FROM` should match a mailbox the team actually monitors (ties into item 6).
