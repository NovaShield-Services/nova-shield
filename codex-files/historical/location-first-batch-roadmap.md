# Nova Shield: location-first operations roadmap

**Superseded.** This draft assigned development batches too early. The accepted
service-specific operating model is in `service-operations-blueprint.md`.
The new allocation from the owner's Batch 7 checkpoint is in
`batch-plan-after-7.md`; use that allocation and `claude-roadmap-handoff.md`
instead of the historical proposed batches below.

Planning draft for owner review — 2026-10-10. This adds the uploaded product
blueprint to the independent Claude/Codex tracks. It does not authorize feature
implementation, database application, data cleanup, integration or deployment.

## Preserve the work already done

- Claude 6.1 Settings: reported complete at a461119; Claude 7.1 integrity and
  authorization repository work: reported complete at 7a2f2af. Live changes
  remain outstanding; these are handoff reports, not a fresh live audit.
- Codex 6.2 measurement/mobile reliability: d71f467; 7.2 field recovery:
  a8b573f; 8.2 native readiness/accessibility: d33d17e. Completed on the Codex
  track, independently of Claude. Browser checks are not physical-device proof.
- Preserve Settings, service calculators, backend pricing, quote revisions,
  delivery, frozen historical content and customer-facing service rollups.
- Permanent Lighting Phase D inventory remains a goal. Fold its confirmed
  requirements into the common inventory foundation; do not invent its missing
  service-specific rules or create a second inventory system.
- The previously tentative 9.1 customer portal moves to 13.1 in this draft,
  where tracking, reports and payment links can use the operations contracts.
  The goal is retained; portal scope beyond this blueprint remains unconfirmed.
- Public website redesign remains excluded. Deployment, staff provisioning,
  actual rate decisions and photography remain owner/operations work.

## What this blueprint adds

An Android field product centred on locations, daily crew shifts, vehicles,
just-in-time stock, asset servicing and dispatch. Customers and properties
already exist: extend the existing model rather than replace it.

The current client is a Capacitor application with web admin/field code. It
has a four-operation IndexedDB write outbox, not full offline operation.
The existing arrival helper is a foreground 100-metre distance check, not
Android background geofencing. Current completion writes status and timestamp;
it does not enforce the proposed evidence/material rules.

Batch 8.2 reproduced network-dependent cold bootstrap and package-lock drift.
It did not redesign module loading, implement offline reads or add background
location. Those are new planned capabilities below.

Repository START_HERE/ARCHITECTURE contain historical environment statements.
Account counts, deployment and migration application must be checked separately
before release; no current production state is inferred from those documents.

## Independent execution rules

1. Each agent branches from its own last completed commit. The numbers are
   labels, not a requirement to wait for the other track.
2. Claude owns migrations, backend business rules, desktop dispatch/settings,
   customer delivery and the existing admin API adapter. Codex owns native
   packaging, Android lifecycle, crew interaction, offline storage/sync and
   cross-cutting admin CSS. Exact file allowlists/exclusions are mandatory in
   each execution prompt; broad feature names are not sufficient ownership.
3. Existing shared modules have one writer per batch window. New field modules
   use a Codex-owned adapter against the agreed API contract; they must not
   independently reimplement server validation or pricing.
4. Define a versioned operation/data contract before implementing a cross-track
   capability. Include payloads, permissions, versions, idempotency keys,
   response/error states and representative fixtures. Each track keeps a
   reviewed snapshot and tests it locally. No runtime import from the other
   agent's branch and no prerequisite on its push.
5. The client may finish against fixtures before the server is ready. Label
   that result honestly: client complete against contract, integration unrun.
   If a contract decision is unresolved, work on an independent slice rather
   than silently guessing or waiting for implementation.
6. No blanket test glob. Each track invokes its explicit local suites. Shared
   runner registration and cross-track checks happen in a separately authorized
   integration change; database suites remain separately selectable.
7. New migrations are written and tested on explicitly disposable local data
   only until live application is authorized. No live data/settings/grant
   changes, destructive cleanup, merge, rebase onto the other track or deploy.
8. Preserve the current outbox until an execution prompt authorizes a defined
   expansion. New requirements do not authorize silently adding handlers,
   changing its schema or introducing a competing queue.

