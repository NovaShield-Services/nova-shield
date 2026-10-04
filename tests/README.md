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
build time (see each phase's written report); that verification is not
captured here as a re-runnable test. A real-DB integration suite (one
that calls the actual pricing function and compares its output to
hand-computed expectations, similarly auto-rolled-back) is a real gap --
see the Phase 16 audit report for the recommendation.

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
