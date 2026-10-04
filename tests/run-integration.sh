#!/usr/bin/env bash
# Runs every real-database integration test file in tests/integration/.
#
# With SUPABASE_DB_URL unset, every test in every file reports SKIPPED
# (see tests/integration/db-client.mjs and reporter.mjs) -- that is the
# correct, honest behavior per Phase B Section M, not a failure, and this
# script's own exit code reflects that (0, since nothing actually failed).
#
# With SUPABASE_DB_URL set, each file opens its own real Postgres
# transaction(s) against that database and always rolls back, success or
# failure -- nothing persists. After every file has run, this script makes
# one further real-DB check (Section L): that no TEST_INTEGRATION_-prefixed
# synthetic row survived anywhere.
#
# See tests/README.md for the required environment variable and what this
# does and does not touch.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

FAILED=0
for f in tests/integration/*.test.mjs; do
  echo "===== $f ====="
  if ! node "$f"; then FAILED=1; fi
  echo
done

if [ -n "${SUPABASE_DB_URL:-}" ]; then
  echo "===== cleanup verification (Section L) ====="
  if ! node tests/integration/verify-cleanup.mjs; then FAILED=1; fi
  echo
fi

exit $FAILED
