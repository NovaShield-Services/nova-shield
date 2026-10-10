#!/usr/bin/env bash
# Runs the full Playwright-based regression suite: the quoting-calculator
# suite (phase2 through phase15, one file per build phase) plus the
# native-wrapper/offline/geofence suite from earlier in the project.
#
# Requires: python3 (serves the repo statically on :8743) and the
# Playwright browser pinned at PLAYWRIGHT_CHROMIUM (see test-harness.mjs
# and each screenshot-*.mjs for the same path) -- both already present in
# the project's cloud dev container. On another machine, install
# playwright and adjust that path, or set PLAYWRIGHT_BROWSERS_PATH per
# Playwright's own docs.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT=8743
pkill -f "http.server $PORT" 2>/dev/null || true
sleep 1
nohup python3 -m http.server "$PORT" >/tmp/nova-shield-test-server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

for i in 1 2 3 4 5; do
  if curl -sS -o /dev/null -w '' "http://localhost:$PORT/admin/field.html" 2>/dev/null; then break; fi
  sleep 1
done

FAILED=0
# The list is explicit, never a glob over tests/*.test.mjs: tests/db/ and
# tests/integration/ talk to a real database and must not be swept in here.
#
# phase22 (Batch 6.1 Settings) and phase23 (Batch 8.1 Inventory) joined in
# Batch 8.1. phase22 had been left out while 6.1 sat on its own branch; both
# are on this branch and green, and a passing suite outside the runner is one
# a later change breaks silently.
for f in phase2 phase3 phase4 phase5 phase6 phase7 phase8 phase9 phase10 phase10-5 \
         phase11 phase12 phase13 phase14 phase15 phase16 phase17 phase18 phase19 phase20 \
         phase21 phase22 phase23 geofence native-wrapper reload-offline; do
  echo "===== $f ====="
  if ! node "tests/$f.test.mjs"; then FAILED=1; fi
  echo
done

exit $FAILED
