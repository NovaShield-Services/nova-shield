-- Batch 8.1: materials inventory for the lighting services, bulk purchasing,
-- and Christmas rental-set tracking.
--
-- WHY THIS EXISTS
--
-- Before this migration the schema knew what a lighting job SELLS
-- (services, pricing_rules.rate, job_measurements.quantity) and nothing at
-- all about what it CONSUMES. Verified live before writing: there is no
-- materials table, no stock level, no supplier, no purchase order, no link
-- from a measurement to a part, and no cost basis anywhere --
-- pricing_rules.rate is a sell price only. So the business could quote
-- 180 linear feet of permanent lighting without the app being able to say
-- whether 180 feet of track was on the shelf.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- 1. NO CATALOGUE ROWS. The supplier the owner named --
--    https://permanentlightingdirect.ca/diy-kits -- is unreachable from the
--    environment this migration was authored in (DNS failure, then the
--    outbound proxy answered 403 to CONNECT). Part names, SKUs, pack sizes
--    and costs are therefore NOT seeded, because inventing them would put
--    numbers in the database that nobody has ever verified and that would
--    then flow into shortfall maths and purchase orders. The one supplier
--    row below carries only what the owner actually supplied: a name and
--    that URL. Everything else is populated from the admin screen.
--
-- 2. NO MONEY IN THE QUOTE PATH. ns_materials.unit_cost is a COST basis for
--    purchasing and margin review. Nothing in this migration touches
--    calculate_job_pricing, quote_line_items or any customer-facing total.
--    Pricing calculations stay in the existing backend RPCs, unchanged.
--
-- 3. NO MUTABLE on_hand COLUMN. Stock is an append-only ledger
--    (ns_material_stock_moves) summed by a view. A single counter would be
--    cheaper to read and impossible to explain: when the shelf and the app
--    disagree, the question is always "what moved?", which a counter cannot
--    answer and a ledger answers by construction. It also makes a wrong
--    receipt correctable by posting its reverse rather than by overwriting
--    history, which is the same reasoning that keeps pricing_rules
--    effective-dated rather than edited in place.
--
-- SECURITY
--
-- Every table here is admin-only. RLS is enabled with the single `admin_all`
-- policy shape already used across this schema (ALL commands, role
-- authenticated, USING and WITH CHECK both is_admin()), and anon/PUBLIC are
-- revoked explicitly rather than merely left ungranted -- the Batch 7.1
-- finding was that a privilege can arrive three ways (direct, PUBLIC,
-- inherited), so new tables start from an explicit revoke.
--
-- None of this is customer-facing: no policy grants anon any access, and
-- nothing here is read by the public quote page.

/* ===================================================================== */
/* suppliers                                                             */
/* ===================================================================== */

create table if not exists public.ns_suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  website     text,
  account_ref text,
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ns_suppliers_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists ns_suppliers_name_key
  on public.ns_suppliers (lower(btrim(name)));

/* The only seeded row in this migration, and the only one the owner
   supplied real values for. ON CONFLICT DO NOTHING so a re-run, or a row
   the owner has since edited, is left alone. */
insert into public.ns_suppliers (name, website, notes)
values ('Permanent Lighting Direct',
        'https://permanentlightingdirect.ca/diy-kits',
        'Primary parts source for permanent lighting; bulk ordering. '
        'Catalogue not imported -- the site was unreachable when this '
        'migration was written, so parts are entered from the admin screen.')
on conflict do nothing;

/* ===================================================================== */
/* materials catalogue                                                   */
/* ===================================================================== */

