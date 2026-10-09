// Batch 7.1 -- executable database tests for the integrity and authorization
// migrations, run against a DISPOSABLE LOCAL POSTGRES.
//
//   PGURL='postgresql://postgres@/postgres?host=/tmp&port=5433' \
//     node tests/db/batch7-1.test.mjs
//
// These are NOT the tests/integration/ suite, which targets a real Supabase
// project via SUPABASE_DB_URL. This file refuses to run against anything that
// looks like a hosted Supabase database -- see assertDisposable() below. It
// applies the actual migration files from supabase/migrations/ to a throwaway
// schema and asserts what they enforce.
//
// Scope and honesty:
//   * passing here proves the migrations are valid SQL, that their function
//     signatures match the live ones, and that the trigger enforces what it
//     claims in real Postgres.
//   * it does NOT prove the live database is protected. None of these
//     migrations has been applied to production.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from '/home/user/nova-shield/node_modules/pg/lib/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const MIGRATIONS = join(REPO, 'supabase', 'migrations');

const URL_ = process.env.PGURL || 'postgresql://postgres@/postgres?host=/tmp&port=5433';

/** Hard stop before a single statement runs. The owner's standing rule is
 *  that no writing test may point at the live Supabase project, including
 *  rolled-back ones -- so this refuses rather than trusting the caller. */
function assertDisposable(url) {
  const banned = ['supabase.co', 'supabase.com', 'pooler.supabase'];
  for (const needle of banned) {
    if (url.includes(needle)) {
      console.error(`REFUSING TO RUN: "${needle}" appears in the connection string.\n` +
        'These tests write and must only ever target a disposable local database.');
      process.exit(2);
    }
  }
}

const results = [];
async function record(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (err) { results.push({ name, ok: false, err: err && err.message }); }
}

