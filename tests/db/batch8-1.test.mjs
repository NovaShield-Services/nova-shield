// Batch 8.1 -- executable database tests for the inventory, purchasing and
// Christmas rental-set migrations, run against a DEDICATED DISPOSABLE
// DATABASE.
//
//   node tests/db/setup-test-db.mjs        # once, creates + stamps the DB
//   node tests/db/batch8-1.test.mjs
//
// Needs the `pg` devDependency (already in package.json) -- run `npm install`
// if node_modules is absent. Override the target with PGURL; the guards in
// disposable.mjs will refuse anything that is not the dedicated local
// database, and they do so by pure string inspection before any connection
// is attempted.
//
// Scope and honesty:
//   * passing proves the migrations are valid SQL against PostgreSQL, that
//     each constraint rejects what its comment claims, that the on-hand view
//     and estimate_job_materials compute what they claim, and that anon is
//     shut out of the new objects through all three privilege routes.
//   * it does NOT prove anything about the live database. NEITHER BATCH 8.1
//     MIGRATION HAS BEEN APPLIED TO PRODUCTION.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import {
  TEST_DB_NAME, assertDisposableTarget, assertDisposableDatabase
} from './disposable.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const MIGRATIONS = join(REPO, 'supabase', 'migrations');

const PGURL = process.env.PGURL
  || `postgresql://postgres@/${TEST_DB_NAME}?host=/tmp&port=5433`;

const TABLES_MIGRATION = '20261010120000_batch8_1_inventory_and_rental_sets.sql';
const RPC_MIGRATION    = '20261010121000_batch8_1_estimate_job_materials.sql';
const OPS_MIGRATION    = '20261010130000_batch8_1_stock_operations_contract_v1.sql';
const migration = (file) => readFileSync(join(MIGRATIONS, file), 'utf8');

const results = [];
async function record(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (err) { results.push({ name, ok: false, err: err && err.message }); }
}

