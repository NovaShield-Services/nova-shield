# Nova Shield: revised development plan after Batch 7

Owner's planning checkpoint: Batch 7 complete. Every X.1 belongs to Claude;
every X.2 belongs to Codex. This document replaces the earlier speculative
forward batch allocation. It is a roadmap for review and assignment, not
authorization to implement all batches or change live systems.

## Starting state and carried-forward work

Start the new roadmap at 8.1/8.2. Preserve completed Settings, measurement
reliability, field recovery, quote revisions/delivery and backend pricing.
The Codex checkout already records native-readiness/accessibility work at
d33d17e under 8.2. Keep that evidence and count those requirements as completed
where reproduced; revised 8.2 addresses remaining startup/build gaps. Do not
discard or repeat completed fixes because the owner uses Batch 7 as the overall
checkpoint. Before each implementation, verify the agent's own branch and SHA.

Claude's 7.1 work is reported at 7a2f2af; its repository fixes and outstanding
live application are distinct. The customer-content freeze, other unapplied
migrations, grant/migration investigations and data-cleanup questions remain
release items. This roadmap does not authorize applying or cleaning anything.

## Confirmed product requirements

- One crew now, at most two; Crew B has a separate car. One stock base, Car A
  and optional Car B. Individual logins do not imply more crews.
- Christmas lights are owned and supplied by Nova Shield. Customers obtain no
  ownership. Released, recovered and inspected lights may serve another
  customer. An active assignment/reservation prevents double use.
- Christmas supplier: https://lightsdepot.ca/ . Permanent-light supplier:
  https://permanentlightingdirect.ca/diy-kits . Current supplier contents/pack
  sizes could not be verified here because the web proxy returned HTTP 403.
- Bulk cleaning products: bleach, degreaser, rust remover, Gutter Bomb and Dawn.
  Product strengths, supplier pack sizes and salt/de-icer choices are unknown.
  Leave them configurable/unset until entered or verified; do not fabricate.
- Inventory priorities: Christmas reusable sets; permanent-light components;
  heating-kit selection; salt and shared bulk-cleaner replenishment; reusable
  equipment readiness. Nine cleaning services share product stock where
  appropriate rather than creating duplicate stocks per service.
- Stock units: critical parts each; strings by specified length/type; channel
  sticks and usable offcuts; cuttable wire length; fixed kits each; chemicals
  litres; solid de-icer kilograms; cheap supplies by pack or Low/Enough/Empty.
  Supplier packs convert to operating units using recorded pack contents.
- Permanent-light kits count as sealed kits OR their unpacked components,
  never both. Installed permanent materials and reusable seasonal assets have
  different lifecycles.
- Siding work requires the owner's pressure-washer/soft-wash kit. No bleach
  work anywhere on a vehicle's day means suggest returning its removable
  bleach-work tools. Preserve tools needed by other services and manual Keep.
- Load assistant is Keep/Add/Return for each vehicle. Confirm physical movement
  before stock moves. Do not hide property addresses/notes during preparation.
- Existing scope units and material units remain separate. Windows are work
  counts, not inventory; seasonal snow visits are not today's salt consumption.
  Walkway/deck variants are one winter service, not duplicate loads/minimums.
- Existing price calculations remain backend-only. Add-ons use the approved
  quote/change-order workflow and preserve sent/accepted historical content.

The full operating rationale is in service-operations-blueprint.md. This plan
implements it in manageable stages; it does not silently reinstate previously
deferred fleet/payroll features.

## Ownership and independent execution

Claude owns backend rules, migrations, admin inventory/planning, customer
communications and customer pages. Codex owns field/mobile UX, native packaging,
Android integration, offline persistence and field accessibility. These are
responsibility assignments, not claims that one agent cannot do the other work.

Mandatory file boundaries for every implementation prompt:

| Files | Writer |
| --- | --- |
| supabase migrations and recovered/new backend function source | Claude |
| admin/js/lib/api.js, quote/settings/customer admin views | Claude |
| New admin operations views and admin-specific tests | Claude |
| New narrowly scoped admin operations stylesheet, if required | Claude; only its management-view selectors |
| admin/js/field.js, field-schedule/workspace/photos, field-only adapters/components | Codex |
| measurement-entry, calculators, navigation/native/geofence/offline-queue | Codex |
| admin/css/admin.css | Codex; Claude uses existing primitives or its scoped sheet |
| package manifests/lockfiles, native bundling scripts, Android project | Codex |
| shared/supabase.js | Codex for the explicitly assigned packaging change; Claude read-only |
| shared/dom.js, shared/format.js, tests/harness.mjs | Read-only unless an assignment explicitly transfers ownership |
| admin/js/main.js and general route registration | Codex; new Claude screens tested standalone, route wiring at integration |
| site customer pages/adapters | Claude in the customer batch; public marketing redesign excluded |
| tests/run-regression.sh and integration orchestration | Separate owner-authorized integration change |

