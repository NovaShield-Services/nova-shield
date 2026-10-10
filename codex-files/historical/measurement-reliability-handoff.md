# Nova Shield measurement reliability handoff

Local branch: `codex/measurement-reliability`.
Baseline: Claude's `claude/task-qidtvs` at `2cdecc3eed28969a80b2e47d400c35cf18b5125d` (Batch 4).
The remote still pointed at that commit when checked at the end of this task.
Changes remain uncommitted locally. Nothing was pushed, merged, deployed, or published.

## Behavior

- Typed quantities debounce for 350 ms, with at most one quantity write per measurement row in flight. A later edit is captured independently and saved after an older request completes.
- Quantity controls stay mounted while focused or holding an unsaved draft. Panel redraws wait until editing finishes; backend pricing still comes from `calculate_job_pricing`.
- Refresh tokens change on edits and committed writes. Both desktop and field reloads discard older responses.
- Empty, incomplete, negative, and fractional `each` quantities stay unsaved. Explicit zero is accepted.
- Failed quantity saves retain the entered value, show an inline error, and offer Retry or Use saved quantity. An earlier failure cannot revert a newer edit.
- Pending quantities are flushed before measurement buttons, quote-panel actions, router changes, and sign-out. Invalid or failed drafts keep the screen open; reload/close uses a beforeunload warning.
- Window/winter/heating-wire count steppers show errors and restore the confirmed count when their write fails. In-flight quantity changes participate in the lifecycle guard.

## Review ownership

The core is `admin/js/lib/measurement-entry.js`. `measurements.js` passes its quantity helpers into the 13 existing calculator adapters. `job.js` and `field-workspace.js` guard quote actions at the caller boundary and reject stale reloads. `main.js` and `field.js` flush before navigation/sign-out.

No changes to `admin/js/lib/api.js`, `admin/js/views/quote.js`, backend pricing, migrations, Supabase, deployment configuration, package manifests, or lockfiles. Claude's Batch 5 quote implementation is outside this patch. Review against Claude's latest work before integration because the views and calculators were already shared files.

## Validation

- The existing runner executed all suites. Its 362 counted existing checks passed. The geofence suite initially failed because it imports a hardcoded `/home/user/nova-shield` path; it passed when that import was remapped locally to this checkout.
- The new `tests/measurement-entry.test.mjs` passed 29/29 checks on the final complete rerun. These exercise real rendered components, both job/field reloads, both routers, and quote-build handlers with mocked APIs and controlled delayed/failing responses.
- Total: 391 counted passing checks across the regression run and final focused reruns, plus the geofence assertions. The complete runner was not repeated after the final test-fixture isolation/path-adapter corrections; affected suites were rerun successfully.
- Ten existing quantity assertions now wait for their expected persisted-value call instead of a fixed 60 ms delay. Their saved-value assertions are unchanged. The new suite is registered in `tests/run-regression.sh`.
- Admin/test JavaScript syntax and `git diff --check` passed. The exported patch also passed `git apply --reverse --check` against the current working tree.
- No live-database integration tests or native-device builds were run.

This machine uses system Chromium and a local Playwright install outside the checkout. Reproduction here:

```bash
cd /workspace/nova-shield
NODE_OPTIONS='--loader /workspace/.nova-shield/test-loader.mjs' bash tests/run-regression.sh
```

The local loader maps the repository's pre-existing `/opt` Playwright/browser assumptions and the geofence import to installed paths. It is not part of the application patch, and package declarations/lockfiles were not changed.

## Scope limits

Ordering guarantees apply to edits in this editor/tab, not simultaneous edits from another staff device. Quantity updates remain online-only; the existing field outbox and its queued-create limitation are unchanged. Confirming a full reload/close can discard an unfinished draft. Label/notes/modifier save behavior was not redesigned.

Reviewable patch: `/workspace/.nova-shield/measurement-reliability.patch` (includes both new files and all tracked edits). It was prepared for review only and has not been applied elsewhere.