/** Runs `fn`, returns the error if it raised, else null. */
async function errorOf(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

(async () => {
  assertDisposableTarget(PGURL);
  const client = new pg.Client({ connectionString: PGURL });
  await client.connect();
  await assertDisposableDatabase(client);   // marker check, before any DDL

  const one = async (sql, params) => (await client.query(sql, params)).rows[0];
  const all = async (sql, params) => (await client.query(sql, params)).rows;

  /* The new tables are the ones under test, so drop them FIRST and let the
     migration be what creates them. Without this, a second run would be
     testing last run's tables plus whatever the migration's
     `create table if not exists` decided to skip -- which is exactly the
     stale-state trap the Batch 7.1 fixture hit with CREATE OR REPLACE
     preserving grants. */
  await client.query(`
    drop view  if exists public.ns_material_stock cascade;
    drop table if exists public.ns_material_stock_moves cascade;
    drop table if exists public.ns_service_material_usage cascade;
    drop table if exists public.ns_purchase_order_lines cascade;
    drop table if exists public.ns_purchase_orders cascade;
    drop table if exists public.ns_rental_set_events cascade;
    drop table if exists public.ns_rental_sets cascade;
    drop table if exists public.ns_materials cascade;
    drop table if exists public.ns_suppliers cascade;
    drop table if exists public.ns_stock_operations cascade;
    drop table if exists public.ns_stock_locations cascade;
    drop view  if exists public.ns_material_stock_by_location cascade;
    drop function if exists public.estimate_job_materials(uuid, text);
    drop function if exists public.estimate_job_materials(uuid);
    drop function if exists public.post_stock_movement(text,uuid,text,numeric,text,text,uuid,uuid,text);
    drop function if exists public.post_stock_transfer(text,uuid,numeric,text,text,boolean,text,uuid);
    drop function if exists public.ns_operation_result(uuid,boolean);
    drop function if exists public.ns_location_by_code(text);
    drop function if exists public.ns_touch_updated_at() cascade;
    drop function if exists public.ns_guard_transfer_conserves() cascade;
    drop function if exists public.ns_guard_operation_vehicle() cascade;
  `);

  await client.query(readFileSync(join(HERE, 'fixture-schema-batch8-1.sql'), 'utf8'));

  /* The contract RPCs are admin-only, and the fixture's is_admin() reads a
     session GUC. Set it once for the whole run; the handful of cases that
     are ABOUT the guard flip it off and back on themselves. Without this,
     every post_stock_movement call fails with 42501 and the failures
     cascade into every later case that expected the stock to be there. */
  await client.query(`select set_config('nova.is_admin','on',false)`);

  // ================================================== A. the migrations ====
  await record('A1 the tables migration applies cleanly', async () => {
    await client.query(migration(TABLES_MIGRATION));
  });

  await record('A2 the RPC migration applies cleanly', async () => {
    await client.query(migration(RPC_MIGRATION));
  });

  await record('A2b the operations-contract migration applies cleanly', async () => {
    await client.query(migration(OPS_MIGRATION));
  });

  await record('A3 all migrations are re-runnable without error or duplicate rows', async () => {
    await client.query(migration(TABLES_MIGRATION));
    await client.query(migration(RPC_MIGRATION));
    await client.query(migration(OPS_MIGRATION));
    const { n } = await one(
      `select count(*)::int as n from public.ns_suppliers
        where website = 'https://permanentlightingdirect.ca/diy-kits'`);
    assert.equal(n, 1, 'the seeded supplier must not be inserted twice');
  });

  await record('A4 no catalogue rows are seeded -- the supplier site was never read', async () => {
    const { n } = await one('select count(*)::int as n from public.ns_materials');
    assert.equal(n, 0,
      'part names, SKUs and prices must come from the admin screen, not from this migration');
  });

  await record('A5 exactly one supplier is seeded, carrying only owner-supplied values', async () => {
    const rows = await all('select name, website from public.ns_suppliers');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Permanent Lighting Direct');
    assert.equal(rows[0].website, 'https://permanentlightingdirect.ca/diy-kits');
  });

  // ---- a small catalogue the TESTS own, so no fixture value is mistaken
  // ---- for a real part. These names are deliberately not plausible SKUs.
  const supplierId = (await one('select id from public.ns_suppliers limit 1')).id;

  const newMaterial = async (over = {}) => {
    const m = {
      sku: null, name: 'FIXTURE part', category: 'track', unit: 'linear_ft',
      supplier_id: supplierId, pack_quantity: 1, unit_cost: null,
      reorder_point: 0, reorder_qty: 0, ...over
    };
    return (await one(
      `insert into public.ns_materials
         (sku,name,category,unit,supplier_id,pack_quantity,unit_cost,reorder_point,reorder_qty)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [m.sku, m.name, m.category, m.unit, m.supplier_id, m.pack_quantity,
       m.unit_cost, m.reorder_point, m.reorder_qty])).id;
  };

  // ============================================ B. catalogue constraints ===
  await record('B1 a blank material name is refused', async () => {
    const err = await errorOf(() => newMaterial({ name: '   ' }));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('B2 an unknown category is refused', async () => {
    const err = await errorOf(() => newMaterial({ category: 'sprockets' }));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('B3 an unknown unit is refused', async () => {
    const err = await errorOf(() => newMaterial({ unit: 'furlong' }));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('B4 pack_quantity of 0 is refused (it is a divisor in the pack maths)', async () => {
    const err = await errorOf(() => newMaterial({ pack_quantity: 0 }));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('B5 a negative unit_cost is refused, a null one is allowed', async () => {
    const err = await errorOf(() => newMaterial({ unit_cost: -1 }));
    assert.ok(err); assert.equal(err.code, '23514');
    await newMaterial({ name: 'FIXTURE unpriced', unit_cost: null });
  });

  await record('B6 the same SKU twice under ONE supplier is refused', async () => {
    await newMaterial({ sku: 'FIXTURE-SKU-1', name: 'FIXTURE sku a' });
    const err = await errorOf(() =>
      newMaterial({ sku: 'FIXTURE-SKU-1', name: 'FIXTURE sku a again' }));
    assert.ok(err); assert.equal(err.code, '23505');
  });

  await record('B7 the SKU match is case- and whitespace-insensitive', async () => {
    const err = await errorOf(() =>
      newMaterial({ sku: '  fixture-sku-1 ', name: 'FIXTURE sku a padded' }));
    assert.ok(err); assert.equal(err.code, '23505');
  });

  await record('B8 the SAME SKU under a DIFFERENT supplier is allowed', async () => {
    const other = (await one(
      `insert into public.ns_suppliers (name) values ('FIXTURE second supplier')
       returning id`)).id;
    await newMaterial({ sku: 'FIXTURE-SKU-1', name: 'FIXTURE sku a elsewhere',
                        supplier_id: other });
  });

  await record('B9 two supplier-less rows cannot share a SKU (the coalesce in the index)', async () => {
    // This is the case a plain `unique (supplier_id, sku)` would have let
    // through, because NULL is never equal to NULL.
    await newMaterial({ sku: 'FIXTURE-ORPHAN', name: 'FIXTURE orphan a', supplier_id: null });
    const err = await errorOf(() =>
      newMaterial({ sku: 'FIXTURE-ORPHAN', name: 'FIXTURE orphan b', supplier_id: null }));
    assert.ok(err, 'a duplicate SKU in the no-supplier bucket must still be refused');
    assert.equal(err.code, '23505');
  });

  await record('B10 a null SKU may repeat freely', async () => {
    await newMaterial({ sku: null, name: 'FIXTURE no sku a' });
    await newMaterial({ sku: null, name: 'FIXTURE no sku b' });
  });

  // =============================================== C. the stock ledger =====
  const trackId = await newMaterial({
    name: 'FIXTURE track', category: 'track', unit: 'linear_ft',
    pack_quantity: 150, unit_cost: 2, reorder_point: 100, reorder_qty: 2
  });
  const wireId = await newMaterial({
    name: 'FIXTURE wire', category: 'wire', unit: 'linear_ft',
    pack_quantity: 500, unit_cost: 0.5, reorder_point: 0
  });

  /* Every movement goes through the contract now -- direct INSERT on the
     ledger is revoked, which test I1b proves. `delta` is still written as a
     signed number here because the sign/reason agreement is what several
     cases below are about; post_stock_movement takes a magnitude plus a
     reason and derives the sign itself, so a negative is passed as
     abs()+reason except for 'adjustment', which keeps its sign. */
  let opSeq = 0;
  const move = async (materialId, delta, reason, extra = {}) => {
    const { rows } = await client.query(
      `select public.post_stock_movement($1,$2,$3,$4,$5,$6,$7,null,null) as r`,
      [extra.clientOpId ?? `fixture-op-${++opSeq}`, materialId,
       extra.location ?? 'base', delta, reason,
       extra.note ?? null, extra.jobId ?? null]);
    return rows[0].r;
  };

  /* A direct ledger insert, for the cases that are specifically about the
     table's own constraints rather than about the contract. Run as the
     table owner, which is the only role that still can. */
  const rawMove = async (materialId, delta, reason, extra = {}) => {
    const op = (await one(
      `insert into public.ns_stock_operations (client_operation_id, kind, confirmed_physical)
       values ($1, $2, true) returning id`,
      [extra.clientOpId ?? `fixture-raw-${++opSeq}`, extra.kind ?? 'correction'])).id;
    return client.query(
      `insert into public.ns_material_stock_moves
         (material_id, location_id, operation_id, delta, reason, job_id, note)
       values ($1, public.ns_location_by_code($2), $3, $4, $5, $6, $7)`,
      [materialId, extra.location ?? 'base', op, delta, reason,
       extra.jobId ?? null, extra.note ?? null]);
  };

  await record('C1 a zero-delta movement is refused', async () => {
    const err = await errorOf(() => rawMove(trackId, 0, 'adjustment'));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('C2 an unknown reason is refused', async () => {
    const err = await errorOf(() => rawMove(trackId, 5, 'borrowed'));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('C3 a NEGATIVE "received" is refused at the TABLE level, under the contract', async () => {
    const err = await errorOf(() => rawMove(trackId, -10, 'received'));
    assert.ok(err, 'a mistyped sign on a receipt would otherwise read as a legitimate movement');
    assert.equal(err.code, '23514');
  });

  await record('C4 a POSITIVE "consumed" is refused', async () => {
    const err = await errorOf(() => rawMove(trackId, 10, 'consumed'));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('C5 a POSITIVE "damaged" is refused', async () => {
    const err = await errorOf(() => rawMove(trackId, 3, 'damaged'));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('C6 "adjustment" is the deliberate escape hatch and goes either way', async () => {
    await move(trackId, 7, 'adjustment');
    await move(trackId, -7, 'adjustment');
  });

  await record('C6b the contract derives the sign, so a positive "consumed" cannot be posted', async () => {
    // Its own material: a case that changes a balance must not quietly
    // change the arithmetic of a later one that shares the part.
    const id = await newMaterial({ name: 'FIXTURE sign derivation' });
    await move(id, 30, 'received');
    // A caller passing +10 with reason 'consumed' gets -10, not an error and
    // not +10: the magnitude is the caller's, the direction is the reason's.
    await move(id, 10, 'consumed');
    const { on_hand } = await one(
      'select on_hand from public.ns_material_stock where material_id=$1', [id]);
    assert.equal(Number(on_hand), 20);
  });

  await record('C7 on_hand is the signed sum of the ledger', async () => {
    await move(trackId, 300, 'received');
    await move(trackId, -40, 'consumed');
    await move(trackId, -10, 'damaged');
    const row = await one(
      'select on_hand, consumed_total from public.ns_material_stock where material_id=$1',
      [trackId]);
    assert.equal(Number(row.on_hand), 250, '300 - 40 - 10');
    assert.equal(Number(row.consumed_total), -40,
      'consumed_total counts only the consumed rows, not the damaged one');
  });

  await record('C8 a material with NO movements reads as 0 rather than disappearing', async () => {
    const id = await newMaterial({ name: 'FIXTURE never received' });
    const row = await one(
      'select on_hand, needs_reorder from public.ns_material_stock where material_id=$1', [id]);
    assert.ok(row, 'a part that has never been received is exactly the one a shortfall report needs');
    assert.equal(Number(row.on_hand), 0);
    assert.equal(row.needs_reorder, true, 'on_hand 0 <= reorder_point 0');
  });

  await record('C9 needs_reorder trips AT the reorder point, not only below it', async () => {
    const id = await newMaterial({ name: 'FIXTURE at the line', reorder_point: 50 });
    await move(id, 50, 'received');
    const atLine = await one(
      'select on_hand, needs_reorder from public.ns_material_stock where material_id=$1', [id]);
    assert.equal(Number(atLine.on_hand), 50);
    assert.equal(atLine.needs_reorder, true);
    await move(id, 1, 'received');
    const above = await one(
      'select needs_reorder from public.ns_material_stock where material_id=$1', [id]);
    assert.equal(above.needs_reorder, false);
  });

  await record('C10 deleting a material that has movements is refused, not cascaded', async () => {
    const err = await errorOf(() =>
      client.query('delete from public.ns_materials where id=$1', [trackId]));
    assert.ok(err, 'losing the ledger would make every past on-hand figure unexplainable');
    assert.equal(err.code, '23503');
  });

  // ============================================== D. purchase orders =======
  await record('D1 an "ordered" PO must carry ordered_at', async () => {
    const err = await errorOf(() => client.query(
      `insert into public.ns_purchase_orders (supplier_id, status) values ($1,'ordered')`,
      [supplierId]));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('D2 a draft PO needs no dates', async () => {
    await client.query(
      `insert into public.ns_purchase_orders (supplier_id) values ($1)`, [supplierId]);
  });

  const poId = (await one(
    `insert into public.ns_purchase_orders (supplier_id, status, ordered_at, reference)
     values ($1,'ordered',now(),'FIXTURE-PO-1') returning id`, [supplierId])).id;

  await record('D3 a PO line must order a positive number of packs', async () => {
    const err = await errorOf(() => client.query(
      `insert into public.ns_purchase_order_lines (purchase_order_id, material_id, packs_ordered)
       values ($1,$2,0)`, [poId, trackId]));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('D4 a material appears at most once per PO', async () => {
    await client.query(
      `insert into public.ns_purchase_order_lines (purchase_order_id, material_id, packs_ordered)
       values ($1,$2,2)`, [poId, trackId]);
    const err = await errorOf(() => client.query(
      `insert into public.ns_purchase_order_lines (purchase_order_id, material_id, packs_ordered)
       values ($1,$2,1)`, [poId, trackId]));
    assert.ok(err, 'two lines for one part would double-count on receipt');
    assert.equal(err.code, '23505');
  });

  await record('D5 deleting a PO removes its lines but never a material', async () => {
    const tmp = (await one(
      `insert into public.ns_purchase_orders (supplier_id) values ($1) returning id`,
      [supplierId])).id;
    await client.query(
      `insert into public.ns_purchase_order_lines (purchase_order_id, material_id, packs_ordered)
       values ($1,$2,1)`, [tmp, wireId]);
    await client.query('delete from public.ns_purchase_orders where id=$1', [tmp]);
    const { n } = await one(
      'select count(*)::int as n from public.ns_purchase_order_lines where purchase_order_id=$1',
      [tmp]);
    assert.equal(n, 0);
    const { m } = await one('select count(*)::int as m from public.ns_materials where id=$1',
      [wireId]);
    assert.equal(m, 1, 'the catalogue row must survive its purchase order');
  });

  await record('D6 a PO cannot be deleted out from under a stock movement that cites it', async () => {
    // on delete set null, not cascade: the receipt stays on the shelf count
    // even once the paperwork is gone.
    const tmp = (await one(
      `insert into public.ns_purchase_orders (supplier_id) values ($1) returning id`,
      [supplierId])).id;
    await client.query(
      `select public.post_stock_movement($1,$2,'base',10,'received',null,null,$3,null)`,
      ['po-receipt-1', wireId, tmp]);
    await client.query('delete from public.ns_purchase_orders where id=$1', [tmp]);
    const row = await one(
      `select purchase_order_id from public.ns_material_stock_moves
        where material_id=$1 and delta=10 order by created_at desc limit 1`, [wireId]);
    assert.equal(row.purchase_order_id, null);
    const { n } = await one(
      'select on_hand as n from public.ns_material_stock where material_id=$1', [wireId]);
    assert.equal(Number(n), 10, 'the received quantity must not vanish with the PO');
  });

  // ============================================ E. Christmas rental sets ===
  const customerId = (await one(
    `insert into public.customers (name) values ('FIXTURE customer') returning id`)).id;

  await record('E1 a set code is unique, case-insensitively', async () => {
    await client.query(`insert into public.ns_rental_sets (set_code) values ('FIXTURE-SET-1')`);
    const err = await errorOf(() => client.query(
      `insert into public.ns_rental_sets (set_code) values (' fixture-set-1 ')`));
    assert.ok(err); assert.equal(err.code, '23505');
  });

  await record('E2 a set cannot be "assigned" or "installed" without a customer', async () => {
    for (const status of ['assigned', 'installed']) {
      const err = await errorOf(() => client.query(
        `insert into public.ns_rental_sets (set_code, status, installed_at)
         values ($1, $2, now())`, [`FIXTURE-SET-nocust-${status}`, status]));
      assert.ok(err, `${status} with a null customer must be refused`);
      assert.equal(err.code, '23514');
    }
  });

  await record('E3 an "installed" set must say when it went up', async () => {
    const err = await errorOf(() => client.query(
      `insert into public.ns_rental_sets (set_code, status, customer_id)
       values ('FIXTURE-SET-nodate', 'installed', $1)`, [customerId]));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  const setId = (await one(
    `insert into public.ns_rental_sets
       (set_code, status, customer_id, installed_at, linear_ft, season_year, storage_location)
     values ('FIXTURE-SET-2','installed',$1,now(),180,2026,'Bay 3') returning id`,
    [customerId])).id;

  await record('E4 a nonsense season year is refused', async () => {
    const err = await errorOf(() => client.query(
      `update public.ns_rental_sets set season_year = 1899 where id=$1`, [setId]));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('E5 linear_ft must be positive when given', async () => {
    const err = await errorOf(() => client.query(
      `update public.ns_rental_sets set linear_ft = 0 where id=$1`, [setId]));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('E6 an unknown lifecycle event is refused', async () => {
    const err = await errorOf(() => client.query(
      `insert into public.ns_rental_set_events (rental_set_id, event) values ($1,'yeeted')`,
      [setId]));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('E7 the event log follows the set when the set is deleted', async () => {
    const tmp = (await one(
      `insert into public.ns_rental_sets (set_code) values ('FIXTURE-SET-3') returning id`)).id;
    await client.query(
      `insert into public.ns_rental_set_events (rental_set_id, event) values ($1,'received')`,
      [tmp]);
    await client.query('delete from public.ns_rental_sets where id=$1', [tmp]);
    const { n } = await one(
      'select count(*)::int as n from public.ns_rental_set_events where rental_set_id=$1', [tmp]);
    assert.equal(n, 0);
  });

  await record('E8 a customer with a set out cannot be deleted', async () => {
    const err = await errorOf(() =>
      client.query('delete from public.customers where id=$1', [customerId]));
    assert.ok(err, 'deleting the customer would orphan a physical asset that is at their house');
    assert.equal(err.code, '23503');
  });

  // ====================================== F. service -> material mapping ===
  const svc = async (key) => (await one(
    'select id, unit from public.services where key=$1', [key]));
  const perm = await svc('permanent_lighting');
  const jump = await svc('permanent_lighting_jump');
  const xmas = await svc('christmas_lighting');

  const mapUsage = (serviceId, materialId, qtyPerUnit, waste = 0) => client.query(
    `insert into public.ns_service_material_usage
       (service_id, material_id, quantity_per_unit, waste_factor)
     values ($1,$2,$3,$4)`, [serviceId, materialId, qtyPerUnit, waste]);

  await record('F1 quantity_per_unit must be positive', async () => {
    const err = await errorOf(() => mapUsage(perm.id, trackId, 0));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('F2 a waste factor above 100% is refused', async () => {
    const err = await errorOf(() => mapUsage(perm.id, trackId, 1, 1.5));
    assert.ok(err, 'an unbounded multiplier here would silently inflate every purchase order');
    assert.equal(err.code, '23514');
  });

  await record('F3 a negative waste factor is refused', async () => {
    const err = await errorOf(() => mapUsage(perm.id, trackId, 1, -0.1));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('F4 one mapping per (service, material) pair', async () => {
    await mapUsage(perm.id, trackId, 1, 0.08);
    const err = await errorOf(() => mapUsage(perm.id, trackId, 2));
    assert.ok(err); assert.equal(err.code, '23505');
  });

  // ==================================== G. estimate_job_materials, maths ===
  const jobId = (await one(
    `insert into public.ns_jobs (customer_id, status) values ($1,'draft') returning id`,
    [customerId])).id;

  const measure = (serviceId, quantity, over = {}) => client.query(
    `insert into public.job_measurements (job_id, service_id, quantity, unit, label, review_required)
     values ($1,$2,$3,$4,$5,$6)`,
    [jobId, serviceId, quantity, over.unit ?? 'linear_ft',
     over.label ?? 'FIXTURE run', over.reviewRequired ?? false]);

  const estimate = async (id = jobId, basis = null) => (await one(
    'select public.estimate_job_materials($1,$2) as r', [id, basis])).r;

  await record('G1 non-admins are refused', async () => {
    await client.query(`select set_config('nova.is_admin','off',false)`);
    const err = await errorOf(() => estimate());
    assert.ok(err);
    assert.equal(err.code, '42501', 'insufficient_privilege');
    await client.query(`select set_config('nova.is_admin','on',false)`);
  });

  await record('G2 an unknown job is a clear error, not an empty answer', async () => {
    const err = await errorOf(() =>
      estimate('00000000-0000-0000-0000-000000000000'));
    assert.ok(err);
    // `no_data_found` is a PL/pgSQL condition, SQLSTATE P0002 -- NOT the SQL
    // standard's 02000 (`no_data`). Pinned to the code the server actually
    // reports, because that is the one a client has to branch on. Same
    // condition name the Batch 2/4/5 RPCs already raise for a missing row.
    assert.equal(err.code, 'P0002', 'no_data_found');
  });

  await record('G3 a job with no measurements returns empty lists, not null', async () => {
    const r = await estimate();
    assert.deepEqual(r.lines, []);
    assert.deepEqual(r.unmapped_services, []);
    assert.equal(r.job_id, jobId);
  });

  await record('G4 the waste factor is applied: 200 ft x 1.00 x 1.08 = 216', async () => {
    await measure(perm.id, 120);
    await measure(perm.id, 80);
    const r = await estimate();
    assert.equal(r.lines.length, 1);
    assert.equal(Number(r.lines[0].required), 216);
    assert.equal(r.lines[0].name, 'FIXTURE track');
  });

  await record('G5 zero-quantity measurements are excluded', async () => {
    await measure(perm.id, 0, { label: 'FIXTURE empty placeholder' });
    const r = await estimate();
    assert.equal(Number(r.lines[0].required), 216, 'an empty placeholder run is not a requirement');
  });

  await record('G6 one material consumed by TWO services is rolled up once', async () => {
    await mapUsage(jump.id, wireId, 1);
    await mapUsage(perm.id, wireId, 0.5);     // parent also draws on wire
    await measure(jump.id, 60);
    const r = await estimate();
    const wire = r.lines.find((l) => l.name === 'FIXTURE wire');
    assert.ok(wire, 'wire must appear');
    // jump: 60 x 1 = 60 ; permanent: 200 x 0.5 = 100 ; total 160
    assert.equal(Number(wire.required), 160);
    assert.equal(wire.from_services.length, 2,
      'and must show BOTH services it came from, so the number can be checked');
    assert.equal(r.lines.filter((l) => l.name === 'FIXTURE wire').length, 1,
      'exactly one line per material');
  });

  await record('G7 shortfall floors at zero and never reads as a negative order', async () => {
    const r = await estimate();
    const track = r.lines.find((l) => l.name === 'FIXTURE track');
    // on_hand 250, required 216 -> surplus
    assert.equal(Number(track.on_hand), 250);
    assert.equal(Number(track.shortfall), 0);
    assert.equal(Number(track.packs_to_order), 0);
  });

  await record('G8 packs_to_order rounds UP to whole packs', async () => {
    // wire: required 160, on_hand 10, pack_quantity 500 -> 150 short -> 1 pack
    const r = await estimate();
    const wire = r.lines.find((l) => l.name === 'FIXTURE wire');
    assert.equal(Number(wire.on_hand), 10);
    assert.equal(Number(wire.shortfall), 150);
    assert.equal(Number(wire.packs_to_order), 1,
      '150 ft short of a 500 ft pack is still one pack, not 0.3');
  });

  await record('G9 a shortfall just over one pack needs two packs', async () => {
    await move(trackId, -400, 'consumed');   // 250 - 400 = -150 on hand
    const r = await estimate();
    const track = r.lines.find((l) => l.name === 'FIXTURE track');
    assert.equal(Number(track.on_hand), -150,
      'a negative on-hand is reported as it is -- the ledger is not silently floored');
    assert.equal(Number(track.shortfall), 366, '216 required + 150 already oversold');
    assert.equal(Number(track.packs_to_order), 3, 'ceil(366 / 150)');
    await move(trackId, 400, 'adjustment');  // put it back for later cases
  });

  await record('G10 estimated_cost is null when the part has no cost basis', async () => {
    const noCost = await newMaterial({ name: 'FIXTURE costless', unit_cost: null });
    await mapUsage(xmas.id, noCost, 1);
    await measure(xmas.id, 40);
    const r = await estimate();
    const line = r.lines.find((l) => l.name === 'FIXTURE costless');
    assert.equal(line.estimated_cost, null,
      'an unknown cost must read as unknown, not as zero');
    assert.equal(Number(line.required), 40);
  });

  await record('G11 a service with no mapping is reported, not silently dropped', async () => {
    const orphanSvc = (await one(
      `insert into public.services (key,name,unit,sort_order)
       values ('fixture_unmapped','FIXTURE unmapped service','linear_ft',99) returning id`)).id;
    await measure(orphanSvc, 75);
    const r = await estimate();
    const names = r.unmapped_services.map((s) => s.service_key);
    assert.ok(names.includes('fixture_unmapped'),
      'an empty requirement caused by a missing mapping must not look like "no parts needed"');
    const row = r.unmapped_services.find((s) => s.service_key === 'fixture_unmapped');
    assert.equal(Number(row.measured_quantity), 75);
  });

  await record('G12 a review-flagged measurement is marked on the line it feeds', async () => {
    const flaggedJob = (await one(
      `insert into public.ns_jobs (customer_id) values ($1) returning id`, [customerId])).id;
    await client.query(
      `insert into public.job_measurements (job_id, service_id, quantity, unit, review_required)
       values ($1,$2,100,'linear_ft',true)`, [flaggedJob, perm.id]);
    const r = await estimate(flaggedJob);
    const track = r.lines.find((l) => l.name === 'FIXTURE track');
    assert.equal(track.from_flagged_measurement, true,
      'a requirement derived from a measurement nobody has confirmed must say so');
  });

  await record('G12b the stock basis is named in the answer, and defaults to every location', async () => {
    const r = await estimate();
    assert.equal(r.stock_basis, 'all_locations');
    for (const line of r.lines) assert.equal(line.stock_basis, 'all_locations');
  });

  await record('G12c a VEHICLE basis counts that car plus Base, not the whole business', async () => {
    const basisJob = (await one(
      `insert into public.ns_jobs (customer_id) values ($1) returning id`, [customerId])).id;
    const part = await newMaterial({ name: 'FIXTURE basis part', pack_quantity: 10 });
    const svcB = (await one(
      `insert into public.services (key,name,unit,sort_order)
       values ('fixture_basis_svc','FIXTURE basis service','linear_ft',98) returning id`)).id;
    await mapUsage(svcB, part, 1);
    await client.query(
      `insert into public.job_measurements (job_id, service_id, quantity, unit)
       values ($1,$2,100,'linear_ft')`, [basisJob, svcB]);

    await move(part, 70, 'received', { location: 'base' });
    await client.query(
      `select public.post_stock_transfer($1,$2,25,'base','car_a',true,null,null)`,
      ['basis-xfer', part]);
    // base 45, car_a 25, total 70.

    const all3 = await estimate(basisJob, null);
    const base = await estimate(basisJob, 'base');
    const car  = await estimate(basisJob, 'car_a');

    const pick = (r) => r.lines.find((l) => l.name === 'FIXTURE basis part');
    assert.equal(Number(pick(all3).on_hand), 70, 'everything the business owns');
    assert.equal(Number(pick(base).on_hand), 45, 'the shared pool only');
    assert.equal(Number(pick(car).on_hand), 70,
      'the car plus Base -- a crew loads from Base on its way out');

    assert.equal(Number(pick(base).shortfall), 55, '100 required - 45 at Base');
    assert.equal(Number(pick(base).packs_to_order), 6, 'ceil(55 / 10)');
    assert.equal(car.stock_basis, 'car_a');
  });

  await record('G12d an unknown basis is an error, never a silent fall back to the total', async () => {
    const err = await errorOf(() => estimate(jobId, 'car_z'));
    assert.ok(err, 'a shortfall against the wrong basis is worse than no shortfall');
    assert.equal(err.code, 'P0002');
  });

  await record('G13 the estimate is read-only -- it never writes to the ledger', async () => {
    const before = (await one(
      'select count(*)::int as n from public.ns_material_stock_moves')).n;
    await estimate();
    await estimate();
    const after = (await one(
      'select count(*)::int as n from public.ns_material_stock_moves')).n;
    assert.equal(after, before,
      'a quote that is never accepted must not draw down the shelf');
  });

  await record('G14 measurements on OTHER jobs do not leak into this job', async () => {
    const otherJob = (await one(
      `insert into public.ns_jobs (customer_id) values ($1) returning id`, [customerId])).id;
    await client.query(
      `insert into public.job_measurements (job_id, service_id, quantity, unit)
       values ($1,$2,9999,'linear_ft')`, [otherJob, perm.id]);
    const r = await estimate();
    const track = r.lines.find((l) => l.name === 'FIXTURE track');
    assert.equal(Number(track.required), 216, 'still only this job\'s 200 ft');
  });

  // =========================== L. stock locations, Base / Car A / Car B ===

  await record('L1 Base and Car A are seeded; Car B is NOT', async () => {
    const rows = await all(
      'select code, kind, active from public.ns_stock_locations order by sort_order');
    assert.deepEqual(rows.map((r) => r.code), ['base', 'car_a'],
      'the owner runs one crew today; a second vehicle is data entry, not a migration');
    assert.equal(rows[0].kind, 'base');
    assert.equal(rows[1].kind, 'vehicle');
  });

  await record('L2 Car B can be added as a ROW, with no schema change', async () => {
    await client.query(
      `insert into public.ns_stock_locations (code, name, kind, sort_order)
       values ('car_b', 'Car B', 'vehicle', 2)`);
    const { n } = await one(
      `select count(*)::int as n from public.ns_stock_locations where kind='vehicle'`);
    assert.equal(n, 2, 'nothing in the schema hardcodes how many vehicles exist');
    await client.query(`delete from public.ns_stock_locations where code='car_b'`);
  });

  await record('L3 a SECOND base is refused -- one shared pool, enforced', async () => {
    const err = await errorOf(() => client.query(
      `insert into public.ns_stock_locations (code, name, kind)
       values ('base_2', 'Overflow base', 'base')`));
    assert.ok(err, 'two bases would split the pool and make every stock answer ambiguous');
    assert.equal(err.code, '23505');
  });

  await record('L4 a location code is unique, case-insensitively', async () => {
    const err = await errorOf(() => client.query(
      `insert into public.ns_stock_locations (code, name, kind) values (' CAR_A ', 'Dup', 'vehicle')`));
    assert.ok(err); assert.equal(err.code, '23505');
  });

  await record('L5 balances are PER LOCATION, and a material reads 0 where it has never been', async () => {
    const id = await newMaterial({ name: 'FIXTURE located part' });
    await move(id, 60, 'received', { location: 'base' });
    const rows = await all(
      `select location_code, on_hand from public.ns_material_stock_by_location
        where material_id=$1 order by location_code`, [id]);
    assert.deepEqual(rows.map((r) => [r.location_code, Number(r.on_hand)]),
      [['base', 60], ['car_a', 0]],
      'a part absent from the car must read 0 there, not be missing from the report');
  });

  await record('L6 the per-material total is the rollup of the location balances', async () => {
    const id = await newMaterial({ name: 'FIXTURE rollup part' });
    await move(id, 100, 'received', { location: 'base' });
    await client.query(
      `select public.post_stock_transfer($1,$2,40,'base','car_a',true,null,null)`,
      [`rollup-${id}`, id]);
    const total = Number((await one(
      'select on_hand from public.ns_material_stock where material_id=$1', [id])).on_hand);
    const parts = await all(
      `select location_code, on_hand from public.ns_material_stock_by_location
        where material_id=$1 order by location_code`, [id]);
    assert.equal(total, 100, 'a transfer moves stock, it does not create or destroy it');
    assert.deepEqual(parts.map((r) => [r.location_code, Number(r.on_hand)]),
      [['base', 60], ['car_a', 40]]);
  });

  // ================================= M. operations contract v1, replay ====

  const callMovement = (clientOpId, materialId, qty, reason, location = 'base') => one(
    `select public.post_stock_movement($1,$2,$3,$4,$5,null,null,null,null) as r`,
    [clientOpId, materialId, location, qty, reason]);

  const callTransfer = (clientOpId, materialId, qty, from, to, confirmed = true) => one(
    `select public.post_stock_transfer($1,$2,$3,$4,$5,$6,null,null) as r`,
    [clientOpId, materialId, qty, from, to, confirmed]);

  await record('M1 a REPLAY cannot add stock twice, and reports itself as a replay', async () => {
    const id = await newMaterial({ name: 'FIXTURE replay part' });
    const first = (await callMovement('replay-key-1', id, 25, 'received')).r;
    const again = (await callMovement('replay-key-1', id, 25, 'received')).r;

    assert.equal(first.replayed, false);
    assert.equal(again.replayed, true, 'the caller must be told it was a replay, not a new write');
    assert.equal(again.operation_id, first.operation_id, 'the ORIGINAL operation comes back');

    const { on_hand } = await one(
      'select on_hand from public.ns_material_stock where material_id=$1', [id]);
    assert.equal(Number(on_hand), 25, 'this is the whole point: 25, not 50');

    const { n } = await one(
      'select count(*)::int as n from public.ns_material_stock_moves where operation_id=$1',
      [first.operation_id]);
    assert.equal(n, 1);
  });

  await record('M2 reusing a replay key for a DIFFERENT kind of operation is refused', async () => {
    const id = await newMaterial({ name: 'FIXTURE key reuse' });
    await callMovement('reused-key-1', id, 10, 'received');
    const err = await errorOf(() => callTransfer('reused-key-1', id, 5, 'base', 'car_a'));
    assert.ok(err, 'silently returning the receipt would report a transfer that never happened');
    assert.match(err.message, /already used for a receipt operation/);
  });

  await record('M3 a blank or missing replay key is refused', async () => {
    const id = await newMaterial({ name: 'FIXTURE no key' });
    for (const key of ['', '   ']) {
      const err = await errorOf(() => callMovement(key, id, 5, 'received'));
      assert.ok(err, 'without a key there is no replay safety at all');
      assert.equal(err.code, '22023');
    }
  });

  await record('M4 the operation records actor, and the movement is attributed to it', async () => {
    const actor = (await one(`insert into auth.users default values returning id`)).id;
    await client.query(`select set_config('nova.actor_id', $1, false)`, [actor]);
    const id = await newMaterial({ name: 'FIXTURE attributed' });
    const res = (await callMovement('attributed-1', id, 5, 'received')).r;
    assert.equal(res.actor_id, actor);
    const row = await one(
      'select created_by from public.ns_material_stock_moves where operation_id=$1',
      [res.operation_id]);
    assert.equal(row.created_by, actor);
    await client.query(`select set_config('nova.actor_id', '', false)`);
  });

  await record('M5 the result carries the balances it touched, so no re-read is needed', async () => {
    const id = await newMaterial({ name: 'FIXTURE balances back' });
    const res = (await callMovement('balances-1', id, 70, 'received')).r;
    assert.equal(res.balances.length, 1);
    assert.equal(res.balances[0].location_code, 'base');
    assert.equal(Number(res.balances[0].on_hand), 70);
    assert.equal(res.movements.length, 1);
    assert.equal(Number(res.movements[0].delta), 70);
  });

  await record('M6 a non-admin cannot post anything', async () => {
    const id = await newMaterial({ name: 'FIXTURE non-admin' });
    await client.query(`select set_config('nova.is_admin','off',false)`);
    const a = await errorOf(() => callMovement('denied-1', id, 5, 'received'));
    const b = await errorOf(() => callTransfer('denied-2', id, 5, 'base', 'car_a'));
    await client.query(`select set_config('nova.is_admin','on',false)`);
    assert.equal(a.code, '42501');
    assert.equal(b.code, '42501');
  });

  // ================================= N. transfers conserve, and confirm ===

  await record('N1 a transfer CONSERVES the total and moves the balance', async () => {
    const id = await newMaterial({ name: 'FIXTURE transfer part' });
    await move(id, 90, 'received', { location: 'base' });
    const res = (await callTransfer('xfer-1', id, 30, 'base', 'car_a')).r;

    assert.equal(res.movements.length, 2, 'one act, two legs');
    assert.equal(res.movements.reduce((sum, m) => sum + Number(m.delta), 0), 0,
      'the legs must sum to zero -- that is what conservation means');

    const parts = await all(
      `select location_code, on_hand from public.ns_material_stock_by_location
        where material_id=$1 order by location_code`, [id]);
    assert.deepEqual(parts.map((r) => [r.location_code, Number(r.on_hand)]),
      [['base', 60], ['car_a', 30]]);
  });

  await record('N2 an UNCONFIRMED transfer moves nothing', async () => {
    const id = await newMaterial({ name: 'FIXTURE unconfirmed' });
    await move(id, 50, 'received');
    const err = await errorOf(() => callTransfer('xfer-unconfirmed', id, 10, 'base', 'car_a', false));
    assert.ok(err, '"confirm physical movement before stock moves" is a rule, not a nicety');
    assert.match(err.message, /physical movement is confirmed/);
    const { on_hand } = await one(
      `select on_hand from public.ns_material_stock_by_location
        where material_id=$1 and location_code='car_a'`, [id]);
    assert.equal(Number(on_hand), 0);
  });

  await record('N3 a transfer of more than the source holds is refused', async () => {
    const id = await newMaterial({ name: 'FIXTURE overdrawn' });
    await move(id, 20, 'received');
    const err = await errorOf(() => callTransfer('xfer-over', id, 25, 'base', 'car_a'));
    assert.ok(err, 'you cannot carry out of a car what is not in it');
    assert.match(err.message, /Only 20 available at base/);
  });

  await record('N4 a transfer to the SAME location is refused', async () => {
    const id = await newMaterial({ name: 'FIXTURE same place' });
    await move(id, 20, 'received');
    const err = await errorOf(() => callTransfer('xfer-same', id, 5, 'base', 'base'));
    assert.ok(err); assert.equal(err.code, '22023');
  });

  await record('N5 an unknown location code is a clear error, not a silent no-op', async () => {
    const id = await newMaterial({ name: 'FIXTURE nowhere' });
    const err = await errorOf(() => callTransfer('xfer-nowhere', id, 5, 'base', 'car_z'));
    assert.ok(err); assert.equal(err.code, 'P0002');
  });

  await record('N6 a HAND-BUILT one-legged transfer is refused at COMMIT', async () => {
    // The conservation trigger is deferred, so this proves it fires on the
    // finished transaction rather than on the first insert -- which is the
    // only moment conservation is a meaningful question.
    const id = await newMaterial({ name: 'FIXTURE one leg' });
    await move(id, 40, 'received');
    await client.query('begin');
    const op = (await one(
      `insert into public.ns_stock_operations (client_operation_id, kind, confirmed_physical)
       values ('hand-one-leg', 'transfer', true) returning id`)).id;
    await client.query(
      `insert into public.ns_material_stock_moves
         (material_id, location_id, operation_id, delta, reason)
       values ($1, public.ns_location_by_code('base'), $2, -10, 'transfer')`, [id, op]);
    const err = await errorOf(() => client.query('commit'));
    assert.ok(err, 'a half transfer would silently destroy stock');
    assert.match(err.message, /does not conserve/);
    await client.query('rollback');
  });

  await record('N7 a hand-built transfer whose legs do not balance is refused at COMMIT', async () => {
    const id = await newMaterial({ name: 'FIXTURE unbalanced' });
    await move(id, 40, 'received');
    await client.query('begin');
    const op = (await one(
      `insert into public.ns_stock_operations (client_operation_id, kind, confirmed_physical)
       values ('hand-unbalanced', 'transfer', true) returning id`)).id;
    await client.query(
      `insert into public.ns_material_stock_moves
         (material_id, location_id, operation_id, delta, reason)
       values ($1, public.ns_location_by_code('base'), $2, -10, 'transfer'),
              ($1, public.ns_location_by_code('car_a'), $2, 15, 'transfer')`, [id, op]);
    const err = await errorOf(() => client.query('commit'));
    assert.ok(err, '5 units would appear from nowhere');
    assert.match(err.message, /net 5/);
    await client.query('rollback');
  });

  await record('N8 a NON-transfer operation is not forced to conserve', async () => {
    // A receipt adds stock; requiring it to balance would be nonsense. The
    // trigger must distinguish, not simply fire on every movement.
    const id = await newMaterial({ name: 'FIXTURE receipt not conserving' });
    await move(id, 15, 'received');
    const { on_hand } = await one(
      'select on_hand from public.ns_material_stock where material_id=$1', [id]);
    assert.equal(Number(on_hand), 15);
  });

  await record('N9 an operation cannot blame a vehicle that is the Base', async () => {
    const err = await errorOf(() => client.query(
      `insert into public.ns_stock_operations (client_operation_id, kind, vehicle_location_id)
       values ('bad-vehicle', 'transfer', public.ns_location_by_code('base'))`));
    assert.ok(err, '"which car did this" must not read as answered when it is not');
    assert.match(err.message, /must name a vehicle location/);
  });

  await record('N10 a transfer is attributed to the vehicle side', async () => {
    const id = await newMaterial({ name: 'FIXTURE attributed transfer' });
    await move(id, 30, 'received');
    const res = (await callTransfer('xfer-attributed', id, 10, 'base', 'car_a')).r;
    const car = await one(`select id from public.ns_stock_locations where code='car_a'`);
    assert.equal(res.vehicle_location_id, car.id);
  });

  // ================================================== H. updated_at ========
  await record('H1 updated_at is advanced by the trigger on update', async () => {
    const id = await newMaterial({ name: 'FIXTURE touch me' });
    const before = (await one(
      'select updated_at from public.ns_materials where id=$1', [id])).updated_at;
    await client.query(`select pg_sleep(0.01)`);
    await client.query(
      `update public.ns_materials set notes='changed' where id=$1`, [id]);
    const after = (await one(
      'select updated_at from public.ns_materials where id=$1', [id])).updated_at;
    assert.ok(after > before, 'the touch trigger must fire');
  });

  await record('H2 a client-supplied updated_at cannot be used to backdate a row', async () => {
    const id = await newMaterial({ name: 'FIXTURE backdate me' });
    await client.query(
      `update public.ns_materials set updated_at = '2001-01-01' where id=$1`, [id]);
    const { updated_at: ua } = await one(
      'select updated_at from public.ns_materials where id=$1', [id]);
    assert.ok(ua.getUTCFullYear() > 2001, 'the trigger overrides whatever was sent');
  });

  // ============================================== I. privileges ============
  const ALL_NEW = [
    'public.ns_suppliers', 'public.ns_materials', 'public.ns_purchase_orders',
    'public.ns_purchase_order_lines', 'public.ns_rental_sets',
    'public.ns_rental_set_events', 'public.ns_material_stock_moves',
    'public.ns_service_material_usage', 'public.ns_stock_locations',
    'public.ns_stock_operations'
  ];

  const tablePriv = async (role, tbl, priv) => (await one(
    'select has_table_privilege($1,$2,$3) as ok', [role, tbl, priv])).ok;

  await record('I1 anon holds NO privilege on any new table, through any route', async () => {
    for (const t of [...ALL_NEW, 'public.ns_material_stock',
                     'public.ns_material_stock_by_location']) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert.equal(await tablePriv('anon', t, p), false, `anon must not hold ${p} on ${t}`);
      }
    }
  });

  await record('I1b authenticated cannot write the ledger DIRECTLY, only via the contract', async () => {
    // This is the line that makes the contract's guarantees real rather than
    // advisory: with direct INSERT available, any caller could write a
    // movement with no operation, no replay key and no confirmation.
    for (const t of ['public.ns_material_stock_moves', 'public.ns_stock_operations']) {
      for (const p2 of ['INSERT', 'UPDATE', 'DELETE']) {
        assert.equal(await tablePriv('authenticated', t, p2), false,
          `authenticated must not hold ${p2} on ${t}`);
      }
      assert.equal(await tablePriv('authenticated', t, 'SELECT'), true,
        `${t} must stay readable -- the ledger is the audit trail`);
    }
  });

  await record('I1c the contract functions are admin-reachable and anon-proof', async () => {
    for (const f of [
      'public.post_stock_movement(text,uuid,text,numeric,text,text,uuid,uuid,text)',
      'public.post_stock_transfer(text,uuid,numeric,text,text,boolean,text,uuid)'
    ]) {
      const { a, b } = await one(
        'select has_function_privilege($1,$2,$3) as a, has_function_privilege($4,$2,$3) as b',
        ['anon', f, 'EXECUTE', 'authenticated']);
      assert.equal(a, false, `anon must not execute ${f}`);
      assert.equal(b, true, `authenticated must execute ${f}`);
    }
  });

  await record('I2 anon cannot EXECUTE estimate_job_materials', async () => {
    const { ok } = await one(
      `select has_function_privilege('anon','public.estimate_job_materials(uuid,text)','EXECUTE') as ok`);
    assert.equal(ok, false);
  });

  await record('I3 an INHERITED grant on a new table is caught by the same check that missed it in 7.1', async () => {
    // has_table_privilege counts inherited and PUBLIC routes, which reading
    // the grant list does not -- this is the Batch 7.1 finding, re-asserted
    // against the Batch 8.1 tables rather than assumed to still hold.
    await client.query('grant ns_legacy_writer to anon');
    await client.query('grant select on public.ns_materials to ns_legacy_writer');
    assert.equal(await tablePriv('anon', 'public.ns_materials', 'SELECT'), true,
      'the inherited route is real and this is what detects it');

    await client.query('revoke select on public.ns_materials from ns_legacy_writer');
    await client.query('revoke ns_legacy_writer from anon');
    assert.equal(await tablePriv('anon', 'public.ns_materials', 'SELECT'), false);
  });

  await record('I4 authenticated and service_role keep the access they should', async () => {
    // The two ledger tables are deliberately read-only to authenticated --
    // see I1b. Everything else stays fully writable from the admin screens.
    const LEDGER = ['public.ns_material_stock_moves', 'public.ns_stock_operations'];
    for (const t of ALL_NEW) {
      assert.equal(await tablePriv('authenticated', t, 'SELECT'), true, `authenticated SELECT on ${t}`);
      if (!LEDGER.includes(t)) {
        for (const p of ['INSERT', 'UPDATE', 'DELETE']) {
          assert.equal(await tablePriv('authenticated', t, p), true, `authenticated ${p} on ${t}`);
        }
      }
      // service_role is the server-side path and keeps everything.
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert.equal(await tablePriv('service_role', t, p), true, `service_role ${p} on ${t}`);
      }
    }
    for (const v of ['public.ns_material_stock', 'public.ns_material_stock_by_location']) {
      assert.equal(await tablePriv('authenticated', v, 'SELECT'), true, `authenticated SELECT on ${v}`);
    }
  });

  await record('I5 the revoke from PUBLIC did not take authenticated access by side effect', async () => {
    const { ok } = await one(
      `select has_function_privilege('authenticated','public.estimate_job_materials(uuid,text)','EXECUTE') as ok`);
    assert.equal(ok, true);
  });

  // ============================================== J. RLS, as a real role ===
  await record('J1 RLS is enabled on every new table', async () => {
    const rows = await all(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname = any($1)`,
      [ALL_NEW.map((t) => t.replace('public.', ''))]);
    assert.equal(rows.length, ALL_NEW.length);
    for (const r of rows) assert.equal(r.relrowsecurity, true, `${r.relname} needs RLS`);
  });

  await record('J2 a NON-admin authenticated session sees no rows and cannot insert', async () => {
    await client.query('begin');
    await client.query(`select set_config('nova.is_admin','off',true)`);
    await client.query('set local role authenticated');
    const { n } = await one('select count(*)::int as n from public.ns_materials');
    assert.equal(n, 0, 'the admin_all policy must hide every row from a non-admin');
    const err = await errorOf(() => client.query(
      `insert into public.ns_materials (name,category,unit) values ('SNEAKY','track','each')`));
    assert.ok(err, 'and WITH CHECK must refuse the insert');
    assert.equal(err.code, '42501');
    await client.query('rollback');
  });

  await record('J3 an ADMIN authenticated session sees the rows', async () => {
    await client.query('begin');
    await client.query(`select set_config('nova.is_admin','on',true)`);
    await client.query('set local role authenticated');
    const { n } = await one('select count(*)::int as n from public.ns_materials');
    assert.ok(n > 0, 'an admin must be able to read the catalogue');
    await client.query('rollback');
  });

  await record('J4 the stock view is security_invoker, so it cannot leak past the policy', async () => {
    const { opts } = await one(
      `select c.reloptions::text as opts from pg_class c
         join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname='ns_material_stock'`);
    assert.match(String(opts), /security_invoker=(on|true)/);

    await client.query('begin');
    await client.query(`select set_config('nova.is_admin','off',true)`);
    await client.query('set local role authenticated');
    const { n } = await one('select count(*)::int as n from public.ns_material_stock');
    assert.equal(n, 0,
      'without security_invoker a view over RLS tables hands every row to any reader');
    await client.query('rollback');
  });

  await record('J5 estimate_job_materials is SECURITY INVOKER, not DEFINER', async () => {
    const { prosecdef } = await one(
      `select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='estimate_job_materials'`);
    assert.equal(prosecdef, false,
      'DEFINER would make this function solely responsible for not leaking rows, for no gain');
  });

  // ============================ K. nothing in the pricing path was touched =
  await record('K1 the migrations create no object that the quote path reads', async () => {
    const sql = migration(TABLES_MIGRATION) + '\n' + migration(RPC_MIGRATION);
    for (const forbidden of [
      'calculate_job_pricing', 'quote_line_items', 'create_quote_from_calculation',
      'get_customer_quote', 'mark_quote_sent', 'respond_to_quote', 'pricing_rules'
    ]) {
      assert.ok(!new RegExp(`(create|alter|drop|insert into|update|delete from)[^;]*\\b${forbidden}\\b`, 'i').test(sql),
        `Batch 8.1 must not modify ${forbidden} -- pricing stays in the existing RPCs`);
    }
  });

  await client.end();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
})();