Both agents start from their own completed branches. No rebase onto the other
agent, no merge of the other track and no requirement to wait for its push.
Frontend/server contracts are supplied as frozen snapshots with each relevant
assignment. They define IDs, payloads, units, authorisation, status/version,
idempotency, errors and representative fixtures. Agree the contract before
dependent implementation; neither agent invents a conflicting counterpart.

Codex tests against an injected/mock operations adapter. Claude tests backend
and admin flows on an explicitly disposable database and provider doubles.
New UI modules must load with their supplied adapters; avoid unresolved imports
of exports that exist only on the other branch. Existing app startup must still
work. Feature availability must be explicit until real integration exists.

Independent tests establish each track's behavior against the contract; they
do not establish integration. Cross-track database/API/native validation is a
separate checkpoint. Ordinary product dependencies still exist at release.

## Batch 8 — Foundation

### 8.1 Claude: stock foundation, units and minimal crew access

**Goal:** establish trustworthy stock for Base/Car A/Car B over the existing
customers/properties/jobs, with one crew enabled and an optional second.

Deliver an additive inventory catalogue and append-only stock movement rules:
receipts, transfers, reservations, releases and attributed corrections. Support
equipment, installed materials, consumables and reusable seasonal assets;
pack/unit conversions; exact versus estimated counting; supplier references;
usable/damaged stock; and simple owner/assigned-crew permissions. Provide a
small admin catalogue/receive/transfer view with existing UI primitives.
Opening balances are explicit entries, never guessed from old quotes.

Define operations-contract v1, including replay IDs, actor/vehicle, units,
record version, reservation and pending/conflict responses. No broad role
designer or fleet expansion. Do not yet implement seasonal layouts, automatic
loading, routing, customer messages or pricing changes.

**Acceptance:** transfers conserve totals; historical receipts preserve their
pack sizes; a replay cannot add stock twice; both crews cannot reserve the same
scarce stock; crew cannot read/alter unassigned records; corrections preserve
history. Disposable DB and standalone admin browser checks execute meaningfully.

### 8.2 Codex: native startup and reproducible packaging

**Goal:** reliable Android app bootstrap and a reproducible development build.

Retain/reproduce existing readiness/accessibility/plugin-registration fixes.
Resolve package/lockfile mismatch; bundle version-matched Capacitor and Supabase
imports; audit staged assets; make startup errors recoverable. Preserve the
browser admin's existing singleton/API behavior. Keep Capacitor rather than
starting a native rewrite. Use the available SDK to compile if possible;
report build/device prerequisites precisely if unavailable.

**Acceptance:** clean dependency install, local asset audit, core browser
regression and an offline cold module-bootstrap check. Offline shell loading
must give an honest unavailable/cached-work state, not promise full offline
job access. Native compile/permission/device results remain separate.

**Independence:** 8.1 needs no Android changes; 8.2 needs no inventory backend.

## Batch 9 — Lighting reuse and offline assigned work

### 9.1 Claude: seasonal reuse and installation material planning

**Goal:** choose suitable owned lighting stock before buying more and prepare
the right components for confirmed installation work.

Add Christmas set/run IDs independent of customers, temporary assignments,
run length/type/colour, bins/storage locations and condition. Model reserve,
install, recover, inspect/repair and owner release for reuse; preserve previous
customer history. An unrenewed set becomes releasable according to an owner-set
cutoff, never an invented date or while still deployed.

For permanent lighting, implement reviewed material sheets, sealed kit opening,
component availability, compatible product references and worthwhile offcuts.
Fold confirmed Permanent Lighting Phase D requirements into this same stock
system. Support heating-kit selection in the material sheet; actual layouts
and kit contents require product data. No automatic electrical/cut optimization.

**Acceptance:** a recovered/released set can serve a new property while history
remains; installed/reserved sets cannot be allocated twice; length/type matters;
opening a kit creates its recorded components without double-counting; accepted
work reserves only selected materials, not every draft quote option.

### 9.2 Codex: durable offline job reads and existing write recovery

