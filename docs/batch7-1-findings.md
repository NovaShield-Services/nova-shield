# Batch 7.1 — findings, blockers, and the live actions awaiting approval

Branch `claude/batch-7-1`, from `a461119`.

Nothing in this batch was applied to the live database. Every live inspection
was read-only. No writing test has ever pointed at the Supabase project —
`tests/db/batch7-1.test.mjs` refuses to start if the connection string
contains `supabase.co`, `supabase.com` or `pooler.supabase` (verified: exit
code 2).

---

## 1. Customer-facing content freeze — PREPARED, not active

**Status re-verified read-only at the start of this batch**, not assumed:
the trigger `ns_quotes_customer_content_draft_only`, the function
`guard_quote_customer_content_frozen`, and any matching row in
`supabase_migrations.schema_migrations` are all **absent**. The protection is
**not active**. The Batch 6.1 admin UI gate remains the only thing stopping an
edit to a sent quote's customer-facing prose.

**A real defect was found in the Batch 5 version and corrected** (in place —
it was never applied, so there is no duplicate). The original guard keyed only
on `OLD.status`, which blocks the one-statement attempt but not the
two-statement one:

```sql
update ns_quotes set status='draft'       where id=X;  -- content unchanged → allowed
update ns_quotes set customer_notes='...' where id=X;  -- now draft        → allowed
```

The corrected migration also refuses to move a row back to `draft` once it has
left. Checked before adding that rule: no code path sets an existing row back
to draft — every `status = 'draft'` in the migration history is a `WHERE`
filter, never a `SET`; `duplicate_quote` inserts a new row.

Both the hole and the fix are executed and asserted in the test suite,
including the "before" state where the rewrite succeeds.

---

## 2. Admin RPC privileges — two confirmed over-grants, hardened

A full read-only inventory of every function in `public` used
`has_function_privilege('anon', oid, 'EXECUTE')` rather than reading the grant
list, so inherited and `PUBLIC` grants are counted. Eleven came back
anon-executable, in four groups:

| Function | Disposition |
|---|---|
| `calculate_job_pricing(uuid, uuid[])` | **Hardened** — admin-guarded, no site caller |
| `save_quote_signature(uuid, text, text)` | **Hardened** — admin-guarded, no site caller |
| `get_customer_quote(uuid)` | Keep — customer quote page |
| `respond_to_quote(uuid, text)` | Keep — customer accept / decline |
| `attach_request_photo(...)` | Keep — public submission photo contract |
| `get_request_status(uuid)` | Keep — public request status lookup |
| `is_admin()` | **Keep — required by RLS** (see below) |
| `guard_quote_is_draft()`, `set_updated_at()`, `job_from_request()` | Leave — returns `trigger` |
| `rls_auto_enable()` | Leave — returns `event_trigger` |

**`is_admin()` must keep its PUBLIC grant.** RLS policies that call it are
evaluated as the *calling* role, so revoking would break every policy that
references it. It returns a boolean about the caller and leaks nothing.

**The trigger / event-trigger grants are inert, and this was asserted rather
than assumed.** Postgres refuses a direct call with
`0A000: trigger functions can only be called as triggers`, whatever the grant
says, and does not consult `EXECUTE` when firing a trigger.

**This is a missing layer, not a reproduced bypass.** Both hardened functions
begin with `if not public.is_admin() then raise ... insufficient_privilege`,
so an anonymous call already fails. It is not described as an open
vulnerability.

### A non-issue, checked rather than "fixed"

`submit_quote_request(...)` shows `anon_can = false` while being referenced
from `site/js/lib/site-api.js`. That looks like a broken public form. It is
not: the site POSTs to the `submit-request` Edge Function, which runs
server-side and calls the RPC. The missing anon grant is correct and
deliberate. No change made.

---

## 3. Legacy tables — write access revoked, nothing dropped

Read-only evidence: `job_requests`, `jobs` and `quotes` all hold **0 rows**,
have **no dependent views**, and are referenced **nowhere** in `admin/`,
`site/`, `shared/` or `supabase/` (grep for the table names and for
`from('jobs')` / `from('quotes')`). This corroborates `ARCHITECTURE.md`
finding 5 from the application side.

No `DROP` is proposed. Finding 5 reserves retirement for the owner, and
"legacy" is an assessment rather than a fact about usage.

### BLOCKER — one unidentified inbound foreign key

`pg_constraint` reported **1 foreign key still pointing at one of these
tables**. The follow-up query naming it was refused by the tooling approval
gate on three attempts, so **the constraint is not identified here**. This
does not affect the revoke (a privilege change cannot violate a foreign key),
but it **must be resolved before any retirement decision**. Run read-only:

```sql
select conrelid::regclass as from_table,
       confrelid::regclass as to_table,
       conname,
       pg_get_constraintdef(oid) as def
from pg_constraint
where confrelid in ('public.job_requests'::regclass,
                    'public.jobs'::regclass,
                    'public.quotes'::regclass);
```

`SELECT` is deliberately left in place — removing a read is the more likely of
the two to surprise something undiscovered. Revisit with the retirement
decision.

---

## 4a. Migration filename drift — corrected, and worse than first reported

