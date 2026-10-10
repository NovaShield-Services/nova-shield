# Nova Shield service operations blueprint — revised for one or two crews

Operating proposal, 2026-10-10, accepted by the owner as the current planning
basis, with the service-equipment loading addition below. This improves the
product requirements before assigning development batches. It is not an
implementation authorization.
The earlier location-first batch roadmap is superseded. Updated with the owner's
confirmed seasonal ownership, suppliers, bulk chemicals and separate second car.
The revised development allocation is now in `batch-plan-after-7.md`, with
every X.1 owned by Claude and every X.2 owned by Codex.

## Scope and business scale

Design for one active crew by default and at most two. A crew may contain more
than one person: individual sign-in and accountability do not imply additional
crews. One owner/operator view, one primary crew view and an optional second
crew are sufficient. No multi-branch hierarchy, franchise structure, unlimited
fleet management, complex crew allocation engine or dispatch command centre.

Use one stock base (garage, storage room or warehouse as actually used), Car A
for the current crew and optional Car B for the second crew. The owner confirmed
that the second crew has a separate car. Keep separate balances and loading
lists for each vehicle; one combined vehicle balance would hide shortages.
Only two crew choices are needed. Keep shared tools assignable so both crews
cannot rely on the same ladder or machine. Do not assume either car has the
space or carrying capacity of a work truck.

## Confirmed business facts and remaining supplier uncertainty

- Nova Shield owns and supplies the Christmas lights. Customers acquire no
  ownership of the equipment. A display can be reused for another customer
  after termination or non-renewal, recovery and condition/fit checks.
