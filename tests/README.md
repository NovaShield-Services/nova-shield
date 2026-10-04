# Tests

Playwright-based integration tests against the real admin components,
with `admin/js/lib/api.js` and `shared/supabase.js` mocked (no live
Supabase calls; no live cloud browser download -- see below).

## Running

```
npm test
```

or directly:

```
./tests/run-regression.sh
```

This starts a static file server on :8743, runs every `phase*.test.mjs`
(the quoting-calculator suite, one file per build phase) plus
`geofence.test.mjs` / `native-wrapper.test.mjs` / `reload-offline.test.mjs`
(the native-wrapper/offline suite), and stops the server on exit.

## What these do and don't cover

Every test here mocks `admin/js/lib/api.js` and asserts against the
**rendered DOM and the calls the component makes** -- they do not touch
the real database or the real `calculate_job_pricing` pricing engine.
Each calculator phase's pricing arithmetic was separately hand-verified
against the real Supabase project via rolled-back SQL transactions at
build time (see each phase's written report); that one-off verification
is what `tests/integration/` (below) turns into a permanent, re-runnable
suite against the real database -- run it with `npm run test:integration`.

## Screenshot scripts

`screenshot-*.mjs` are manual visual-QA aids (not part of `npm test` or
`run-regression.sh`) -- run one directly with `node tests/screenshot-X.mjs`
against the same local server to produce desktop/tablet/mobile PNGs for a
given calculator.

## Requirements

- `python3` on PATH (serves the repo statically; no build step needed).
- A Playwright-compatible Chromium at the path hardcoded in
  `test-harness.mjs` and each `screenshot-*.mjs`
  (`/opt/pw-browsers/chromium` in this project's cloud dev container).
  On another machine, run `npx playwright install chromium` and update
  that path, or point `PLAYWRIGHT_BROWSERS_PATH` at an existing install.

## Adding a new phase's tests

Import the shared scaffolding from `test-harness.mjs`
(`createRecorder`, `BASE_FAKE_API_PANEL`, `launchPanelPage`,
`finishAndReport`) rather than redeclaring it -- see any `phase3.test.mjs`
through `phase15.test.mjs` for the pattern. Keep service/modifier/section
fixture data inline per file; that's load-bearing documentation of the
real production configuration a phase was built against, not boilerplate.

## Real-database integration suite (`tests/integration/`)

Everything above mocks `admin/js/lib/api.js` and never touches the real
database. `tests/integration/*.test.mjs` is the opposite: it calls the
*real* Supabase Postgres database directly (RPCs, triggers, constraints,
the real `calculate_job_pricing` engine) over a direct `pg` connection --
no mocks, no `supabase-js`, no PostgREST in the loop.

### Running

```
npm run test:integration
```

or directly:

```
bash tests/run-integration.sh
```

### Required environment variable

```
SUPABASE_DB_URL=postgres://...   # a direct Postgres connection string
```

**With `SUPABASE_DB_URL` unset, every single test reports `SKIPPED --
SUPABASE_DB_URL not set`, not passed.** No test file ever attempts a
connection when it's unset -- that branch is centralized once in
`reporter.mjs`'s `createIntegrationRecorder(isConfigured())`, not repeated
per file. `SKIPPED` and `PASS` are never combined into one number; the
final tally line in every file's output (and `verify-cleanup.mjs`'s own
PASS/FAIL line) always distinguishes them.

### Safe database target

Point `SUPABASE_DB_URL` at a project you are comfortable running real
`INSERT`/`UPDATE` statements against inside transactions that always roll
back. There is no separate test schema or test project in use today --
every test's writes live only inside its own transaction (see Cleanup
below) and are never committed, so pointing this at the same project the
app itself uses is safe *provided the rollback guarantee holds*, which is
exactly what `tests/integration/verify-cleanup.mjs` double-checks after
every run rather than simply assuming. Never point it at a project with
real customer data unless you trust that guarantee; a dedicated disposable
Supabase project is the safer choice for CI (see CI readiness below).