create table if not exists public.ns_materials (
  id             uuid primary key default gen_random_uuid(),
  sku            text,
  name           text not null,
  category       text not null,
  unit           text not null,
  supplier_id    uuid references public.ns_suppliers(id) on delete set null,

  -- How many `unit` come in one purchasable pack. A 150 ft roll of track is
  -- unit='linear_ft', pack_quantity=150: the shelf is counted in feet, the
  -- purchase order is placed in rolls, and neither number has to be
  -- re-derived by hand at the point of use.
  pack_quantity  numeric not null default 1,
  pack_label     text,

  unit_cost      numeric,
  currency       text not null default 'CAD',

  reorder_point  numeric not null default 0,
  reorder_qty    numeric not null default 0,

  active         boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint ns_materials_name_not_blank check (btrim(name) <> ''),
  constraint ns_materials_category_known check (category in (
    'track', 'light', 'controller', 'power_supply', 'connector',
    'clip', 'wire', 'rental_set', 'consumable', 'tool', 'other')),
  constraint ns_materials_unit_known check (unit in (
    'each', 'linear_ft', 'box', 'roll', 'kit', 'set')),
  constraint ns_materials_pack_positive  check (pack_quantity > 0),
  constraint ns_materials_cost_nonneg    check (unit_cost is null or unit_cost >= 0),
  constraint ns_materials_reorder_nonneg check (reorder_point >= 0 and reorder_qty >= 0)
);

/* A SKU is unique within a supplier, and within the "no supplier" bucket.
   coalesce rather than a plain two-column unique constraint because NULL is
   never equal to NULL, so (null, 'ABC-1') twice would otherwise both be
   allowed -- which is exactly the duplicate this index exists to stop. */
create unique index if not exists ns_materials_supplier_sku_key
  on public.ns_materials (
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(sku)))
  where sku is not null and btrim(sku) <> '';

create index if not exists ns_materials_active_idx
  on public.ns_materials (active, category, name);

/* ===================================================================== */
/* purchase orders (bulk ordering)                                       */
/* ===================================================================== */

create table if not exists public.ns_purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references public.ns_suppliers(id) on delete restrict,
  reference    text,
  status       text not null default 'draft',
  ordered_at   timestamptz,
  expected_at  timestamptz,
  received_at  timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),

  constraint ns_purchase_orders_status_known check (status in (
    'draft', 'ordered', 'partial', 'received', 'cancelled')),

  -- A PO that claims to be ordered has to say when. Keeps "ordered" from
  -- meaning two different things depending on which screen filled it in.
  constraint ns_purchase_orders_ordered_has_date check (
    status in ('draft', 'cancelled') or ordered_at is not null)
);

create index if not exists ns_purchase_orders_status_idx
  on public.ns_purchase_orders (status, coalesce(ordered_at, created_at) desc);

create table if not exists public.ns_purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.ns_purchase_orders(id) on delete cascade,
  material_id       uuid not null references public.ns_materials(id) on delete restrict,

  -- Counted in PACKS, the thing actually ordered. The stock ledger converts
  -- to `unit` on receipt via ns_materials.pack_quantity, so the conversion
  -- happens in exactly one place.
  packs_ordered     numeric not null,
  packs_received    numeric not null default 0,
  unit_cost         numeric,
  note              text,
  sort_order        integer not null default 0,

  constraint ns_po_lines_ordered_positive check (packs_ordered > 0),
  constraint ns_po_lines_received_nonneg  check (packs_received >= 0),
  constraint ns_po_lines_cost_nonneg      check (unit_cost is null or unit_cost >= 0),
  constraint ns_po_lines_one_per_material unique (purchase_order_id, material_id)
);

create index if not exists ns_po_lines_material_idx
  on public.ns_purchase_order_lines (material_id);

/* ===================================================================== */
/* Christmas rental sets                                                 */
/* ===================================================================== */

-- Christmas lighting is a RENTAL model (app_settings.lighting ->>
-- 'christmas_ownership_model' = 'rental', storage included), which makes a
-- set a tracked physical asset with a location and a season, not a
-- consumable quantity. That is why it is its own table rather than a
-- material with a stock count: a count cannot answer "where is the
-- Patterson set and what condition did it come back in?".

create table if not exists public.ns_rental_sets (
  id               uuid primary key default gen_random_uuid(),
  set_code         text not null,
  material_id      uuid references public.ns_materials(id) on delete set null,
  customer_id      uuid references public.customers(id) on delete restrict,
  property_id      uuid references public.properties(id) on delete set null,
  status           text not null default 'in_storage',
  linear_ft        numeric,
  season_year      integer,
  storage_location text,
  condition_note   text,
  installed_at     timestamptz,
  removed_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint ns_rental_sets_code_not_blank check (btrim(set_code) <> ''),
  constraint ns_rental_sets_status_known check (status in (
    'in_storage', 'assigned', 'installed', 'in_repair', 'retired', 'lost')),
  constraint ns_rental_sets_linear_ft_positive check (linear_ft is null or linear_ft > 0),
  constraint ns_rental_sets_season_sane check (
    season_year is null or season_year between 2000 and 2100),

  -- A set cannot be out at a customer's house without a customer. Without
  -- this, "installed" with a null customer_id reads as installed nowhere,
  -- and the set silently stops being findable at removal time.
  constraint ns_rental_sets_placed_has_customer check (
    status not in ('assigned', 'installed') or customer_id is not null),

  constraint ns_rental_sets_installed_has_date check (
    status <> 'installed' or installed_at is not null)
);

