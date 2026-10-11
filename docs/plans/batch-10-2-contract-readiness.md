# Batch 10.2 — contract readiness after offline recovery

Codex owns the phone preparation/closing interface. The maintained scope is
in [the roadmap](batch-plan-after-7.md#102-codex-crew-keepaddreturn-and-end-day-interaction).
Batch 9.2 supplies bounded offline job reads and the existing four-type outbox;
it does not add stock writes or a second queue.

## Verified starting point

Claude's `claude/batch-8-1` at `4c2e9be` has
`docs/operations-contract-v1.md`: attributed stock movements, locations,
conserving transfers and caller operation IDs. Base and Car A exist in its
disposable fixtures; Car B is optional data. That contract explicitly omits
crew access policies and reservations. It contains no daily load response or
schedule-version confirmation operation. No Claude code is imported here.

The following is an integration checklist, **not an invented RPC contract**.
The route must stay unavailable until a real adapter and its frozen contract
exist. UI-only fixtures do not establish authorization or stock correctness.

## Inputs the load contract must define

1. A stable vehicle/location ID, work date and authoritative plan/revision ID,
   including whether Car B is available. The interface must not seed Car B,
   infer crew membership or present stock belonging to another vehicle.
2. Display-ready Keep/Add/Return rows and reason/job references, with required,
   aboard, reserved, available and shortage quantities distinguished. Include
   operating units, exact/estimated and usable/damaged counts, named seasonal
   sets and incomplete-data/Needs review states. Codex will not calculate these
   authoritative recommendations from service names or quote quantities.
3. Authorized visit summaries with addresses, access notes and service needs.
   A mixed day must explain why shared tools stay aboard; a no-bleach day may
   suggest returning removable bleach tools while preserving manual Keep.
   Siding includes the washer/soft-wash kit. Each car has its own day.
4. The exact supported confirmation, manual Keep, authorized exception,
   consumption and closing operations, including permissions and unit rules.
   Reservation, issued stock and actual consumption must not be counted twice.
   Confirming a recommendation must not masquerade as a physical transfer.
5. Server enforcement of the plan revision at confirmation. A late schedule
   change returns a typed stale/conflict response and current revision; it
   cannot silently apply an obsolete load list. Specify offline expiry too.
6. Immutable retry payloads, operation IDs and accepted/replayed receipts.
   Define lost-response lookup/retry behavior, validation failures and
   conflicts. Retries must not add stock twice. Existing movement replay IDs
   alone do not define how a load revision or reservation is validated.
7. A versioned fixture set for siding, no-bleach, mixed services, lighting,
   winter replenishment, repeated jobs, Car B and late schedule changes, with
   permission, shortage and lost-response examples.

Once supplied, Codex can implement against injected adapters on its own branch
without waiting for a backend merge or changing `api.js`. Adding precisely
specified stock operations to the existing outbox requires an explicit local
schema migration and tests preserving its four existing actions and legacy
payloads. Pending/review states must remain distinct from accepted movements.

Acceptance will include 390/430px touch and keyboard use, interruption/restart,
separate vehicle state and duplicate replay prevention. Android physical
storage/device checks and cross-track integration remain separate from mocked
browser acceptance. No live database change, merge or deployment is implied.
