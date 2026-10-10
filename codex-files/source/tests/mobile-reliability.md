# Batch 6.2: measurement and mobile interaction reliability

Implemented independently on `codex/batch-6-2`, based on `f4cdbe5`.
Claude's Batch 6.1 is not a prerequisite and was not integrated.

## Findings and changes

All four concerns reproduced on the baseline, using mocked API writes.
The original 12 targeted checks failed before the fixes (0/12).

| Concern | Baseline evidence | Result |
| --- | --- | --- |
| User activation | After a browser-timed 6.1-second save, activation had expired; Preview and PDF opened zero tabs with normal popup blocking. Real Chromium Copy Link rejected with `NotAllowedError`. Copy Link and SMS also failed a gesture-requiring clipboard double. | Viewing/copying an existing quote keeps the original click. Quote mutations and same-tab navigation still wait for saves. |
| Dropped refresh | A guarded save completed with quantity 9 but the fixture's backend-total response remained displayed as $70 instead of $90. | A deferred refresh is re-armed after the guard finishes. Pricing remains in backend RPCs; the arithmetic here is only a test double. |
| Offline navigation | The route guard returned false with no deliberate leave choice after a failed quantity write. | Confirmed offline failures offer discard-and-continue or cancel-and-retry. Discard restores the last confirmed local quantities without rollback writes or an outbox entry. Permission errors retain the draft. |
| Android root exit | The native-plugin double exited immediately before a pending save completed. | Both entry points pass the existing quantity flush guard to native Back. Exit waits for a successful save or explicit offline discard; repeated presses share one attempt. Overlay/keyboard/history/parent priorities are preserved. |
| Touch targets | Admin buttons were 34px high; field buttons were mostly 40px, including a 34px header control. | Small buttons have at least the existing 44px tap-token height and width. |

The claim that clipboard failures were **silent** did not reproduce: the
existing quote handlers already provide error/fallback messaging. No fix
was made to those handlers. Firefox and WebKit were not tested.

Existing quote controls operate on an already-created quote, so viewing,
copying and native sharing do not need to calculate from unsaved quantity
edits. Their guard exception is enabled only by quote-panel callers.
Preview's native same-tab path still uses the navigation guard. Saves keep
running, and unsaved quantities still block mutations or protected exits.

## Changed files

- `admin/js/lib/measurement-entry.js`: refresh, quote gesture policy, offline discard.
- `admin/js/lib/navigation.js`: optional, coalesced exit guard.
- `admin/js/main.js`, `admin/js/field.js`: register the exit guard.
- `admin/js/views/job.js`, `admin/js/views/field-workspace.js`: change only the guard registration lines introduced in `f4cdbe5`.
- `admin/css/admin.css`: small-button tap size, including the field override.
- New test files: `mobile-reliability.test.mjs`, `mobile-reliability-fixture.mjs`, `screenshot-batch6-2.mjs`, and this handoff.

No quote/settings/API/outbox implementation, migrations, public-site files,
phase tests, dependencies, or shared regression runner were changed.

## Validation

Chromium **151.0.7922.173**, Playwright **1.58.2**. Popup tests remove
Playwright's default `--disable-popup-blocking` bypass. The delayed save
finishes from a browser timer, rather than a Playwright evaluation that
could inject fresh activation. The real clipboard check uses the browser's
clipboard implementation; SMS's restrictive clipboard behavior is a double.

- New suite: **22/22** checks pass, including preserved mutation/navigation
  guards, offline cancellation and retry, permission errors, repeated Back,
  incomplete input, and overlay/keyboard priority.
- Existing suites, run explicitly: `phase2` through `phase20`, including
  `phase10-5`, plus `measurement-entry`, `native-wrapper`, `reload-offline`,
  and `geofence`. **391/391** counted checks pass, plus the geofence
  assertions. Together with this suite: **413/413**, plus geofence.
- Twelve mocked screenshots captured and visually inspected: admin and
  field layouts at **390, 430, and 1200px**, each with saved and offline-failed
  input. They fit their viewports, retain readable recovery controls, and
  every visible small button measures at least 44 by 44px.
- `git diff --check` passes.

Artifacts in the executing environment:

- Baseline failure log: `/tmp/nova-batch6-2-baseline.log`.
- Final logs: `/workspace/.nova-shield/batch6-2/logs/`.
- Screenshots and measured dimensions: `/workspace/.nova-shield/batch6-2/screenshots/`.

Database integration tests are **unrun**. No migrations or live-data
changes were made. Mocked native Back does not establish real Android or
WebView behavior. Physical-device Back, popup/clipboard permissions, native
sharing, true cellular offline, other browser engines, and production
verification remain untested. Nothing was merged, rebased, or deployed.

## Running and integration registration

With the repository's normal `/opt` Playwright installation and its static
server already running on port 8743:

```sh
node tests/mobile-reliability.test.mjs
node tests/screenshot-batch6-2.mjs /tmp/nova-shield-batch6-2-screenshots
```

This environment uses an external loader to map the repository's existing
hardcoded Playwright paths to the installed package and system Chromium;
the loader and tools are outside the checkout. The actual suite command:

```sh
node --loader /workspace/.nova-shield/test-loader.mjs tests/mobile-reliability.test.mjs
```

At integration, add **`mobile-reliability`** to the explicit mocked-suite
list in `tests/run-regression.sh`. Keep screenshots separately selectable
and database integration tests separate. The runner was deliberately left
unchanged during this parallel assignment. No Batch 7.2 work was started.