**Goal:** reopen prefetched, authorised work, notes and pending photos after
an offline restart and recover sync without losing changes.

Cache a bounded assigned-work snapshot, notes/access information and required
local photo data; show freshness and offline limitations. Evaluate native
SQLite integration versus IndexedDB against restart/eviction requirements, then
record the choice; do not adopt Room purely because it appeared in the blueprint.
Keep the existing outbox and explicitly design any required migration. Start
with its existing four write types; additions need a defined contract/scope.
Handle logout/account changes, retained drafts, photo persistence and storage
failure without claiming offline new-login/server pricing capability.

**Acceptance:** prefetch → airplane mode → restart → read/edit supported work
→ reconnect → reconcile. Include lost responses, revoked/stale assignment,
storage failures and account separation. Browser offline tests and Android
storage/process tests are reported distinctly. Offline basemaps remain separate.

**Independence:** 9.1 uses local DB/admin fixtures; 9.2 uses existing job reads
and the assigned snapshot contract. Neither requires the other's implementation.

## Batch 10 — Daily loading, replenishment and closing

### 10.1 Claude: authoritative load planning and reconciliation

**Goal:** a correct daily equipment/material plan and simple replenishment
administration for each car.

Service templates identify required equipment, removable kits, Always keep and
reviewed consumable allowances; permit job overrides. Compute Keep/Add/Return
across the vehicle's whole day. Reusable equipment is deduplicated across
sequential jobs; consumables are quantity-planned separately. Include the siding
washer/soft-wash requirement and no-bleach-day return rule now.

Provide admin shortages/buy list, actual receiving, bulk-product transfers,
vehicle baseline replenishment and next-day suggestions. End-day reconciliation
supports exact critical counts, estimated consumables and damaged/lost/miscounted
reasons. A schedule change revises recommendations, not physical balances.

**Acceptance:** shared tools remain aboard if any stop needs them; missing
requirements show Needs review; manual Keep survives; both cars have independent
loads; bulk decanting conserves volume; no reserve/issued/consumed double-count;
route revisions cannot silently confirm obsolete loading.

### 10.2 Codex: crew Keep/Add/Return and end-day interaction

**Goal:** a quick, glove-friendly preparation and closing flow on the phone.

Show the required vehicle list, named lighting sets, consumable levels and
shortages. Keep addresses/notes visible. Crew confirms loading/unloading and
can retain an optional spare or record an owner-authorised exception. Large
controls log material usage, transfers/returns and end-day condition/counts.
Expand the existing outbox only for the precisely assigned idempotent operations
and persistence migration, with queued versus accepted/conflict states.

**Acceptance:** useful at 390/430px, accessible controls, separate vehicle state,
interruption/restart recovery and no duplicate stock movement after replay.
Use fixtures for siding, a no-bleach day, mixed services, lighting, winter
replenishment, repeated jobs and a late schedule change. Preserve the existing
measurement/Back guards and four existing queued actions.

**Independence:** both use the frozen load contract. Codex does not calculate
authoritative stock rules/prices locally; cached recommendations can be pending
review when offline. Claude does not edit Codex's field/global CSS files.

## Batch 11 — Job evidence, completion and historical protection

### 11.1 Claude: completion/evidence contracts and material history

**Goal:** accepted completion has the appropriate evidence and immutable,
attributed resource records, enforced by the server.

Define service-specific evidence: installation/component evidence for lighting,
appropriate before/after for cleaning and configurable quick winter proof.
Implement completion checks, version/conflict protection, ledger locks and
reasoned corrections. Offline work finished is provisional until evidence and
server validation succeed. Preserve original capture metadata alongside receipt
time; watermarks alone are not trusted proof. Integrate approved upsells with
existing backend pricing/change orders and existing quote guards.

**Acceptance:** direct API calls cannot bypass required evidence or rewrite
closed consumption; internal notes retain intended editability; retries create
one accepted completion event; rejected/stale offline completion preserves data
for review; add-ons cannot rewrite a sent/accepted quote.

### 11.2 Codex: tactile completion, photos and reviewed dictation

**Goal:** deliberate completion with the right amount of field interaction for
each service, resilient evidence capture and clear recovery.

Add hold/swipe or an equivalent accessible confirmation, cancellation handling,
before/after or installation capture, original metadata and watermark display.
Review dictated notes before saving and distinguish internal/customer-facing
content. Show material ledger as locked after accepted completion and pending
while offline. Add completion operations to the same outbox only within this
batch's explicit contract; no parallel queue or client approval bypass.