### Authentication: how tests exercise real admin-gated RPCs

`create_quote_from_calculation`, `duplicate_quote`, `mark_quote_sent`,
`save_quote_signature`, `calculate_job_pricing`, and
`recalculate_quote_totals` are all `SECURITY DEFINER` functions with an
explicit `if not is_admin() then raise exception` check in their own
body -- not RLS. `is_admin()` is `exists(select 1 from admin_users where
user_id = auth.uid())`, and `auth.uid()` just reads the Postgres session
setting `request.jwt.claim.sub`, the same setting PostgREST sets after
verifying a real JWT.

`tests/integration/db-client.mjs`'s `withAdminTx()` opens a transaction,
inserts one disposable synthetic `auth.users` row plus a matching
`admin_users` row, and sets that same session claim -- so `is_admin()`
runs its real, unmodified logic against the real `admin_users` table for
the duration of one test, as a synthetic admin, never the real human
admin's account. This does not weaken or bypass authorization; it
genuinely satisfies it. `respond_to_quote` (the one customer-facing RPC)
has no such gate at all, so its tests use `withTx()` instead -- the same
transaction/rollback guarantee, with no claim set, since simulating
"being" anyone would not be testing anything real for that RPC.
`dropAdminClaim()` re-points the claim at a fresh random UUID to prove the
non-admin/"stranger" denial path without opening a second transaction.

### Transactions and cleanup

Every test runs inside `withTx()`/`withAdminTx()`, which always issue
`ROLLBACK` in a `finally` block -- on success or failure alike. That
rollback also removes the synthetic `auth.users`/`admin_users` rows
`withAdminTx()` created, since they're inserted inside the same
transaction. A test that needs to assert "and nothing changed" after an
RPC call that's expected to throw uses `expectRejection()`, which wraps
the call in a `SAVEPOINT` -- a plain Postgres error otherwise poisons the
whole transaction for every later statement on that connection, which
would make the "nothing changed" follow-up query itself fail instead of
actually checking anything.

After every test file has run, `bash tests/run-integration.sh` makes one
further real-DB check (only when `SUPABASE_DB_URL` is set):
`tests/integration/verify-cleanup.mjs` opens a fresh connection -- outside
any test's own transaction -- and counts rows across `customers`,
`properties`, `ns_jobs`, `ns_quotes`, `job_measurements`, `notifications`,
and the synthetic `auth.users`/`admin_users` rows, for anything matching
the `TEST_INTEGRATION_` prefix. It should always find zero, since rollback
already guarantees that structurally; this is the "don't simply assume
cleanup succeeded" proof, not a cleanup step in itself.

### Test data identification

Every synthetic customer/job created by `tests/integration/helpers.mjs`'s
factories is named from `db-client.mjs`'s `runId()`:
`TEST_INTEGRATION_<timestamp>_<random>`. Never a realistic-looking name,
never attached to a real customer/property/job.

### Adding a new integration test file

Follow the pattern in any existing `tests/integration/*.test.mjs` file:
import `createIntegrationRecorder`/`printResults` from `reporter.mjs`,
`withTx`/`withAdminTx`/`isConfigured`/`closePool`/`runId` (and
`expectRejection`/`dropAdminClaim` as needed) from `db-client.mjs`, and the
synthetic-data factories from `helpers.mjs`. End the file with the same
`printResultsAndExit()` / `main().catch(...)` shape so it works both as a
standalone `node tests/integration/X.test.mjs` run and from
`run-integration.sh`. No wiring is needed beyond the file existing --
`run-integration.sh` globs `tests/integration/*.test.mjs` directly.

### CI readiness

Not wired into GitHub Actions yet. When it is: provide `SUPABASE_DB_URL`
as an encrypted secret (ideally pointed at a dedicated, disposable
Supabase project rather than this one), run `npm run test:integration`,
and treat its exit code the same as `npm test`'s. Nothing about this
suite's design assumes a human running it interactively -- there's no
prompt, no manual step, and no real-DB test ever passes silently with the
variable unset.
