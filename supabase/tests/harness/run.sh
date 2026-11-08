#!/usr/bin/env bash
# =============================================================================
# Run the real migrations and RLS suites against a real PostgreSQL instance.
# =============================================================================
# Usage:
#   supabase/tests/harness/run.sh              # uses psql + $DATABASE_URL
#   PGBIN=/path/to/bin supabase/tests/harness/run.sh
#
# What it does, in order, inside ONE database:
#   1. installs the Supabase shim (roles, auth.users, auth.uid())
#   2. applies every migration in supabase/migrations in filename order
#   3. runs every *.sql suite in supabase/tests
#
# It stops on the first failure (ON_ERROR_STOP) so a broken migration is never
# masked by a later one. Exits non-zero if anything fails.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PSQL="${PGBIN:+$PGBIN/}psql"

if [ -n "${DATABASE_URL:-}" ]; then
  PSQL_CMD=("$PSQL" "$DATABASE_URL")
elif [ -n "${PGHOST:-}" ]; then
  PSQL_CMD=("$PSQL" -d postgres)
else
  echo "error: set DATABASE_URL (or PGHOST) to a scratch database." >&2
  echo "       Never point this at production: the suites write fixtures and roll back," >&2
  echo "       but the migrations themselves are permanent." >&2
  exit 1
fi

run_sql() {
  local file="$1"
  printf '  → %s\n' "${file#"$ROOT"/}"
  "${PSQL_CMD[@]}" -v ON_ERROR_STOP=1 -q -f "$file"
}

echo "== 1/3 Supabase shim =="
run_sql "$ROOT/supabase/tests/harness/00_supabase_shim.sql"

echo "== 2/3 Migrations =="
shopt -s nullglob
migrations=("$ROOT"/supabase/migrations/*.sql)
if [ ${#migrations[@]} -eq 0 ]; then
  echo "error: no migrations found" >&2
  exit 1
fi
for m in "${migrations[@]}"; do
  run_sql "$m"
done

echo "== 3/3 RLS suites =="
suites=("$ROOT"/supabase/tests/*.sql)
if [ ${#suites[@]} -eq 0 ]; then
  echo "error: no test suites found" >&2
  exit 1
fi
for s in "${suites[@]}"; do
  run_sql "$s"
done

echo
echo "All migrations applied and all RLS suites passed."
