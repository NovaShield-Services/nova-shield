# Nova Shield — On-Site Service Quoting Engine

Phase 1 deliverable (audit + proposed architecture), written before any
implementation, per the task brief's own process. Everything below was
verified against the live repository and the live Supabase schema/RPC
bodies — not assumed from an earlier handoff or from memory.

**Headline finding: the hard part is already built.** The pricing engine
(`calculate_job_pricing`), the mixed-elevation model (`job_sections`), the
per-service modifier system (`pricing_modifiers`), the property-wide site
factors (`site_factors`), quote versioning (`duplicate_quote`,
`parent_quote_id`), change orders, and PDF/send/customer-quote flows all
already exist, are already wired together, and already match most of what
the task brief asks for. What's genuinely missing is the **field UI** —
today's measurement editor is one generic form for every service, not the
service-tailored slider/stepper/dropdown experience the task wants — plus
a small number of real, specific gaps called out below.

This changes the shape of the remaining work: mostly UI (Phases 3–7), a
couple of small additive schema changes (Phase 2), not a rebuild of the
calculation layer.

---

## 1. Current architecture assessment

```
properties ──┬─ job_sections (elevations: storeys/access/ground/ladder/distance)
             │        │
customers ───┤        │
             │        ▼
ns_jobs ─────┴─ job_measurements (service_id, section_id, quantity, unit)
                      │       │
                      │       ├─ measurement_modifiers → pricing_modifiers
                      │       └─ job_measurement_addons (flat/per_unit extras)
                      │
                      ▼
          calculate_job_pricing(job_id)   [SQL, STABLE, admin-only]
                      │
                      ▼
          create_quote_from_calculation() → ns_quotes + quote_line_items (SNAPSHOT)
                      │
          quote_adjustments (discount/surcharge/travel/custom)
          ns_change_orders (post-send scope changes, never rewrite the total)
                      │
          duplicate_quote() → new version, parent_quote_id chain
                      │
          mark_quote_sent() → notifications → Resend
                      │
          get_customer_quote() → site/quote.html (public, curated payload)
```

Admin UI today: `admin/js/views/job.js` (desktop) and
`admin/js/views/field-workspace.js` (Field Console) are two different
shells around the **same three shared components** —
`measurements.js`, `quote.js`, `change-orders.js` — which is exactly the
"one quoting system, two front doors" shape the task asks for. No
duplicate quote systems exist anywhere.

## 2. Existing calculator/pricing structures found

- **`services`** (15 rows): `key, name, category[cleaning|lighting|winter],
  unit[sq_ft|linear_ft|each|fixed], parent_key, quotable, detail jsonb`.
  Jump-wire lighting is modeled as a **child service** via `parent_key`
  (`permanent_lighting_jump`, `christmas_lighting_jump`) — real rows,
  hidden from the public site (`site-api.js` filters `parent_key is null`).
  This is the existing pattern for "a second priced component of the same
  job" and it already works end to end.
- **`pricing_rules`** (17 rows, date-versioned via `effective_from`/`_to`):
  rate + minimum per service. **All 14 customer-facing services have a
  live rate today** — see the discrepancy flagged in §11.
- **`pricing_modifiers`** (151 rows): `service_id, group_key, group_label,
  option_key, label, kind[multiplier|flat|per_unit], value`. Every
  cleaning/winter service already has 3–5 modifier groups (access,
  condition, surface, scope, height, salting, …) with real, specific
  values — not placeholders. Full table is in §5.
- **`site_factors`** (11 rows, NOT service-specific): `ground, ladder,
  distance` — exactly the property-wide conditions the task asks for,
  already separated from service-specific modifiers.
- **`job_sections`**: `storeys, access, ground, ladder, distance` per
  named elevation. This is the mixed-elevation model the task's §5
  requires — **already built**, not a simplified 1-storey/2-storey
  selector. A measurement's `section_id` decides which elevation's
  height/access/ground/ladder/distance apply to it.
