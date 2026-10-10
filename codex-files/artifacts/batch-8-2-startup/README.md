# Batch 8.2 startup continuation evidence

Implementation and limits: [tests/native-startup.md](../../../tests/native-startup.md).
Actual base: `6f4076860fbd3e00ad2ccceb482a208846283288`; branch: `codex/batch-8-2-startup`.

**511/511 counted checks pass, plus geofence.** The unchanged registered runner reports 391/391; the explicit extra suites report mobile 22, field recovery 27, readiness 24, bundle 10, packaging 19 and startup 18. Database tests are separately selectable and unrun.

`results.json` records final counts. `manifest.json` records hashes/sizes for the imported evidence; it excludes itself and this explanatory README. The original failed clean install and repaired clean install are both included. `break-*.txt` files contain the expected failing selected browser tests and exit status 1. Packaging tests mutate inputs in an isolated directory and invoke the production guard. `regression-initial-timing-failure.txt` records the root-loader sequencing defect caught during development; `regression-final.txt` records the corrected full pass.

The screenshots contain synthetic fixture data: 18 original readiness states at 390/430/1200px in light/dark mode, plus 7 startup/error/offline/header states. Contact sheets support inspection; original PNGs and readiness overflow metrics are retained. All 18 readiness metrics report no overflow. These are Chromium browser views, not physical-device screenshots.

No Android SDK is configured. Native compilation/preBuild execution/manifest merge/APK installation, physical-device behavior, production verification and live database integration are unrun. A successful Capacitor sync and direct guard execution do not prove those. No migration, merge, deployment, customer message or APK publication occurred.