/** Runs `fn`, returns the Postgres error if it raised, else null. */
async function errorOf(client, fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

const migration = (file) => readFileSync(join(MIGRATIONS, file), 'utf8');

(async () => {
  assertDisposable(URL_);

  const client = new pg.Client({ connectionString: URL_ });
  await client.connect();

  // Isolate: everything lives in a throwaway database-wide reset each run.
  await client.query(readFileSync(join(HERE, 'fixture-schema.sql'), 'utf8'));

  const seed = async (status) => {
    const { rows } = await client.query(
      `insert into public.ns_quotes (status, customer_notes, terms, internal_notes)
       values ($1, 'original note', 'original terms', 'staff scratch')
       returning id`, [status]);
    return rows[0].id;
  };

  // ============================================ A. before the migration ===
  await record('BEFORE: a sent quote\'s customer_notes can be rewritten (the hole)', async () => {
    const id = await seed('sent');
    await client.query(`update public.ns_quotes set customer_notes = 'rewritten' where id = $1`, [id]);
    const { rows } = await client.query('select customer_notes from public.ns_quotes where id=$1', [id]);
    assert.equal(rows[0].customer_notes, 'rewritten',
      'without the migration this must succeed -- that is the defect');
  });

  await record('BEFORE: a sent quote can be demoted back to draft', async () => {
    const id = await seed('sent');
    await client.query(`update public.ns_quotes set status = 'draft' where id = $1`, [id]);
    const { rows } = await client.query('select status from public.ns_quotes where id=$1', [id]);
    assert.equal(rows[0].status, 'draft');
  });

  // ================================================= apply the migration ==
  await client.query(migration('20261009160000_batch5_freeze_customer_facing_content_once_sent.sql'));

  // ============================================= B. the freeze enforces ===
  await record('a DRAFT quote still accepts customer_notes and terms edits', async () => {
    const id = await seed('draft');
    await client.query(
      `update public.ns_quotes set customer_notes='updated', terms='updated terms' where id=$1`, [id]);
    const { rows } = await client.query(
      'select customer_notes, terms from public.ns_quotes where id=$1', [id]);
    assert.equal(rows[0].customer_notes, 'updated');
    assert.equal(rows[0].terms, 'updated terms');
  });

  for (const status of ['sent', 'accepted', 'declined', 'expired', 'superseded']) {
    await record(`a ${status.toUpperCase()} quote refuses a customer_notes edit`, async () => {
      const id = await seed(status);
      const err = await errorOf(client, () =>
        client.query(`update public.ns_quotes set customer_notes='rewritten' where id=$1`, [id]));
      assert.ok(err, 'the update should have raised');
      assert.equal(err.code, '23514', `expected check_violation, got ${err.code}`);
      assert.match(err.message, /frozen once sent/);
      const { rows } = await client.query('select customer_notes from public.ns_quotes where id=$1', [id]);
      assert.equal(rows[0].customer_notes, 'original note', 'the stored value must be unchanged');
    });
  }

  await record('a SENT quote refuses a terms edit', async () => {
    const id = await seed('sent');
    const err = await errorOf(client, () =>
      client.query(`update public.ns_quotes set terms='rewritten terms' where id=$1`, [id]));
    assert.ok(err);
    assert.equal(err.code, '23514');
  });

  await record('internal_notes remain editable on a SENT quote -- staff scratch is not frozen', async () => {
    const id = await seed('sent');
    await client.query(`update public.ns_quotes set internal_notes='added later' where id=$1`, [id]);
    const { rows } = await client.query('select internal_notes from public.ns_quotes where id=$1', [id]);
    assert.equal(rows[0].internal_notes, 'added later');
  });

  await record('an unrelated column (total) is still updatable on a SENT quote', async () => {
    const id = await seed('sent');
    await client.query(`update public.ns_quotes set total = 123.45 where id=$1`, [id]);
    const { rows } = await client.query('select total from public.ns_quotes where id=$1', [id]);
    assert.equal(Number(rows[0].total), 123.45);
  });

  // ===================================================== C. the bypasses ==
  await record('BYPASS 1 (one statement): status->draft plus a content edit is refused', async () => {
    const id = await seed('sent');
    const err = await errorOf(client, () =>
      client.query(`update public.ns_quotes set status='draft', customer_notes='sneaky' where id=$1`, [id]));
    assert.ok(err, 'the combined update should have raised');
    assert.equal(err.code, '23514');
    const { rows } = await client.query('select status, customer_notes from public.ns_quotes where id=$1', [id]);
    assert.equal(rows[0].status, 'sent');
    assert.equal(rows[0].customer_notes, 'original note');
  });

  await record('BYPASS 2 (two statements): demoting a sent quote to draft is refused', async () => {
    const id = await seed('sent');
    const err = await errorOf(client, () =>
      client.query(`update public.ns_quotes set status='draft' where id=$1`, [id]));
    assert.ok(err, 'this is the step the Batch 5 version allowed');
    assert.equal(err.code, '23514');
    assert.match(err.message, /cannot be returned to draft/);
    const { rows } = await client.query('select status from public.ns_quotes where id=$1', [id]);
    assert.equal(rows[0].status, 'sent', 'the quote must still be sent');
  });

  await record('a legitimate draft -> sent transition carrying fresh content is allowed', async () => {
    const id = await seed('draft');
    await client.query(
      `update public.ns_quotes set status='sent', customer_notes='final wording' where id=$1`, [id]);
    const { rows } = await client.query(
      'select status, customer_notes from public.ns_quotes where id=$1', [id]);
    assert.equal(rows[0].status, 'sent');
    assert.equal(rows[0].customer_notes, 'final wording',
      'sending a draft with edited content is the content the customer receives');
  });

  await record('forward transitions between non-draft statuses are unaffected', async () => {
    const id = await seed('sent');
    await client.query(`update public.ns_quotes set status='accepted' where id=$1`, [id]);
    const { rows } = await client.query('select status from public.ns_quotes where id=$1', [id]);
    assert.equal(rows[0].status, 'accepted');
  });

  // ======================================================= D. the grants ==
  await record('BEFORE: anon can execute both admin-only RPCs (the inherited PUBLIC grant)', async () => {
    const { rows } = await client.query(`
      select has_function_privilege('anon','public.calculate_job_pricing(uuid,uuid[])','EXECUTE') as calc,
             has_function_privilege('anon','public.save_quote_signature(uuid,text,text)','EXECUTE') as sig`);
    assert.equal(rows[0].calc, true);
    assert.equal(rows[0].sig, true);
  });

  await record('the grant migration applies cleanly -- signatures match the live ones', async () => {
    // A REVOKE naming a signature that does not exist raises 42883, so this
    // completing at all is the signature check.
    await client.query(migration('20261010090000_batch7_1_tighten_remaining_admin_rpc_grants.sql'));
  });

  await record('AFTER: anon cannot execute either RPC; authenticated still can', async () => {
    const { rows } = await client.query(`
      select has_function_privilege('anon','public.calculate_job_pricing(uuid,uuid[])','EXECUTE') as anon_calc,
             has_function_privilege('anon','public.save_quote_signature(uuid,text,text)','EXECUTE') as anon_sig,
             has_function_privilege('authenticated','public.calculate_job_pricing(uuid,uuid[])','EXECUTE') as auth_calc,
             has_function_privilege('authenticated','public.save_quote_signature(uuid,text,text)','EXECUTE') as auth_sig`);
    assert.equal(rows[0].anon_calc, false, 'anon must lose calculate_job_pricing');
    assert.equal(rows[0].anon_sig, false, 'anon must lose save_quote_signature');
    assert.equal(rows[0].auth_calc, true, 'the admin panel runs as authenticated');
    assert.equal(rows[0].auth_sig, true);
  });

  await record('a PUBLIC grant on a trigger function cannot be exercised anyway', async () => {
    const err = await errorOf(client, () => client.query('select public.fixture_trigger_fn()'));
    assert.ok(err, 'calling a trigger function directly must fail');
    assert.match(err.message, /trigger/i);
  });

  await record('a PUBLIC grant on an event-trigger function cannot be exercised anyway', async () => {
    const err = await errorOf(client, () => client.query('select public.fixture_event_trigger_fn()'));
    assert.ok(err, 'calling an event trigger function directly must fail');
    // Postgres reports both trigger and event-trigger functions with the same
    // wording -- "trigger functions can only be called as triggers" -- so the
    // assertion matches that rather than a phrase Postgres never emits.
    assert.match(err.message, /can only be called as triggers/i);
    assert.equal(err.code, '0A000', 'feature_not_supported, not a permission error');
  });

  // =============================================== E. the legacy tables ===
  await record('BEFORE: anon holds INSERT on all three legacy tables', async () => {
    const { rows } = await client.query(`
      select has_table_privilege('anon','public.job_requests','INSERT') as jr,
             has_table_privilege('anon','public.jobs','INSERT')         as j,
             has_table_privilege('anon','public.quotes','INSERT')       as q`);
    assert.deepEqual(rows[0], { jr: true, j: true, q: true });
  });

  await record('the legacy revoke removes anon write access and keeps read', async () => {
    await client.query(migration('20261010091000_batch7_1_revoke_anon_writes_on_legacy_tables.sql'));
    const { rows } = await client.query(`
      select has_table_privilege('anon','public.job_requests','INSERT') as ins,
             has_table_privilege('anon','public.jobs','UPDATE')         as upd,
             has_table_privilege('anon','public.quotes','DELETE')       as del,
             has_table_privilege('anon','public.job_requests','SELECT') as sel`);
    assert.equal(rows[0].ins, false, 'INSERT is the privilege finding 5 names');
    assert.equal(rows[0].upd, false);
    assert.equal(rows[0].del, false);
    assert.equal(rows[0].sel, true, 'SELECT is deliberately left for the retirement decision');
  });

  await record('the legacy revoke is idempotent -- safe if the grant was already gone', async () => {
    await client.query(migration('20261010091000_batch7_1_revoke_anon_writes_on_legacy_tables.sql'));
  });

  await client.end();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
})();