**Acceptance:** interrupted gestures do not complete a job; quick winter flow
is configurable; photo/notes survive restart; missing GPS has an explicit state;
failed or rejected completion is recoverable; focus/TalkBack and existing Android
Back/dirty-input safeguards remain covered.

**Independence:** backend fixture evidence and injected field completion adapter
use one frozen policy contract. Real enforcement remains an integration check.

## Batch 12 — Practical dispatch, access information and field maps

### 12.1 Claude: simple two-crew dispatch and staff/customer actions

**Goal:** plan today's work and understand delays without a fleet command centre.

Provide a one/two-crew ordered schedule, manual reassignment/reordering, vehicle
equipment conflicts, seasonal installation/removal stages and weather-triggered
winter work. Store access/entrance/work-zone/hazard information on existing
properties. Add a simple admin annotation/drawing tool only for defined work
zones; drawings are not surveyed boundaries. Provide assigned-job status,
equipment breakdown and blocked-access events. Start with crew-triggered
On the way/access requests through the existing notification pipeline.

**Acceptance:** one job is not accidentally dispatched twice; shared equipment
conflicts are visible; order changes revise load plans; customer notes/codes are
properly scoped; cancelled/skipped/blocked work is not called completed; provider
failure is visible and retryable. SMS provider configuration remains external.

### 12.2 Codex: field map, property instructions and dispatch actions

**Goal:** find the entrance/work area and report issues quickly from the job.

Use today's ordered route, navigation handoff, property pins and supported
work-zone overlays; surface critical notes in an accessible sheet. Add blocked
access/breakdown actions and crew-confirmed arrival. Store coordinates/zones
for offline use even when a basemap is unavailable. Decide supported Maps SDK
integration and offline-map provider capability from actual requirements; no
promise of cached Google satellite imagery without verified support.

**Acceptance:** incorrect/missing/denied location does not fake arrival; notes
work offline; route and issue updates have pending/error states; zone/pin actions
are accessible; the UI distinguishes navigation availability from cached data.
No background tracking or new sign/mower service is implemented in this pair.

## Batch 13 — Customer handover and core field qualification

### 13.1 Claude: customer summaries, payment links and narrow portal

**Goal:** deliver a clear completion report and a secure customer handover using
the existing quote/notification system.

Generate the intended customer evidence/time/material summary from accepted
completion; avoid internal notes or previous customers' reused-light history.
Add server-generated payment-provider links once the owner chooses a provider,
and a scoped customer view of their own quotes, completed work and documents.
Broader original portal features remain undefined and require a later scope.
Customer links must expire/be scoped appropriately; keep provider credentials
server-side. Configure SMS replies/access workflow if supported by the selected
provider. Define/measure the two-minute report target from accepted completion
with available evidence, not an offline gesture or worker cadence alone.

**Acceptance:** no cross-customer evidence access; retries do not duplicate
report events; accepted quote history remains frozen; payment links reference
the intended approved amount; provider sandbox and actual delivery outcomes
are distinguished from local doubles.

### 13.2 Codex: Android qualification of the practical core

**Goal:** validate the warehouse-to-field-to-sync workflow on actual Android.

On an authorised integrated candidate, test one crew and two separate car
scenarios, Back/keyboard, startup, cached-work restart, camera/storage/share,
permissions, TalkBack, outbox migration/replay and realistic bad connectivity.
Record model/OS, test steps and results. Run available emulator/build checks
when a physical device is absent and report device work as unrun. Device
availability blocks device proof, not previous independent development.

**Acceptance:** explicit representative journey and failure recovery evidence;
no claim that browser doubles prove a handset. Correct defects only within
Codex-owned files or document the backend issue for its owner.

The useful core product can be released after these goals and the separate
release gate; advanced automation below is not required to make it useful.

## Batch 14 — Conditional automation from the original vision

These goals are retained for the future, not automatically authorised next work.
Proceed when owner value, provider costs, Android capability and data contracts
are settled. Neither track must wait idle for the other to implement a prototype.

### 14.1 Claude: route optimization, ETA notifications and scoped tracking

**Goal:** useful automatic customer updates and route suggestions where they
outperform manual ordering for one/two crews.