## Proposed batches

Each row defines a bounded outcome. Split into smaller commits/milestones inside
the batch if necessary; do not combine all features into one release.

| Batch | Owner | Outcome and principal acceptance evidence |
| --- | --- | --- |
| **8.1 — Operations foundation** | Claude | Recover Permanent Lighting Phase D requirements; propose additive crew/role, vehicle, route/stop, stock/unit, shift, asset placement and property-zone contracts over existing customers/properties/jobs. Implement only the separately authorized first slice. Disposable DB checks prove crew isolation, admin access, referential integrity and versioned/idempotent operations. |
| **9.2 — Reliable native startup** | Codex | Reconcile declared dependencies and lockfile; bundle pinned Capacitor/Supabase modules and required local assets. Cold start without external module CDNs loads the shell and gives an honest cached/unavailable state. Verify clean install, packaging and offline module bootstrap. Full offline job access is not claimed yet. Shared Supabase import/package ownership must be expressly assigned for this batch. |
| **9.1 — Warehouse accounting and administration** | Claude | One backend stock ledger for warehouse/vehicle transfers, job consumption, returns, damage/loss/miscounts and asset deployment. Calculate today's Add/Remove lists and configurable buffer from route work; reconcile physical counts; generate next-day staging. Backend locks historical consumption and prevents concurrent double deployment. Test units, negative-stock policy, duplicate replay, concurrent adjustments, revisions and discrepancies. |
| **10.2 — Offline field core** | Codex | Durable authorised job/route/notes/zone reads, photo persistence, restart recovery and explicit pending/conflict states using the agreed sync contracts. Select native SQLite/Room integration versus IndexedDB after a focused design spike. Extend the existing outbox only for approved operations. Test airplane mode after prefetch, process restart, lost acknowledgement, storage failure and logout/account changes. Map availability is separately qualified. |
| **10.1 — Property layers and dispatch board** | Claude | Desktop satellite drawing for work/no-treatment/hazard zones, layer-specific asset/service requests, crew/vehicle assignment, route timeline and manual drag-and-drop ordering. Provide persisted geometry and map/status contracts, equipment checklist administration, breakdown/stock alerts and fleet breadcrumb read views using fixtures. Automatic optimization belongs to 12.1. |
| **11.2 — Crew warehouse lifecycle** | Codex | Start Shift opens the required five-minute Remove/Add checklist before normal route/address access. Show estimated job materials with large counters, approved add-on drawer, End Shift physical count and reason-tag discrepancies. Display locally recorded versus server-confirmed stock; completed ledgers are read-only. Tests cover offline staging, interrupted shifts and inaccessible/failed confirmations. Uses contract fixtures, not Claude's branch. |
| **11.1 — Completion, adjustments and evidence rules** | Claude | Server validates before/after evidence, completion transitions, immutable material history, time records and approved on-site add-ons. Use existing backend pricing and quote/change-order mechanisms; preserve accepted/sent history. Specify offline provisional completion versus server acceptance and idempotent report events. Test direct API bypass attempts and conflicting/replayed completion. |
| **12.2 — Field map and tactile execution** | Codex | Layered drop-off/pick-up/service/hazard pins, property/work-zone overlays and notes bottom sheet. Three-second hold or swipe completion with equivalent accessible confirmation, before/after capture, metadata/watermark preview, dictation and clear material-lock state. Device tests cover gloves/touch cancellation, GPS denial/accuracy, photo restart recovery and screen reader use. Offline maps follow an approved provider approach. |
| **12.1 — Routing and ETA service** | Claude | Backend route optimization and traffic-aware ETA with manual override, route revisions, next-stop semantics and cost/rate controls. Consume telemetry fixtures, cross notification thresholds rather than requiring exact ETA equality, deduplicate alerts across retries/reroutes and suppress stale arrivals. Test changed schedules, skips, cancellation and unreliable location. Verify supported Google routing API before choosing endpoints. |
| **13.2 — Android telemetry and field dispatch actions** | Codex | Permission-based on-shift background tracking, adaptive moving/stationary updates, geofence events, clock/start eligibility and access/breakdown actions against contracts. Prototype the requested 30-second/5-minute targets; measure actual Android delivery/battery limits. Stop tracking off shift, expose stale/disabled states and test denied permissions/process death. No promise of exact polling or exact 50m arrival from GPS. |
| **13.1 — Customer communications and portal** | Claude | Extend the existing notification pipeline for ETA/arrival/access SMS, scoped expiring customer tracking links, crew identity display, completion summary and payment-provider links. Portal work beyond these features needs its original missing requirements. Keep credentials server-side; reports expose only intended evidence. Provider doubles prove retry/dedup behavior; real delivery needs owner setup/authorization. |
| **14.2 — Full Android field validation** | Codex | Validate the integrated warehouse-to-route-to-completion journey on physical Android: cold/warm offline restart, sync, camera, background service, permissions, Back/keyboard/share, TalkBack and battery behavior. Record model/OS/results and separate browser/emulator/device evidence. Device and integration availability are prerequisites for this validation, not earlier client implementation. |
| **14.1 — Operational readiness and release evidence** | Claude | On a separately authorized integrated build, validate ledger reconciliation, roles, duplicate deployment protection, routing fallback, notification SLA, portal token expiry and historical quote protection. Produce migration/release/rollback runbooks and unresolved-owner checklist. Deployment/live application remain separate authorizations. |