- **`job_measurement_addons`**: ad hoc flat or per-unit extras per
  measurement (e.g. "+$50 oil/degreaser treatment"). `per_unit` multiplies
  by the **parent measurement's own quantity** — see the real limitation
  this creates in §11.
- **Calculation** (`calculate_job_pricing`, read in full): per measurement,
  `quantity × rate × (explicit multiplier modifiers × section
  height/access × site ground/ladder/distance) + flat modifiers + addons`,
  summed per service, then `minimum_applied` only when `computed_amount >
  0` (a service with no scope is never bumped to its minimum). This is
  correct, generic, and needs no change for any service shape described
  in the task brief.
- **Quote lifecycle**: `create_quote_from_calculation` snapshots
  `job_measurements` → `quote_line_items` (so later edits to measurements
  never retroactively change a quote already shown to a customer);
  `duplicate_quote` deep-copies line items + adjustments (not change
  orders, by design — see `change-orders.js`'s own comment) into a new
  version chained by `parent_quote_id`. Versioning already does exactly
  what task §19 asks.
- **Offline** (`offline-queue.js`): exactly four queued action types —
  `updateProperty`, `createMeasurement`, `uploadJobPhoto`, `saveSignature`.
  Everything else (including `updateMeasurement`,
  `setMeasurementModifier`, `addMeasurementAddon`, `deleteMeasurement`,
  quote building/adjustments) calls `api.js` directly and needs a live
  connection today. See §7.

## 3. Proposed reusable calculation architecture

**Keep `calculate_job_pricing` / `create_quote_from_calculation` /
`recalculate_quote_totals` exactly as they are.** They are correct and
already generic across `sq_ft`/`linear_ft`/`each` units, multi-measurement
services, mixed elevations, and arbitrary modifier combinations. Rebuilding
this layer would be pure risk with no upside.

What Phase 3 should build is a **measurement-editor primitive** — one
component, configured per service from the price book data that already
exists (`pricing_modifiers` grouped by `group_key`, `services.unit`),
rendering the right input shape:

| `services.unit` | Field shape |
|---|---|
| `sq_ft` / `linear_ft` | number input (today) → add a slider option for the common range, same pattern as the reference calculator, with the number input kept as the precise fallback |
| `each` | stepper (+/−), not a slider |
| modifier groups (`access`, `condition`, `surface`, …) | dropdown, as today — already correctly derived from the price book, not hardcoded |
| `job_measurement_addons` | the existing "+ Extra charge" affordance, kept |

This is an enhancement of the existing generic editor's *presentation*,
not a new data model — `measurements.js` already derives its fields from
the price book (`serviceModifierGroups`), it just always renders a plain
number input and dropdowns regardless of unit or group size.

Two real, specific gaps need a decision before Phase 4/5:

**Gap A — countable sub-items (heat-cable valleys/corners, the thing the
reference calculator does well).** Today's `job_measurement_addons.kind
='per_unit'` multiplies by the *parent measurement's* quantity (e.g. "+$2/
linear ft"), not by an independent count — there is no clean way to charge
"3 valleys × $45" as a distinct countable line today. Two options:

- **(A) Child services**, reusing the exact jump-wire pattern:
  `winter_deicing_cables_valley`, `..._corner` etc., `unit='each'`, their
  own `pricing_rules` row, linked via `parent_key`. Zero schema change,
  reuses a pattern already proven in production. Costs a few extra
  `services` rows.
- **(B) Add a `quantity` column to `job_measurement_addons`** and
  reinterpret `per_unit` to mean "× the addon's own quantity" instead of
  the parent measurement's. No new service rows, more intuitive "extra
  items" UI, but it's the one place this project would touch
  `calculate_job_pricing`'s SQL, and it changes what `per_unit` means for
  every *existing* addon — needs care so live quotes don't silently
  reinterpret.

**My recommendation: (A) by default** — lowest risk, already proven,
ships in Phase 4/5 with no engine change. I'd only reach for (B) if (A)
turns out clunky once heat-cable is actually being built. This is flagged
for your sign-off, not decided unilaterally, since it shapes schema going
forward either way.

**Gap B — no "requires review" state exists anywhere** (task §11). Proposed,
minimal, additive: `job_measurements.review_required boolean default
false` + `review_reason text`. The quote summary derives "this quote needs
review" from whether *any* of its measurements are flagged, rather than a
second quote-level column that could drift out of sync. This is the one
schema change I'd actually make in Phase 2.

Nothing else needs a schema change. `ns_quotes`, `quote_line_items`,
`quote_adjustments`, `ns_change_orders`, `pricing_modifiers`,
`site_factors` are all already sufficient.

## 4–5. Service-by-service measurement + modifier model (as built today)

| Service | Unit | Modifier groups (real, live values) | Field 4/5 treatment |
|---|---|---|---|
| Siding | sq_ft | access, condition, height, surface | slider+number (area), dropdowns |
| Roof Soft Wash | sq_ft | access, condition, height, surface | slider+number, dropdowns |
| Gutter Brightening | linear_ft | access, condition(oxidation), height, scope | slider+number, dropdowns |
| Concrete | sq_ft | access, addon(flat: degreaser/rust/multiple), condition, surface | slider+number, dropdowns |
| Deck | sq_ft | access, condition, surface(material) | slider+number, dropdowns |
| Fence | linear_ft | condition, height, scope(1/both sides), surface | slider+number, dropdowns |
| Windows | each | height, scope(ext-only/int+ext), surface(window type) | **stepper**, dropdowns — already count-based, not sq-ft, matching task §8E exactly |
| Moss | sq_ft | access, condition(coverage), scope(follow-up), surface | slider+number, dropdowns |
| Graffiti | sq_ft | access, condition(difficulty), surface | slider+number, dropdowns |
| Permanent Lighting (+ jump-wire child) | linear_ft | height (main only) | slider+number per roofline section; jump-wire as its own measurement row against the child service |
| Christmas Lighting (+ jump-wire child) | linear_ft | height (main only) | same pattern as permanent |
| Heating Wire Install | linear_ft | access, condition(gutter condition), height, scope(coverage) | slider+number for linear run; **valleys/corners need Gap A/B above** |
| Walkway/Deck Snow Removal (2 pages, 1 service) | each | access, height(ground-level only), salting(flat), scope(what's cleared), surface | stepper for visit count or a "per visit" toggle — see §11 on the seasonal-total model |

Every row above already has real `is_default` options and real values —
none of this needs inventing. The **only** services with no written
customer-facing copy (`services.detail = {}`) are the four lighting rows;
every cleaning service and winter_property_care already has rich,
specific `why/intro/expect/included/affects_quote` content worth reusing
rather than rewriting (task §10's own instruction).

## 6. Database changes required

1. `job_measurements.review_required boolean default false`,
   `job_measurements.review_reason text` — Phase 2, additive, no
   migration risk to existing rows.
2. *Conditionally*, only if Gap A (§3) turns out insufficient once heat-cable
   is actually built: a `quantity` column on `job_measurement_addons`.
   Not doing this now.
3. Nothing else. No changes to `services`, `pricing_rules`,
   `pricing_modifiers`, `site_factors`, `ns_jobs`, `ns_quotes`,
   `quote_line_items`, `quote_adjustments`, `ns_change_orders`,
   `job_sections`.

## 7. Offline implications

The new service-specific editors will call `updateMeasurement`,
`setMeasurementModifier`, `addMeasurementAddon`, `deleteMeasurementAddon`,
`deleteMeasurement` far more often than today's generic editor does (every
slider drag, every modifier change). **None of these five are in
`offline-queue.js`'s `HANDLERS` map today** — only `createMeasurement` is.
A tech adjusting an existing measurement's quantity or condition while
offline would fail outright with the current code.

Phase 6/8 should extend `HANDLERS` with these five, each following the
exact `callOrQueue` pattern already proven for the other four — this is a
mechanical extension of working infrastructure, not new architecture, and
is exactly the kind of thing `ARCHITECTURE.md` finding #17 (written this
session) already flagged as a residual gap.

## 8. Quote-version implications

None beyond what already exists. `create_quote_from_calculation` snapshots
`job_measurements` into `quote_line_items` at build time — a quote is
already fully decoupled from the measurements that produced it, so a new
measurement-editor UI changes *how* `job_measurements` rows get populated,
never how a quote is versioned, duplicated, or sent. Low risk by
construction.

## 9. Testing strategy

- **SQL-level**: call the real `calculate_job_pricing` (not a
  reimplementation) with fixture jobs covering: zero quantity, exactly at
  minimum, multi-elevation (front 1-storey/rear 2-storey), multiple
  modifiers on one measurement, multiple measurements on one service,
  jump-wire as a child service, addon flat vs per_unit.
- **Component-level (Playwright)**: the new measurement-editor primitive,
  mocking `api.js` the same way this session's native-wrapper and
  offline-reload tests did — slider→number sync, stepper bounds, dropdown
  defaults, review-required flagging.
- **Offline round-trip**: extend this session's `reload-offline` suite to
  the five newly-queued action types in §7, using the same
  `setOffline()`/forced-`navigator.onLine` technique.
- **Regression**: existing quote send/PDF/customer-quote-page flows get a
  smoke pass after Phase 7, since nothing in this plan changes their
  contracts, only what feeds into them.

## 10. Phase-by-phase difficulty (effort per your rule)

Given §1's headline finding — the calculation engine is already correct
and generic — none of the nine phases look like MAX or Opus territory by
your own rubric. Flagging this plainly rather than defaulting to a higher
tier than the work needs:

| Phase | Work | Effort |
|---|---|---|
| 1 | Audit (this document) | Sonnet 5 HIGH — breadth, not depth |
| 2 | Add `review_required`/`review_reason`; decide Gap A vs B | Sonnet 5 HIGH — small additive schema |
| 3 | Measurement-editor primitive (slider/stepper/dropdown) | Sonnet 5 HIGH — UI wiring/data-mapping |
| 4 | Highest-value calculators (siding, roof, concrete, windows, lighting) | Sonnet 5 HIGH per service; reassess if Gap A's child-service pattern fights the UI |
| 5 | Remaining calculators (deck, fence, moss, graffiti, snow, heat-cable) | Sonnet 5 HIGH; re-gauge heat-cable specifically once Phase 4's pattern is proven |
| 6 | Field Console / Property Passport integration + offline HANDLERS extension | Sonnet 5 HIGH |
| 7 | Quote summary / versioning / PDF / send wiring | Sonnet 5 HIGH — mostly already built, this is integration |
| 8 | Offline/mobile validation | Sonnet 5 HIGH |
| 9 | Automated tests + regression | Sonnet 5 HIGH |

I'll stop and re-gauge mid-phase if something turns out harder than this
table assumes, per your rule — the most likely candidate is Phase 5's
heat-cable work if Gap A's child-service pattern proves awkward for
valleys/corners specifically.

## 11. Open questions needing your sign-off before Phase 2

1. **Winter pricing is live, not placeholder.** The project handoff I was
   given states winter rates ($55/visit, $45 min; $14/ft, $450 min) are
   "explicitly NOT guaranteed final" and the owner still needs to approve
   them. The actual database shows these same numbers as **active,
   effective `pricing_rules` rows** (`effective_from` 2026-10-01 — a few
   days ago), with full modifier sets already built out. I'm not changing
   or removing them, but I'm not treating them as silently-approved either
   — are these real, approved rates now, or should they stay flagged as
   provisional in the UI (e.g. a visible "pending approval" badge) until
   you confirm?
2. **Gap A vs B (§3)** — confirm the child-service pattern (A) for
   heat-cable valleys/corners, or would you rather I hold that decision
   open until Phase 5.
3. Separately, not blocking: the public-site interactive category grid
   described in your earlier project handoff already exists
   (`site/js/components/service-grid.js`) — just flagging that it's not
   outstanding work, in case it reads that way from the handoff alone.

Once 1–2 are settled, Phase 2 is a small, low-risk migration and I'll move
straight into it.
