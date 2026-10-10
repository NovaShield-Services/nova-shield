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
    drop function if exists public.estimate_job_materials(uuid);
    drop function if exists public.ns_touch_updated_at() cascade;
  `);

  await client.query(readFileSync(join(HERE, 'fixture-schema-batch8-1.sql'), 'utf8'));

  // ================================================== A. the migrations ====
  await record('A1 the tables migration applies cleanly', async () => {
    await client.query(migration(TABLES_MIGRATION));
  });

  await record('A2 the RPC migration applies cleanly', async () => {
    await client.query(migration(RPC_MIGRATION));
  });

  await record('A3 both migrations are re-runnable without error or duplicate rows', async () => {
    await client.query(migration(TABLES_MIGRATION));
    await client.query(migration(RPC_MIGRATION));
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

  const move = (materialId, delta, reason, extra = {}) => client.query(
    `insert into public.ns_material_stock_moves (material_id, delta, reason, job_id, note)
     values ($1,$2,$3,$4,$5)`,
    [materialId, delta, reason, extra.jobId ?? null, extra.note ?? null]);

  await record('C1 a zero-delta movement is refused', async () => {
    const err = await errorOf(() => move(trackId, 0, 'adjustment'));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('C2 an unknown reason is refused', async () => {
    const err = await errorOf(() => move(trackId, 5, 'borrowed'));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('C3 a NEGATIVE "received" is refused (the sign/reason agreement)', async () => {
    const err = await errorOf(() => move(trackId, -10, 'received'));
    assert.ok(err, 'a mistyped sign on a receipt would otherwise read as a legitimate movement');
    assert.equal(err.code, '23514');
  });

  await record('C4 a POSITIVE "consumed" is refused', async () => {
    const err = await errorOf(() => move(trackId, 10, 'consumed'));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('C5 a POSITIVE "damaged" is refused', async () => {
    const err = await errorOf(() => move(trackId, 3, 'damaged'));
    assert.ok(err); assert.equal(err.code, '23514');
  });

  await record('C6 "adjustment" is the deliberate escape hatch and goes either way', async () => {
    await move(trackId, 7, 'adjustment');
    await move(trackId, -7, 'adjustment');
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
      `insert into public.ns_material_stock_moves (material_id, delta, reason, purchase_order_id)
       values ($1, 10, 'received', $2)`, [wireId, tmp]);
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

  const estimate = async (id = jobId) => (await one(
    'select public.estimate_job_materials($1) as r', [id])).r;

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
    'public.ns_service_material_usage'
  ];

  const tablePriv = async (role, tbl, priv) => (await one(
    'select has_table_privilege($1,$2,$3) as ok', [role, tbl, priv])).ok;

  await record('I1 anon holds NO privilege on any new table, through any route', async () => {
    for (const t of [...ALL_NEW, 'public.ns_material_stock']) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert.equal(await tablePriv('anon', t, p), false, `anon must not hold ${p} on ${t}`);
      }
    }
  });

  await record('I2 anon cannot EXECUTE estimate_job_materials', async () => {
    const { ok } = await one(
      `select has_function_privilege('anon','public.estimate_job_materials(uuid)','EXECUTE') as ok`);
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

  await record('I4 authenticated and service_role keep full access', async () => {
    for (const t of ALL_NEW) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert.equal(await tablePriv('authenticated', t, p), true, `authenticated ${p} on ${t}`);
        assert.equal(await tablePriv('service_role', t, p), true, `service_role ${p} on ${t}`);
      }
    }
    assert.equal(await tablePriv('authenticated', 'public.ns_material_stock', 'SELECT'), true);
  });

  await record('I5 the revoke from PUBLIC did not take authenticated access by side effect', async () => {
    const { ok } = await one(
      `select has_function_privilege('authenticated','public.estimate_job_materials(uuid)','EXECUTE') as ok`);
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