Codex can start 9.2 while Claude scopes 8.1. Neither needs the other's code.
Logical feature dependencies still exist at integration: stock consumes route
work; field screens consume operations contracts; ETA consumes telemetry; public
tracking consumes authorised ETA/location. Independent implementation does not
remove those release dependencies.

## Required design choices before the affected implementation

- **Keep the current application architecture by default.** Treat native Android
  Maps/Location and Room as candidate integrations within Capacitor, not an
  implicit Kotlin rewrite. Choose a durable storage approach from restart,
  eviction, migration and photo-queue requirements; record the tradeoff.
- **Offline has a defined boundary.** Previously authenticated, authorised and
  prefetched work must remain usable after restart offline. New login, new
  assignments, server price approval, external map downloads and SMS delivery
  require connectivity. Mark pending completion/uploads honestly and decide
  conflict rules for revoked assignments and completed work.
- **Offline maps need a provider decision.** Do not promise cached Google
  satellite tiles merely because job data is cached. Review the supported SDK,
  offline capabilities, licensing and cost; offer cached vector work zones and
  coordinates even when a basemap is unavailable, if acceptable to the owner.
- **Crew roles differ from admins.** Assigned-job access, inventory privileges,
  dispatch access and cached-data revocation need explicit policies. Reuse
  existing Auth/RLS; do not give all technicians administrative privileges.
- **Location eligibility needs an exception workflow.** The existing helper is
  100m; proposed arrival is 50m. Configure separate arrival/start/clock radii,
  freshness and accuracy thresholds. GPS cannot conclusively prove payroll
  honesty. Clock-in at warehouse versus first job must be settled. Unknown or
  denied GPS is never silently accepted; an authorised, audited exception must
  remain possible for legitimate field work.
- **An ENTER event is not proof work began.** Decide whether arrival SMS says
  only "arrived" or waits for confirmed Start Job before saying "beginning work".
  Handle drive-bys, duplicated geofences and stationary update delays. Android
  background/foreground-service behavior and distribution requirements must be
  checked for the target SDK/device fleet.
- **Evidence policy:** decide offline provisional completion, when uploaded
  evidence is required, missing-GPS behavior and metadata retention. Preserve
  originals plus capture time/accuracy and server receipt; watermarks are a
  display aid, not proof a device clock/location was authentic. Dictated notes
  need review and an internal/customer-facing distinction.
- **Stock policy:** define units, source-of-truth counts, reservation versus
  consumption, fractional quantities, buffer (15% is an example), minimum tools,
  returns and discrepancy authority. Geometry/measurement-derived material
  estimates require a confirmed rule per service, including lighting.
- **On-site upsells:** record an offline pending request without inventing a
  price or altering a frozen invoice. Backend pricing and the approved customer
  authorization/change-order flow determine the actual adjustment.