- Christmas-light supplier: [Lights Depot](https://lightsdepot.ca/).
- Permanent-light supplier: [Permanent Lighting Direct DIY kits](https://permanentlightingdirect.ca/diy-kits).
- The second crew will use a separate car.
- Planned bulk chemical purchases include bleach, degreaser, rust-removal
  products, Gutter Bomb and Dawn soap. These are separate product entries,
  not one generic cleaner. Product strength/formulation and actual pack sizes
  remain unconfirmed. Salt/de-icer products and sizes remain unconfirmed.

Both supplier sites were requested on 2026-10-10; the environment web proxy
refused access with HTTP 403. Supplier contents, live availability, dimensions,
prices and pack conversions were not verified. Do not populate them from guesses.

The aim is to answer five practical questions quickly:

1. What work is booked, and what does this property need?
2. Do we have the correct materials and equipment to finish it?
3. What must go on the vehicle before leaving?
4. What was installed, used, returned or damaged?
5. What must be replenished or prepared for the next visit/season?

Inventory should reduce missed equipment, repeat journeys and lost seasonal
sets. Logging must be proportionate to the value and operational importance of
the item. Do not make the crew count every screw after every job.

## Service fit and priorities

The repository lists nine cleaning services, permanent and Christmas lighting,
and two winter service types. The two snow-removal public pages are variants of
one visit-based service. Internal jump-wire pricing components are not separate
customer services. These distinctions must survive the new operations model.

The service mapping below uses those confirmed facts. Component examples remain
proposed categories: actual supplier products and pack contents require checking.

| Service | Inventory burden | What matters operationally |
| --- | --- | --- |
| Christmas lighting | Highest lifecycle burden | Company-owned reusable stock, temporarily assigned display sets, labelled bins, install/removal dates, condition checks and return to the reusable pool after non-renewal. Renewals can reuse the existing layout; new bookings first check suitable recovered stock. |
| Permanent lighting | Highest component/compatibility burden | Correct-colour channel, compatible modules/strings, wire, connectors, controller and power components. Reserve materials for accepted work, record installed system and warranty-relevant components, return usable surplus. |
| Heating-wire installation | High selection/availability burden; job volume determines priority | Correct manufacturer/model and cable/kit length, compatible fixings/control parts, installed product record. Distinguish fixed-length kits from products explicitly permitted to be cut to length. Quoted roofline length is not necessarily cable length. |
| Winter clearing and salting | High replenishment burden during storms | Salt/de-icer by product and mass, working shovels/blower/spreader if used, fuel if relevant. Load for the next actual snow event; replenish during a route. Actual treatment quantities vary with conditions. |
| Siding and roof soft washing; moss removal | Moderate shared consumables burden | Product-specific chemical supplies, approximate remaining volume, machine/hose kit and condition-specific preparation. Proposed material estimates require real usage data and approved product instructions. |
| Concrete cleaning; gutter brightening; graffiti removal | Moderate, potentially job-specific consumables burden | The correct specialist cleaner/remover for the surface and task, plus equipment. A small specialist product may be more critical than a large amount of general cleaner. |
| Deck and fence cleaning | Low-to-moderate inventory burden | Cleaner actually used, machine and accessories. Do not assume staining/sealing materials: those services are not in the current catalogue. |
| Window cleaning | Usually lowest consumables burden | Complete window-cleaning kit and the supplies used by your method. Track filters/resin only if your setup uses them. A count of windows is work scope, not stock consumption. |

Practical inventory priority is therefore seasonal lighting and permanent
lighting first, salt/replenishment next, and shared cleaning supplies/tool
readiness alongside them. Actual service frequency and money tied up in stock
can change that order; do not rank solely by technical complexity.

Repository Christmas copy describes company-owned custom-cut displays stored
under the customer's name. The owner confirms ownership but also confirms reuse
after cancellation/non-renewal. A property assignment is temporary, not a
permanent dedication of those lights. Permanent-lighting copy describes
colour-matched channel and an installed controller; it does not establish the
contents of the owner's selected DIY kits.

## Four different types of inventory

| Type | Examples | Appropriate tracking |
| --- | --- | --- |
| Installed materials | Lighting channel/modules, heating cable, installed controller | Planned/reserved/issued/installed/returned quantities. Installation reduces available stock; customer installation history remains. |
| Consumables | Cleaner, salt, inexpensive fasteners | Product/quantity or replenishment level, according to importance. Shared stock must not be duplicated into separate service inventories. |
| Reusable equipment | Ladder, washer, hose reel, blower, spreader | Presence, condition and assignment. Using a ladder does not consume it. No serial tracking for every small tool. |
| Temporarily assigned seasonal sets | A company-owned Christmas display and labelled storage bin(s) | Set identity independent of customer, current assignment, reusable contents, location, condition and seasonal movement. These remain company assets while deployed. |

A storage bin is a container, not a purchasing box. One display can occupy two
bins without becoming two displays. Reserved or deployed sets are unavailable
to another job. After confirmed cancellation/non-renewal, recover, inspect and
release the suitable components/set to available stock. Unassigned loose stock,
assembled sets and current customer assignments must not be double-counted.

Give the equipment/set a permanent internal ID; the current customer is an
assignment that changes. Preserve previous layouts and service records as
history. Reuse depends on measured run lengths, colour/type, compatible parts
and condition: a returned 12-foot run cannot satisfy a 20-foot need just because
both are described as one string. Reconfigure a set when needed instead of
forcing the next customer to accept the previous property's layout.

If a customer simply has not called for next season, use a renewal cutoff and
owner review before releasing reserved stock. That cutoff is a business choice
still to be set. Cancellation does not release lights still on the property.

## Pieces, boxes, lengths, litres and kilograms

The unit a supplier sells is often different from the unit that work uses.
Record the purchasing pack size and the operational unit for each product.
Crew-facing loading quantities can still say boxes, bags or rolls.

| Item | Purchase/load unit | Operational tracking recommendation |
| --- | --- | --- |
| Controllers, power supplies, timers, finished heating kits | Each or supplier carton | Each, distinguished by model/specification. A carton is converted to its actual contained count. |
| Permanent-light DIY kits | Supplier kit of a stated model/coverage | Unopened kits until opened; then their verified component quantities. A full kit and the parts inside it must never both count as available stock. |
| Independently replaceable LED modules/bulbs and critical connectors | Packs/boxes | Each when useful to planning and replenishment. Integrated strings/sections remain strings/sections of a stated length; do not invent individually replaceable pieces. |
| Lighting channel | Bundles/cartons of standard lengths | Full sticks by colour/profile/length, plus usable offcuts with their length when worth keeping. Quoted frontage length alone cannot decide the number of sticks. |
| Cuttable wire or cable | Roll/reel | Remaining length, using feet or metres consistently for that product. Keep reusable remnants separate if needed. A fixed-length cable kit remains a kit, never a cuttable roll. |
| Lighting clips and mounting consumables | Box/bag | Pack size supports a piece estimate for job planning. Crew can load packs without counting every clip at each stop. Use precise pieces only where practical; otherwise show estimates and low-stock replenishment. |
| Cheap screws, tape and similar small supplies | Box/roll | Box/roll replenishment or Full/Low/Empty status initially. Tracking every individual screw offers little value at this scale. |
| Bulk bleach, degreaser, rust remover, Gutter Bomb and Dawn | Actual supplier container/case with stated volume | Litres by exact product/formulation, with smaller quantities displayed in mL if useful. Keep base containers, vehicle stock, concentrates and working solutions separate. Approximate levels are permitted and labelled. |
| Solid salt/de-icer | Bag/pail with stated mass | Kilograms, displayed as full bags plus partial quantity when useful. Different products remain separate. Liquids/brines use volume if actually used. |
| Reusable tools and machines | Each/set | Each or checklist kit. Significant shared items need assignment/condition; ordinary kit contents need presence checks. |
| Company-owned Christmas display | Set, carried in labelled bin(s) | Set identity plus run lengths/components, temporary property assignment and container identities. Released stock can be reused or rebuilt after inspection. |

Examples below illustrate conversions only; none is your confirmed pack size:

- A box of 100 connectors received as 2 boxes adds 200 connectors. If a job
  needs 120, loading 2 boxes is not consumption of 200; unused parts remain.
- Ten 20 kg salt bags total 200 kg. Using approximately 8 kg leaves a partial
  bag; it must not be deducted as a whole bag. If usage is estimated, label it.
- A 20 L drum with approximately 6 L left is not a full drum. Purchase and
  consumption of concentrate are not the same as volume of diluted spray mix.
- Changing suppliers from 100-piece boxes to 80-piece boxes must not change
  previous receipts. Store the applicable pack size with each transaction.

Use two counting policies: exact stock for valuable/critical parts and reusable
sets, and replenishment/estimated levels for low-value or difficult-to-measure
consumables. Never present an exact expected count computed from approximate
logs. Receipt/transfer/consumption/return are distinct events: loading is a
transfer, not a sale or usage.

For the selected permanent-light supplier, establish a component sheet for each
kit before estimating job stock: coverage, channel/lighting format, power and
control components, wire/connectors, included quantities and separately required
items, all taken from the actual product listing. Do not assume every kit has
the same contents or that a quoted coverage length solves the installation plan.

Receiving a kit creates sealed-kit stock. Opening it transfers its recorded
contents into component stock, or issues the kit directly to a job with surplus
returned afterward. Start with one method per kit type and preserve the source
receipt so parts can be traced without an elaborate warehouse system.

## Bulk chemicals and two-car stock

Use three physical locations: Base, Car A, and optional Car B. Location is
separate from condition/reservation: stock can be in a car but reserved for a
specific job. Crew A's load does not reduce Car B's existing balance.

Record the actual bulk container volume, product/concentration, received date
and supplier reference. "High-quality bleach" is not a stock specification:
record the actual product and stated strength. Supplier storage/use-by guidance
and age matter to usable stock, particularly bleach; do not assume old and new
supplies are interchangeable solely because the volume matches.

Receiving a container adds to Base. Decanting purchased product into a vehicle
container transfers that volume from Base to the chosen car; it is not chemical
consumption. Usage reduces that car's balance. Refilling with already-counted
stock must not create a second receipt.

For example only: from a 20 L bulk container, transferring 5 L to Car A and
5 L to Car B leaves 10 L at Base, 5 L in each car and 20 L total before use.
The example is not a confirmed supplier container size.

Keep purchased concentrate quantities distinct from prepared solution: adding
water does not create more purchased concentrate. The inventory module records
products/approved preparation information; it does not infer mixing recipes
from names such as Dawn or Gutter Bomb. Actual product labels/specifications
determine intended use and compatibility.

Crew interaction can stay simple: choose the product, confirm transfer/usage,
or mark remaining level. Small-use supplies can be Low/Enough/Empty instead of
measuring every millilitre. Replenish each car to its own practical baseline;
buy alerts consider available unreserved base stock, lead time and the next
confirmed work, not only the size of the supplier's cheapest bulk container.

## Connect measurements to materials without changing quotes

Keep three quantities separate: quoted work scope, planned materials, and
actual installed/used materials. Existing backend service pricing stays intact.

- Permanent lighting: measured roofline sections and jump runs inform a
  reviewed materials list. Channel colour/profile, usable stock lengths,
  corners/cuts, module spacing and controller capacity affect requirements.
  Do not derive electrical configuration from footage alone.
- Christmas lighting: first-year design creates a reusable, labelled display
  layout from suitable available stock first, purchasing only shortages.
  A renewal normally reserves that display plus repairs/spares rather than
  buying the original footage again. A non-renewing display can be reassigned
  after release/inspection. Installation, takedown and storage are linked work
  stages, not three automatically charged new jobs.
- Heating wire: roofline/downspout measurements, valleys/corners and the
  manufacturer's layout determine the selected cable/kit. Existing valley
  pricing rows are not automatically physical inventory parts.
- Cleaning: area and condition can support a suggested supply estimate once
  real usage is known. Initially use an owner-reviewed allowance. Do not
  invent universal litres-per-square-foot recipes or dosing rules.
- Snow: route, service scope, salting choice and current conditions inform the
  next event's load. A season's quoted number of visits does not represent
  salt consumed today. Walkway/deck variants must not duplicate the load.
- Windows: window count helps duration/work scope; it does not mean one bottle
  or one piece of equipment per window.

Reserve materials for confirmed work, not every unsent quote or every option
in an option group. A customer choosing one option releases unused alternatives.
Changing the plan does not rewrite historical consumption. On-site add-ons
become approved work/change orders through backend pricing; a material counter
must not silently edit a customer's sent quote or invoice.

## A practical daily workflow

**Before the day:** the owner sets the route/order, confirms job materials and
checks shortages. Display incomplete plans visibly instead of fabricating a
complete loading list. Tomorrow staging is a suggestion: weather, cancellations
and purchasing can change it. Update affected loads when assignments change.

**Morning:** show Keep, Add and Return lists. Keep the standard tool kit and
reasonable baseline consumables aboard. Keep service-specific equipment only
when required for the day or deliberately retained by the owner/crew. Load the
day's job kits, customer sets and missing supplies. Return completed-job surplus
and unneeded service kits, including bleach-work tools when no job needs them.
Check known high-impact items first: correct controller, right channel colour,
customer's Christmas set, working equipment, enough salt/required cleaner.

### Current-scope addition: service-based equipment loading

Owner-confirmed example: siding cleaning requires a pressure washer and the
soft-wash supplies/equipment used by Nova Shield. When no job assigned to that
vehicle needs bleach-work tools that day, put the removable bleach-work kit on
the Return list. This is a load-planning requirement, not an instruction about
application pressure or a chemical preparation recipe.

Include this small rule feature in the first inventory/loading-assistant
implementation rather than postponing it to a separate future batch. The
current app has no equipment inventory/load planner to tweak directly; the
incremental requirement is small once that foundation is being built.

Minimum design:

- Owner-maintained service templates list required tools/kits and a simple
  needed/not-needed or manual supply allowance. Jobs can override the template
  for their actual method/scope. A crew can deliberately keep an item as a spare.
- For each vehicle independently, combine all of its assigned jobs for the
  day. Deduplicate reusable equipment across sequential stops; three siding
  jobs do not imply loading three washers. Respect a job that explicitly needs
  more than one item. Consumable allowances remain a separate quantity plan.
- Compare required equipment with what is confirmed aboard: required and
  aboard = Keep; required and absent = Add; removable and aboard but not
  required by any stop = Return. Standard items marked Always keep are retained.
- Check the whole day across all services. A washer still needed by another
  configured service stays aboard even if there is no siding job. A kit is
  removed only when none of the day's jobs require its shared tools.
- Incomplete job requirements do not establish that a kit is unneeded. Show
  Needs review and avoid confidently proposing its removal from missing data.
- Crew confirms physical loading/unloading before stock locations change.
  Recalculate the recommendation when jobs are added, cancelled or reassigned;
  a late added bleach job must restore the kit to Add if it was removed.

Initial verification: siding adds the required washer/soft-wash kit; a day
without bleach work suggests returning the removable kit; mixed services retain
shared equipment; repeated jobs do not duplicate equipment; Car A/Car B stay
separate; manual Keep is preserved; missing requirements require review; and a
schedule change updates the recommendation without inventing a physical transfer.

Claude owns the service-template/requirement contract and authoritative load
rules in the inventory/backend scope. Codex owns the vehicle load checklist
against those contracts in the field scope. Exact files and batch numbers are
assigned in the next development plan; neither implementation needs the other's
branch. Do not put pricing calculations into these templates.

Deferred extras: automatic chemical usage forecasting, cut-layout optimization,
payload optimization and sensor-based detection of what is physically loaded.

Do not hide the entire route/address list until every checkbox is cleared.
The crew needs addresses/notes to judge access and missing requirements. Show a
clear Not ready/Ready state; require confirmation of critical missing items or
an owner-authorised reason before departure. A low pack of cheap fasteners
should not create the same block as a missing controller.

**At the property:** show the scope, access/hazard notes, required kit and
planned materials. Record installed parts or meaningful consumable adjustments;
avoid keystroke logging. For cleaning, an end-of-job approximate usage entry or
end-of-day refill can suffice. For Christmas, confirm the set/run identity.
Photos and completion steps depend on service and risk.

Readiness includes access, weather suitability, working water/power where the
method requires them and appropriate equipment. A fully checked inventory list
does not prove the job is possible. Let the crew record blocked access,
unsuitable conditions or equipment failure, reschedule work and release/replan
reserved materials without pretending completion.

**After completion:** lock the recorded job ledger; corrections are explicit,
attributed adjustments with a reason, not silent edits. Mark offline completion
as pending until server acceptance. Distinguish crew work finished from an
invoice/customer approval or evidence upload still pending.

**End of day:** return surplus, identify damage, record salt/chemical levels
and mark tools needing attention. Count critical parts/sets and investigate
meaningful variances. Use quick low-stock checks for ordinary consumables and
periodic physical counts rather than mandatory exact counts of everything.

**Seasonal Christmas cycle:** prepare/test set → assign/install → service if
needed → remove → check/dry/repair → store in labelled location → reserve for
renewal OR release to available reusable stock after non-renewal. Cancellation
does not make a still-deployed set instantly available. The new assignment uses
fit/condition checks and preserves the previous customer's installation history.

## What to keep, simplify and defer from the original vision

| Feature | Revised recommendation for this business |
| --- | --- |
| Offline notes, photos, assigned work and recovery | Keep as an early core requirement. Connectivity failures affect both crews. Define what is prefetched and pending. |
| Morning load assistant | Keep; include service-specific tool requirements and Keep/Add/Return recommendations in its first implementation. Bleach-work tools return when no assigned job needs them, with shared-tool and manual-retention checks. |
| Inventory | Start with lighting sets/critical components and consumable replenishment. Add precision only when it reduces a real loss or repeat trip. |
| Scheduling/maps | Start with today's ordered list, optional second-crew column, property pins and navigation handoff. Preserve sensible manual order. |
| Property flags | Start with access/hazard notes, photos and a marked entrance/treatment area. Add desktop polygon drawing when jobs justify it. Drawn areas are not surveyed property boundaries. |
| Touch completion and photos | Keep deliberate confirmation and large controls. Offer accessible alternatives. Recommend before/after for cleaning/damage-sensitive work, installation evidence for lighting and a configurable winter proof requirement. Do not force an identical long workflow at every snow stop. |
| ETA/customer contact | Start with a crew-triggered On the way/access message and confirmed arrival. Add traffic/geofence automation only when stop durations and mobile behavior support useful estimates. Arrival does not prove work has begun. |
| Shift time | Simple start/end and job time records may be useful. GPS-blocked payroll and fraud detection are not initial requirements for an owner-led crew. Location denial needs a legitimate exception. |
| Fleet breadcrumbs, driving behavior, elaborate dispatch board | Defer. A one/two-crew day overview and visible issues cover the immediate need. |
| Background GPS and customer live truck map | Later optional capability after device/battery validation and confirmed customer value. Do not promise exact 30-second updates or a precise 50m trigger. |
| Universal +15% material buffer | Replace with product/service-specific reserve rules. Spare connectors can make sense; an extra expensive controller at every site may not. |
| Sign drop-off/pick-up and mower inventory | No such services confirmed in the current catalogue. Keep as a separate business expansion option; do not build the core around them now. |
| Automatic two-minute report/payment email | Keep customer completion reporting as a goal, starting with the existing pipeline. Provider choice, accepted completion/evidence availability and payment workflow must support the timing claim. Offline work cannot promise immediate delivery. |

## Purchasing, exceptions and stock confidence

Include low-stock alerts, a simple buy list, receiving actual deliveries and
supplier/product reference. Forecast demand is not purchased stock; a placed
order is not received stock. Show reserved versus available quantities so
accepted jobs do not compete for the same controller or set.

Record returns, defective/quarantined items, repair needs and usable offcuts
without counting them as ready stock. Know when a count was last checked and
whether it is exact, estimated or stale. Where practical stock cannot fulfil a
job, show the shortage and owner-approved substitution/delay; do not silently
convert one product into another or erase a variance.

For the second crew and separate car, use two load lists and two vehicle stock
balances with one shared base. Reserve scarce stock once across both crews. If
both work together on a site, one shared work order and lead completion can
avoid duplicate usage/photos. Transfers between cars must debit one and credit
the other; the same item cannot appear in both merely because the crews share
a job. Show a shortage if combined demand exceeds available usable stock.

Choose who records usage for each job/vehicle. Even one crew can have two
phones: one lead should finalise the shared ledger, with attributed changes
from others. Offline retries must not consume stock twice. This is a practical
requirement at one crew, not a reason to build a larger workforce platform.

Three service-specific loading examples illustrate the intended behavior:

- **Christmas install day:** load the named sets/bins for booked properties,
  required ladders and a small repair kit. Existing sets are not assembled
  from new bulk stock each morning. A removal day instead needs room for
  returned sets and a clear label/condition process.
- **Cleaning day:** retain the standard machine/hose kit, check the specific
  products needed and top up an appropriate amount. Availability of water and
  job access are part of readiness. Retain shared tools needed anywhere that
  day; return removable bleach-work equipment on days with no bleach work.
- **Winter route:** confirm weather-triggered work and load the relevant
  de-icer/tools for the expected scope, leaving a practical reserve and a
  replenishment option. A heavy or repeated event may need a reload; it must
  not be treated as a normal next-day fixed route with exact salt demand.

## Decisions still requiring business input

1. Set the renewal deadline/release policy for customers who do not call again,
   and identify how you label, store and test recovered lights.
2. Identify actual products from the confirmed suppliers, standard lengths,
   pack quantities, compatible controllers and supplier order units.
3. Identify exact bulk cleaner formulations/strengths and purchase sizes;
   confirm salt/de-icer products, sizes and typical actual usage.
4. Identify the actual stock base, each car's existing tool kit and practical
   space/load limits. The second car itself is already confirmed.
5. State which services are busiest and which missing supplies currently cause
   repeat trips or the largest losses. This determines implementation order.
6. Agree critical departure/completion requirements per service and the owner's
   exception/correction authority. Decide what a deferred or inaccessible job does.

Partial answers are enough to revise individual sections. Until supplied, the
material examples remain recommendations, never seeded product data or assumed
business rules. No native storage choice or development batch numbering needs
to be settled before the operating model is agreed.

## Review outcome and next planning step

The useful first product is a reliable daily work view, property-specific
lighting set/material preparation, lightweight consumable replenishment and
offline evidence capture for one crew, with an optional second crew. The
larger automation vision remains available as later additions where value is
demonstrated. After owner feedback, turn this operating model into bounded
Claude/Codex batches with explicit file ownership and independent tests.

Sources: owner blueprint, one/two-crew constraint and confirmed supplier,
ownership, second-car and bulk-chemical answers; repository
site/js/lib/routes.js, lighting service pages/category copy, QUOTING_ENGINE.md,
service-specific calculators and the previous native-readiness handoff.
No live database was queried. Supplier websites were requested but blocked by
the environment proxy; no supplier specifications were verified. No app code,
database, batch assignment, merge or deployment changed.