create unique index if not exists ns_rental_sets_code_key
  on public.ns_rental_sets (lower(btrim(set_code)));

create index if not exists ns_rental_sets_status_idx
  on public.ns_rental_sets (status, season_year desc);

create index if not exists ns_rental_sets_customer_idx
  on public.ns_rental_sets (customer_id)
  where customer_id is not null;

/* Append-only lifecycle log. Same reasoning as the stock ledger: the
   current status answers "where is it now", and only an event log answers
   "how did it get there", which is what a damage dispute or a missing set
   actually turns on. */
create table if not exists public.ns_rental_set_events (
  id             uuid primary key default gen_random_uuid(),
  rental_set_id  uuid not null references public.ns_rental_sets(id) on delete cascade,
  event          text not null,
  job_id         uuid references public.ns_jobs(id) on delete set null,
  customer_id    uuid references public.customers(id) on delete set null,
  occurred_at    timestamptz not null default now(),
  note           text,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),

  constraint ns_rental_set_events_known check (event in (
    'received', 'assigned', 'unassigned', 'installed', 'removed',
    'stored', 'repaired', 'retired', 'lost', 'inspected'))
);

create index if not exists ns_rental_set_events_set_idx
  on public.ns_rental_set_events (rental_set_id, occurred_at desc);

/* ===================================================================== */
/* stock ledger                                                          */
/* ===================================================================== */

create table if not exists public.ns_material_stock_moves (
  id                uuid primary key default gen_random_uuid(),
  material_id       uuid not null references public.ns_materials(id) on delete restrict,

  -- In `unit`, signed. Positive adds to the shelf, negative takes off it.
  delta             numeric not null,
  reason            text not null,

  job_id            uuid references public.ns_jobs(id) on delete set null,
  purchase_order_id uuid references public.ns_purchase_orders(id) on delete set null,
  rental_set_id     uuid references public.ns_rental_sets(id) on delete set null,
  note              text,
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),

  constraint ns_stock_moves_delta_nonzero check (delta <> 0),
  constraint ns_stock_moves_reason_known check (reason in (
    'received', 'consumed', 'returned', 'damaged', 'adjustment', 'opening')),

  -- The sign has to agree with the reason. A "received" posted negative, or
  -- a "consumed" posted positive, is a data-entry slip that would otherwise
  -- read as a legitimate movement and quietly corrupt the on-hand figure.
  -- 'adjustment' is the deliberate escape hatch and may go either way.
  constraint ns_stock_moves_sign_matches_reason check (
    case reason
      when 'received' then delta > 0
      when 'returned' then delta > 0
      when 'opening'  then delta > 0
      when 'consumed' then delta < 0
      when 'damaged'  then delta < 0
      else true
    end)
);

create index if not exists ns_stock_moves_material_idx
  on public.ns_material_stock_moves (material_id, occurred_at desc);

create index if not exists ns_stock_moves_job_idx
  on public.ns_material_stock_moves (job_id)
  where job_id is not null;

/* On-hand, derived. A LEFT JOIN so a catalogue row with no movements yet
   reads as 0 rather than disappearing -- a part that has never been
   received is precisely the one a shortfall report must still mention. */
create or replace view public.ns_material_stock as
select m.id            as material_id,
       m.sku,
       m.name,
       m.category,
       m.unit,
       m.supplier_id,
       m.pack_quantity,
       m.unit_cost,
       m.currency,
       m.reorder_point,
       m.reorder_qty,
       m.active,
       coalesce(sum(mv.delta), 0)                  as on_hand,
       coalesce(sum(mv.delta) filter (
         where mv.reason = 'consumed'), 0)         as consumed_total,
       max(mv.occurred_at)                         as last_move_at,
       (coalesce(sum(mv.delta), 0) <= m.reorder_point) as needs_reorder
  from public.ns_materials m
  left join public.ns_material_stock_moves mv on mv.material_id = m.id
 group by m.id;