- **Customer delivery:** choose SMS/payment providers, consent, supported
  region, reply handling, link lifetime, visible location detail and crew photo
  availability. A blocked-access button requests a backend notification; do
  not put provider secrets or automatic SMS sending directly in the app.
- **Two-minute summary target:** define it from server-accepted completion with
  available evidence and handle delayed sync. The existing two-minute worker
  cadence alone does not guarantee delivery within two minutes; measure and
  adjust the pipeline in the assigned batch. Offline completion cannot promise
  an immediate customer email.

These are decisions to make when writing the relevant execution prompt, not a
request to answer every question before reviewing the roadmap.

## Blueprint coverage

| Requested capability | Scheduled ownership |
| --- | --- |
| Customers/properties, custom coordinates, routes, trucks, items, crew accounts | Claude 8.1; existing entities extended |
| Google Android Maps/Location integration | Codex design in 9.2/10.2, implementation 12.2/13.2 |
| Offline maps/notes/photos/completion and automatic sync | Codex 10.2, 12.2; Claude completion contract 11.1 |
| Load-In Remove/Add lists, adjustable buffer, route access gate | Claude calculation 9.1; Codex crew UI 11.2 |
| On-site prefilled ledger, counters, upsell drawer | Claude 9.1/11.1; Codex 11.2 |
| End Shift counts, discrepancy reasons, tomorrow staging | Claude 9.1; Codex 11.2 |
| Blue/red/green/orange pins, polygons, notes dialogs, desktop forbidden zones | Claude 10.1; Codex 12.2 |
| Adaptive background tracking, traffic ETA, 1h/30m alerts, tracking link, 50m arrival | Codex 13.2; Claude 12.1/13.1 |
| Gate/access SMS and reply workflow | Codex action 13.2; Claude 13.1 |
| Hold/swipe completion, before/after evidence, watermarks, voice notes | Codex 12.2; Claude validation 11.1 |
| Clock-in/start-job geofences, historical material lock | Codex 13.2; Claude 8.1/11.1 |
| Drag/drop dispatch, route optimization, breadcrumbs and coloured live states | Claude 10.1/12.1; Codex telemetry 13.2 |
| Vehicle equipment checks and breakdown flags | Claude definitions/alerts 9.1/10.1; Codex 11.2/13.2 |
| Concurrent asset double-booking block | Claude 8.1/9.1; clients show conflicts |
| Completion summary, photos/time/materials, email and payment link | Claude 11.1/13.1 |
| Permanent Lighting Phase D; broader customer portal | Retained in 8.1/9.1 and 13.1, with missing original details flagged |

## Completion and integration evidence

Every implementation batch reports branch/base/SHA, changed files, executed
test commands and results, meaningful failure-before-fix evidence, screenshots
actually inspected and remaining limitations. Server tests use disposable DBs;
frontend tests use contract fixtures plus a real browser. Native SDK/build,
emulator, physical device, provider sandbox and live production results are
reported separately. No passing mocked test is described as an integrated or
production result.

Integrate in useful product increments when authorised: (1) reliable startup
and offline assigned work; (2) warehouse/crew stock lifecycle; (3) mapped tactile
execution; (4) routing, telemetry and customer delivery. Register the explicit
suites, reconcile contracts, run real client/server checks and verify historical
quotes before release. Implementation tracks continue independent work while
these checkpoints are scheduled.

Standing release items remain visible: unapplied customer-content freeze and
7.1 migrations, migration/grant/data investigations, physical Android checks,
production validation and owner account/provider configuration. Never represent
these as completed merely because a roadmap or migration file exists.

## Sources inspected for this draft

- Owner's location-first product blueprint, uploaded 2026-10-10.
- Earlier Claude recovered batch-plan upload (original 6.x–9.x structure).
- Current Codex checkout at d33d17e, START_HERE.md, ARCHITECTURE.md,
  QUOTING_ENGINE.md and tests/native-readiness.md.
- Current api.js completion path, native foreground location wrapper,
  geofence.js and offline-queue.js. No live database was queried.

This draft is saved outside the repository for review. No product code, tracked
repository plan, Git commit, branch integration or external system was changed.
