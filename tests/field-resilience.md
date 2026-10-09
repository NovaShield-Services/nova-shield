# Batch 7.2: Field Console resilience and recovery

Independent branch `codex/batch-7-2`, based on `d71f467`. No Claude branch
was fetched into this work or integrated. Repository instructions read:
`ARCHITECTURE.md`, `START_HERE.md`, and `tests/README.md`; no AGENTS.md found.

## Browser prerequisite

A real browser ran: **Chromium 151.0.7922.173**, Playwright **1.58.2**.
The brief's missing-browser premise did not match this workspace:
`/usr/bin/chromium` exists, while `/opt/pw-browsers/chromium` does not.
Before product changes, the existing external test adapter re-ran Batch 6.2:
**measurement-entry 29/29**, **mobile-reliability 22/22**. Both also pass
after this batch. This is browser execution with mocked APIs, not syntax-only
verification or production/native-device validation.

New owned scripts accept `PLAYWRIGHT_CHROMIUM` and `PLAYWRIGHT_MODULE`.
Shared test files, harness, runner, dependencies and browser paths were not
edited. The external adapter remains outside the checkout.

## Candidates confirmed and already handled

| Candidate | Finding | Implemented result |
| --- | --- | --- |
| Failed/empty reads | Successful empty schedules and ordinary render-failure Retry already worked. Access-check rejection was outside the router's catch; late visit responses could overwrite a newer route. An initial failed data read instead reported `pricing is not iterable`. | Access failures offer Retry. Each route owns its mount, so old responses cannot replace the current screen. Failed initial reads report the actual failure, rather than constructing empty data. |
| Stale loaded data | A failed refresh retained data without labeling it; a permission-denied refresh after a successful passport save became an unhandled rejection. Notes showed errors without local retry. | Failed refreshes retain controls, show a persistent warning and a toast, and offer Retry visit data. Notes retry without rebuilding the visit or dropping an unsaved note. |
| Outbox visibility/recovery | Sync status, Sync Now, ordered/coalesced replay and a label-summary toast already existed. Individual failure reasons were not durable, no item could be deliberately discarded, and storage failure could leave Sync Now disabled. | The badge opens an accessible dialog with item labels, timestamps, durable errors, retry and confirmed local discard. Replay and discard are coordinated in both directions. Storage failure is explicitly visible and the sync button recovers. |
| Slow operations/drafts | Completion, location and note operations already had progress feedback. Passport saves did not. Slow saves could erase text entered afterward. | Passport shows Saving passport and prevents duplicate submission. New passport/note text survives an earlier save; untouched passport fields still refresh. Unknown newer backend passport fields are preserved. |
| Large data | 500 normal visit cards and 150 measurement controls already retained their actions. Long unbroken customer/service headings overflowed phones. | Headings wrap at 390/430px. The last visit action and last measurement edit still work. No pagination or virtualization was introduced. |

Visual inspection also caught a primary-button hover rule replacing the
accent background while leaving white text. The baseline contrast was
**1.06:1**. The background now stays accent-colored and the hover contrast
check passes. This makes progress text readable after a click.

The original Batch 7 requirements remain unrecoverable beyond the supplied
candidate brief. No additional inventory, portal or release requirements
were invented. The unbounded schedule query still exists; pagination would
require excluded `field-schedule.js`/`api.js` work. Browser render timings are
diagnostics from mocked data, not phone-performance benchmarks.

## Changed files and boundaries

- `admin/js/field.js`: route recovery, stale-response isolation, outbox dialog,
  keyboard/overlay dismissal, sync failure recovery.
- `admin/js/views/field-workspace.js`: read/refresh recovery, note retry,
  passport progress and draft preservation.
- `admin/js/lib/offline-queue.js`: durable item errors, storage-error state,
  coordinated discard/replay, no replay while known offline.
- `admin/css/admin.css`: header wrapping, dialog/badge styles, primary hover.
- New owned files: `field-resilience-fixture.mjs`, `field-resilience.test.mjs`,
  `screenshot-batch7-2.mjs`, and this handoff.

The existing four outbox handlers and IndexedDB database/store/version remain
unchanged. Quantities, notes, quote creation and email remain outside it.
Delivery remains at least once; local discard cannot undo a server write.
Pricing calculations and quote safeguards were not changed. No forbidden
file, live setting, rate, approval state, customer row, grant or migration
was modified. No merge, rebase, deployment or later batch was started.

## Executed validation

- New suite: **27/27** checks pass.
- Against exact `d71f467` product files: **5/27** pass (preservation checks),
  **22 fail**. The initial 12 targeted checks also failed before implementation.
  Baseline mode serves prior files through browser routes without changing
  the working checkout. Early fixture errors were corrected before the
  valid baseline run and are not counted as product findings.
- Existing suites run explicitly: `phase2` through `phase20` (including
  `phase10-5`), `native-wrapper`, `reload-offline`, `measurement-entry`,
  `mobile-reliability`, and `geofence`. **413/413** counted checks plus
  geofence pass. Affected workspace suites were re-run after the final
  passport change. Overall: **440/440 counted checks**, plus geofence.
- **18 screenshots captured and actually inspected** at **390, 430 and
  1200px**: failed load, stale-data recovery, pending passport save, failed
  outbox, 500-visit schedule, and 150-measurement visit. All fit their
  viewports. The persistent retry control was inspected after the normal
  transient toast dismissed. Very tall lists use viewport screenshots.
- Syntax checks and `git diff --check` pass.

Artifacts: `/workspace/.nova-shield/batch7-2/logs/`,
`/workspace/.nova-shield/batch7-2/screenshots/`, and
`/workspace/.nova-shield/batch7-2/validation.json`.

Database integration tests are **unrun**, not passed. No live database
writing tests were executed. Real Android Back, WebView/clipboard behavior,
cellular offline, OS storage eviction, device performance, other browser
engines and production remain unverified. Offline cold opening/restarting
still needs a connection: this is the existing write outbox, not full
offline operation or a new persistent read cache. The customer-content
freeze migration remains Claude's item and was not retried here.

## Commands and later registration

With the repository's normal `/opt` tool paths and a static server on 8743:

```sh
node tests/field-resilience.test.mjs
node tests/screenshot-batch7-2.mjs /tmp/nova-shield-batch7-2-screenshots
```

Actual command in this workspace:

```sh
PLAYWRIGHT_CHROMIUM=/usr/bin/chromium \
PLAYWRIGHT_MODULE=/workspace/.nova-shield/test-tools/node_modules/playwright/index.mjs \
node --loader /workspace/.nova-shield/test-loader.mjs tests/field-resilience.test.mjs
```

Add `FIELD_BASELINE=1` to reproduce the expected failing prior behavior.
Use the same environment flags for `screenshot-batch7-2.mjs`.

At integration, add **`field-resilience`** to the explicit mocked-suite
list. `mobile-reliability` also remains unregistered on this track. Keep
screenshots separate and database integration tests separately selectable.
`tests/run-regression.sh` was left unchanged; no blanket glob was added.
