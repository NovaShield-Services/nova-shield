# Reproduce browser tests without Codex-local paths

These adapters map the existing shared tests' hardcoded Playwright import and
old `/home/user/nova-shield/` imports. The repository root is inferred from this
folder, or explicitly selected with `NOVA_SHIELD_REPO`. They do not change the
shared harness/runner or product behavior.

Install/use a trusted Playwright package and matching supported Chromium in your
environment. Start a static server from the repository on port 8743. Select an
explicit test file, for example:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
PLAYWRIGHT_CHROMIUM=/absolute/path/to/chromium \
node --loader ./codex-files/tooling/test-loader.mjs tests/measurement-entry.test.mjs
```

If Playwright resolves normally as an installed package, omit PLAYWRIGHT_MODULE.
PLAYWRIGHT_CHROMIUM overrides the shared harness's environment-specific browser
path when set. The adapters use real Playwright/Chromium, not browser doubles.

For the earlier native readiness suite, first stage the local assets:

```sh
node scripts/sync-mobile.js
node tests/native-bundle.test.mjs
```

Then run `tests/native-readiness.test.mjs` with the same loader/browser options.
Consult the owned handoffs for baseline mode and screenshot scripts.
Invoke explicit suites: do not substitute a blanket glob, run DB integration
without its prerequisites, or use a runner that stops an unrelated service.

This handoff does not solve the existing package-lock mismatch or install an
Android SDK. Those remain separate planned native-startup work. Existing test
logs document task-specific outcomes, not a fresh full regression here.

For this export, the portable loader was executed here against the actual
measurement-entry suite with Playwright 1.58.2 and system Chromium: **29/29
passed**, command exit 0. Its fresh log is
`../artifacts/handoff/measurement-entry.txt`. Both adapter files passed Node
syntax checks. This verifies the exported adapter path; it is not a new full
regression, native build or production claim.