**Four** repository filenames disagreed with their recorded versions, not one.
Three were created during Batch 5 by me: I renamed the first file and then
invented timestamps for the next three.

| Repo filename (before) | Recorded version | Now |
|---|---|---|
| `20261007190000_batch4_customer_search…` | `20261007195533` | renamed |
| `20261009130000_batch5_scope_option_group…` | `20261009012127` | renamed |
| `20261009140000_batch5_anchor_option_notification…` | `20261009013356` | renamed |
| `20261009150000_batch5_tighten_grants…` | `20261009013557` | renamed |

**Root cause, which will recur:** the MCP `apply_migration` tool derives the
version from the *apply time* and ignores the filename. Any migration applied
through it will drift again unless the file is renamed afterwards to match the
recorded version, or the Supabase CLI is used instead.

Renaming is safe here: ordering is preserved in both schemes, no applied SQL
was rewritten, and `supabase_migrations.schema_migrations` was not touched.

## 4b. There is no base schema in this repository — a larger finding

`supabase/migrations/` begins at `20261006230637_phase_c_repair_…` and
contains **only incremental changes**. There is no `create table ns_quotes`,
no base DDL, anywhere in the repo.

Consequences:

- **A fresh environment cannot be provisioned from this repository.** There is
  nothing for the migrations to replay onto.
- "Migration replay safety" is therefore partly moot today — the filename
  alignment above is necessary but not sufficient.
- The Batch 7.1 database tests had to build a **minimal fixture schema**
  (`tests/db/fixture-schema.sql`) covering only what these migrations touch,
  with types and signatures taken from read-only introspection. That proves
  the migrations' logic; it does not reproduce production.

Recommended (not done here — outside this batch's scope): capture a baseline
schema dump as the first migration, so the repo can stand up an environment.

---

## 5. Data-quality cleanup — NOT investigated; blocked

The `NS-QA-TEST` records and the `L6Y 3W6` postcode could **not** be
investigated. The read-only query enumerating them was refused by the tooling
approval gate.

**No cleanup proposal is given, deliberately.** The assignment warns against
assuming every matching record is disposable and against inferring a
replacement postcode, and I cannot identify target IDs, row counts or cascade
effects without seeing the rows. Producing SQL against records I have not
inspected would be exactly the wrong deliverable.

Read-only queries for the owner, or for a later batch once the gate allows:

```sql
-- 5a. Enumerate candidate QA records, with their dependants.
select 'customers' as tbl, c.id::text, c.name, c.email, c.created_at,
       (select count(*) from public.ns_jobs j where j.customer_id = c.id) as jobs
from public.customers c
where c.name ilike '%NS-QA-TEST%' or c.email ilike '%NS-QA-TEST%'
union all
select 'ns_jobs', j.id::text, j.reference, j.status, j.created_at,
       (select count(*) from public.ns_quotes q where q.job_id = j.id)
from public.ns_jobs j
where j.reference ilike '%NS-QA-TEST%'
union all
select 'properties', p.id::text, p.address_line1,
       coalesce(p.city,'') || ' / ' || coalesce(p.postal_code,''), p.created_at,
       (select count(*) from public.ns_jobs j where j.property_id = p.id)
from public.properties p
where p.address_line1 ilike '%NS-QA-TEST%';

-- 5b. The postcode anomaly. Look, do not assume a replacement:
--     L6Y 3W6 is a Brampton forward sortation area; the property is
--     recorded in Sault Ste. Marie (P6A...). Which field is wrong is a
--     business question, not an inference.
select id, address_line1, city, province, postal_code, created_at
from public.properties
where postal_code = 'L6Y 3W6' or city ilike '%Sault%';

-- 5c. Cascade shape before deleting anything.
select conrelid::regclass as child, confrelid::regclass as parent,
       conname, confdeltype
from pg_constraint
where contype = 'f'
  and confrelid in ('public.customers'::regclass,
                    'public.properties'::regclass,
                    'public.ns_jobs'::regclass);
```

No customer information is reproduced in this repository.

---

## Live actions awaiting approval

None of these has been performed. Each is reversible except where noted.

| # | Action | SQL | Verification |
|---|---|---|---|
| 1 | Apply the content freeze | `supabase/migrations/20261009160000_batch5_freeze_customer_facing_content_once_sent.sql` | `select count(*) from pg_trigger where tgname='ns_quotes_customer_content_draft_only'` → 1 |
| 2 | Harden the two RPC grants | `…/20261010090000_batch7_1_tighten_remaining_admin_rpc_grants.sql` | `has_function_privilege('anon','public.calculate_job_pricing(uuid,uuid[])','EXECUTE')` → false |
| 3 | Revoke anon writes on legacy tables | `…/20261010091000_batch7_1_revoke_anon_writes_on_legacy_tables.sql` | `has_table_privilege('anon','public.job_requests','INSERT')` → false |
| 4 | Identify the legacy inbound FK | query in §3 | read-only |
| 5 | Investigate QA rows / postcode | queries in §5 | read-only |

Applying 1–3 through `apply_migration` will record versions from the apply
time, not the filenames. **Rename the files to match afterwards**, or the
drift documented in §4a returns immediately.

Not proposed, and needing a business decision first: retiring the legacy
tables (§3), and any data cleanup (§5).