Choose the supported routing API; consider service duration, access/time windows,
weather, skips and material availability, not distance alone. Keep manual
override. Consume telemetry fixtures to calculate traffic-aware ETA; fire
1h/30m milestones on threshold crossing and suppress duplicates after rerouting,
cancellation or stale data. Extend the current worker pipeline, recover its
authoritative source if absent from the repository and avoid a parallel sender.
Implement scoped expiring customer tracking showing only their relevant visit,
plus optional crew name/photo supplied by the owner. Measure cost/rate limits.

**Acceptance:** deterministic stale/reroute/duplicate tests, one event per
intended milestone, no public fleet history, expire access after the visit and
fallback when the provider is unavailable. Two-minute/email/SMS SLAs require
real measurements after provider setup.

### 14.2 Codex: on-shift background telemetry and native geofences

**Goal:** measured, permission-aware background location for the approved ETA
and tracking use case.

Implement a dedicated Android-capable location integration with on-shift start/
stop, moving/stationary adaptation and explicit stale/denied states. Treat
30-second moving/5-minute stationary updates as targets, not guarantees. Revisit
the current 100m foreground helper versus proposed 50m arrival using accuracy,
freshness and drive-by handling. GPS ENTER does not prove work started. Record
telemetry offline and upload through the approved contract with retention limits.

**Acceptance:** physical-device foreground/background/process-death and denied
permission tests, battery/delivery measurements, no tracking after shift end,
proper assigned-visit events and no fabricated arrival. Optional simple time
logs remain possible; GPS-blocked payroll/fraud surveillance is not current scope.

## Batch 15 — Release evidence, separately gated live actions

### 15.1 Claude: backend release candidate and migration/runbook review

**Goal:** a reviewable backend/customer release with accurate migration and
authorisation evidence.

Audit unapplied migrations including the sent-customer-content freeze, version
history, grants/RLS, inventory/completion integrity, provider configuration,
report access and notification recovery. Prepare exact ordered application and
rollback/recovery instructions; record data-cleanup candidates with identifiers
and reasons, never speculative deletes or postcode changes. Run integrated/local
DB checks on an explicitly disposable database. Keep legacy-table decisions
separate from additive inventory migrations.

### 15.2 Codex: final native candidate, regression and field runbook

**Goal:** a reproducible native build and an accurate field verification report.

Build/audit the authorised integrated candidate; rerun explicit relevant suites,
device checks including any 14.2 additions, accessible/tactile visual QA and
offline/restart/sync scenarios. Document support/recovery steps and known
limitations. Validate packaged version/dependencies/permissions; do not claim
sync succeeded without server confirmation.

**Gate for both:** merging tracks, production migration/data/grant changes,
external customer messages, publishing APKs or deploying require the owner's
separate explicit instruction. Preparing these concrete artifacts is allowed
in the assigned implementation scope; applying/publishing is distinct.

## Integration checkpoints and evidence

- After the relevant 8/9 work: real stock API + role boundaries + offline
  snapshot contract, plus native reproducibility.
- After 10: actual load suggestions/physical confirmation, two-car transfers,
  stale plans, replay and shortage behavior. Wire admin/field navigation once.
- After 11–13: real evidence/completion rules, immutable consumption, protected
  quotes, customer report access and Android core journey.
- After optional 14: measured background tracking, provider ETA and customer
  link boundaries, with manual fallback.

Checkpoints occur only on an authorised integration candidate. Independent
tracks continue their own applicable work; do not require each pair to merge
before either agent starts its next authorised batch.

Every batch reports base/branch/SHA, changed files, contract version, exact test
commands/results, a meaningful failing case without the new protection, inspected
screenshots where UI changed and remaining blockers. Report local DB/browser,
native build/emulator/device, provider sandbox and production separately. Use
explicit suite lists; new suites are registered in the shared runner at
integration, not a blanket glob that accidentally selects database tests.

## Inputs that remain open without blocking foundation work

Exact supplier kit contents and pack conversions; chemical strengths/container
sizes; salt product; seasonal renewal cutoff; initial counts/storage layout;
service-specific completion rules; SMS/payment provider; offline basemap needs;
and physical Android access. Build editable fields/contracts and representative
clearly labelled fixtures. Do not seed invented facts or turn unknown rules into
silent defaults that release stock, send messages or approve prices.

## Retained but not scheduled as current implementation

Public website redesign; new sign drop-off/pick-up/mowing services; more than
two crews; fleet-driving analytics; GPS-blocked payroll; automatic chemical
recipes/usage forecasting; cut/payload optimization; a universal 15% reserve;
and a broader undefined customer portal. Keep these as explicit future ideas.
