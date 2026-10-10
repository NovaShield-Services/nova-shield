# Prompt for Claude — revised Nova Shield roadmap after Batch 7

Adopt the attached revised batch plan as our roadmap. This request is planning
and scope preparation; do not execute the entire roadmap or apply live changes.
All X.1 batches are yours. All X.2 batches belong to Codex. Use Batch 7 as the
owner's completed planning checkpoint; preserve any later work already present
and identify it accurately rather than repeating or discarding it.

Read repository instructions, your current branch and existing handoffs first.
Verify your actual base commit. Use your own completed branch; no rebase/merge
onto Codex and no prerequisite on Codex's next push. Prepare the exact 8.1
implementation scope, owned files, operations-contract v1 and disposable-local
test approach. Preserve missing authoritative source/schema as a recorded gap;
do not build a fake production baseline from assumptions.

Business requirements:

- One crew now, maximum two. Second crew uses its own car. Stock locations:
  Base, Car A, optional Car B; distinct balances and one shared base pool.
- Nova Shield owns/supplies Christmas lights. Customers receive no equipment
  ownership. After termination/non-renewal, recovered and inspected lights can
  be reused. Temporary customer assignment, permanent equipment/run identity,
  history, condition and length/type matter. Non-response renewal cutoff is
  still an owner decision; do not invent one or release installed stock.
- Suppliers: https://lightsdepot.ca/ and
  https://permanentlightingdirect.ca/diy-kits . Verify actual products where
  access permits. Codex's proxy could not access them; pack sizes/kit contents
  are not established. An unopened permanent kit and its component stock may
  never both count as available.
- Bulk chemicals: bleach, degreaser, rust remover, Gutter Bomb and Dawn. Track
  product/strength and litres, with purchase containers and vehicle transfers
  kept distinct. Salt/de-icer choice and pack sizes are still unknown.
- Critical components each; strings by length/type; channel by stick/profile;
  cuttable wire length; fixed cable kits each; chemicals litres; solid salt kg;
  cheap supplies can use replenishment levels. Freeze applicable pack conversion
  with receipts. Never portray approximate quantities as exact balances.
- Include service equipment rules in the first loading implementation: siding
  requires washer + soft-wash kit; suggest returning removable bleach tools
  if none of that car's assigned jobs needs them. Check all services, deduplicate
  reusable tools, preserve manual Keep and require physical transfer confirmation.
  Keep addresses/notes visible while preparing.
- Existing customers/properties/jobs, service scope units, price RPCs, quote
  snapshots/guards/rollups and notification worker are reused. Backend pricing
  only. Do not create parallel inventory per service or a parallel sender/outbox.

Your X.1 roadmap:

8.1 stock foundation/units/simple crew access; 9.1 Christmas reuse and reviewed
permanent/heating material plans; 10.1 service equipment/load rules, replenishment
and reconciliation; 11.1 evidence/completion/material locks and approved change
orders; 12.1 simple two-crew dispatch/property information and explicit message
actions; 13.1 customer summaries/payment links/narrow portal; conditional 14.1
routing/ETA/scoped tracking; 15.1 backend release evidence/runbooks.

Codex's X.2 roadmap:

8.2 native startup/reproducible packaging, retaining existing readiness work;
9.2 durable offline assigned work; 10.2 crew vehicle loading/reconciliation;
11.2 tactile completion/photos/reviewed dictation; 12.2 field maps/access/issues;
13.2 physical Android core qualification; conditional 14.2 on-shift background
location/geofences; 15.2 final native qualification/recovery runbook.

You own migrations/backend rules, api.js, quote/settings/admin management views
and customer pages. Codex owns field/mobile modules, admin.css, native/offline
modules, Android/build packages and main.js navigation registration. Use existing
CSS primitives or a new scoped management stylesheet. Shared dom/format/harness
are read-only. New admin screens can be tested standalone; cross-track navigation
and runner registration occur during a separate integration change. Freeze the
same contract snapshot in both assignments; independent fixture testing is not
integrated/server/device proof.

No live migrations, grants, settings/data cleanup, external customer messages,
merge, deployment or APK publication. Preserve outstanding 7.1/freeze release
items. Local migrations/tests may target only an explicitly disposable database
with a fail-closed guard. Keep mocked tests and DB suites separately selectable.

First return a concrete 8.1 scope/contract and your actual starting state. Flag
only questions that affect correctness; do useful independent preparation first.
Do not start later batches simply because they appear in this roadmap. Future
GPS/route automation is conditional; no more-than-two-crew system, sign/mower
service expansion, payroll surveillance or marketing-site redesign.