/* ===================================================================== */
/* service -> material requirement mapping                               */
/* ===================================================================== */

-- This is what lets a materials requirement be DERIVED from the
-- measurements the field already captures, instead of asking anyone to
-- type the job's parts a second time. One row says "permanent_lighting
-- consumes 1 ft of track per linear ft measured, plus 8% waste".

create table if not exists public.ns_service_material_usage (
  id                uuid primary key default gen_random_uuid(),
  service_id        uuid not null references public.services(id) on delete restrict,
  material_id       uuid not null references public.ns_materials(id) on delete restrict,

  -- In material `unit` per one measured service unit.
  quantity_per_unit numeric not null,

  -- 0.08 = 8% extra for cuts and offcuts. Capped at 1.0 (100% extra): a
  -- larger figure is a typo far more often than a real allowance, and an
  -- unbounded multiplier here would silently inflate every purchase order.
  waste_factor      numeric not null default 0,

  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint ns_usage_quantity_positive check (quantity_per_unit > 0),
  constraint ns_usage_waste_in_range    check (waste_factor >= 0 and waste_factor <= 1),
  constraint ns_usage_one_per_pair      unique (service_id, material_id)
);

create index if not exists ns_usage_service_idx
  on public.ns_service_material_usage (service_id);

/* ===================================================================== */
/* updated_at                                                            */
/* ===================================================================== */

create or replace function public.ns_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ns_suppliers', 'ns_materials', 'ns_purchase_orders',
    'ns_rental_sets', 'ns_service_material_usage'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I', 'touch_' || t, t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.ns_touch_updated_at()',
      'touch_' || t, t);
  end loop;
end
$$;

/* ===================================================================== */
/* RLS + grants                                                          */
/* ===================================================================== */

do $$
declare
  t text;
begin
  foreach t in array array[
    'ns_suppliers', 'ns_materials', 'ns_purchase_orders',
    'ns_purchase_order_lines', 'ns_rental_sets', 'ns_rental_set_events',
    'ns_material_stock_moves', 'ns_service_material_usage'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    -- ENABLE, not FORCE. Checked live: all 31 existing RLS tables in this
    -- schema are enable-only, none forced. FORCE would also apply the
    -- policy to the table OWNER, which is the role migrations run as, so a
    -- future maintenance statement would be blocked by is_admin() being
    -- false for postgres. service_role carries BYPASSRLS (verified live),
    -- so the server-side path is unaffected either way.
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format(
      'create policy admin_all on public.%I
         for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);

    -- Explicit revoke before any grant: Batch 7.1 established that a
    -- privilege can be held directly, through PUBLIC, or inherited, and
    -- that "we never granted it" is not the same as "nobody has it".
    execute format('revoke all on public.%I from public', t);
    execute format('revoke all on public.%I from anon', t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end
$$;

/* The view is security_invoker so it is read under the caller's own
   policies rather than the view owner's. Without this, a view over
   RLS-protected tables hands out every row to anyone who can select the
   view, regardless of the admin_all policy underneath. Requires
   PostgreSQL 15+; this project reports 17.6 (checked live before writing). */
alter view public.ns_material_stock set (security_invoker = on);

revoke all on public.ns_material_stock from public;
revoke all on public.ns_material_stock from anon;
grant select on public.ns_material_stock to authenticated;
grant select on public.ns_material_stock to service_role;

comment on table public.ns_materials is
  'Parts catalogue. Populated from the admin Inventory screen; no rows are '
  'seeded by migration because the supplier catalogue has never been read '
  'by this application.';

comment on table public.ns_material_stock_moves is
  'Append-only stock ledger. On-hand is the sum of delta, exposed by the '
  'ns_material_stock view. Correct a mistake by posting its reverse, not by '
  'editing or deleting a row.';

comment on table public.ns_rental_sets is
  'Christmas lighting rental sets as tracked physical assets (rental '
  'ownership model, storage included). Lifecycle history lives in '
  'ns_rental_set_events.';
