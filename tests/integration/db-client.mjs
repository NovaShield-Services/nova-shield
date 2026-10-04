// Shared connection + transaction scaffolding for the real-database
// integration suite.
//
// AUTHORIZATION MODEL (read this before adding a test):
// Every admin-gated operation in this app -- create_quote_from_calculation,
// duplicate_quote, mark_quote_sent, save_quote_signature,
// calculate_job_pricing, recalculate_quote_totals -- is a SECURITY DEFINER
// PL/pgSQL function with an EXPLICIT `if not is_admin() then raise
// exception` check in its own body. is_admin() is just
// `exists(select 1 from admin_users where user_id = auth.uid())`, and
// auth.uid() just reads the Postgres session setting request.jwt.claim.sub
// -- the exact value PostgREST sets after verifying a real JWT. Nothing in
// this app's authorization is a declarative RLS policy gating direct table
// access; it's all explicit checks inside these functions.
//
// That means a direct Postgres connection can exercise the REAL, unmodified
// is_admin()/auth.uid() logic -- not bypass it -- by setting the same
// session claim PostgREST would have set, for a synthetic admin_users row
// created (and rolled back) inside the test's own transaction. This is not
// a weakened or faked check: is_admin() still queries the real admin_users
// table and genuinely returns false for any UUID not registered there.
// What it does NOT re-test is PostgREST's own JWT-signature verification --
// that's Supabase infrastructure this project relies on, not application
// code, and is out of scope here.
//
// withAdminTx() below is the primary helper: it opens a transaction,
// registers a disposable synthetic admin, sets that claim, hands the
// caller a client plus the synthetic admin's id, and ALWAYS rolls back --
// success or failure -- so no synthetic row (including the admin_users
// registration) ever survives the transaction. withTx() is the same minus
// the admin claim, for the one real RPC (respond_to_quote) that has no
// auth gate at all, so simulating "being" anyone would test nothing real.

import pg from 'pg';
import { randomUUID } from 'node:crypto';

export const ENV_VAR = 'SUPABASE_DB_URL';

export function isConfigured() {
  return !!process.env[ENV_VAR];
}

let pool = null;
function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env[ENV_VAR], max: 5 });
  }
  return pool;
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}

/** Runs fn(client) inside BEGIN/ROLLBACK -- no admin claim, for the one
 *  genuinely public RPC (respond_to_quote). Always rolls back. */
export async function withTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* connection may already be dead */ }
    client.release();
  }
}

/** Runs fn(client, adminId) inside BEGIN/ROLLBACK with a disposable
 *  synthetic admin registered and claimed for the transaction's duration.
 *  adminId is a fresh gen_random_uuid() each call -- never the real human
 *  admin's account.
 *
 *  admin_users.user_id carries a real FK to auth.users, so a bare
 *  admin_users insert isn't enough -- a minimal auth.users row (id only;
 *  every other column is nullable, confirmed no custom triggers on that
 *  table) has to exist first. Both rows are rolled back with everything
 *  else when the transaction ends. */
export async function withAdminTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const adminId = randomUUID();
    await client.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [adminId, `${adminId}@test-integration.invalid`]
    );
    await client.query(`insert into admin_users (user_id) values ($1)`, [adminId]);
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [adminId]);
    await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`);
    return await fn(client, adminId);
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* connection may already be dead */ }
    client.release();
  }
}

/** Clears the simulated claim within an already-open transaction/client,
 *  so a test can assert the "stranger" (not-admin) denial path without
 *  opening a second transaction. */
export async function dropAdminClaim(client) {
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [randomUUID()]);
}

/** Runs fn() expecting it to throw (typically a `raise exception` from an
 *  RPC under test), wrapped in a SAVEPOINT so the failure doesn't abort the
 *  whole surrounding transaction -- a plain Postgres error otherwise poisons
 *  every later statement on the same client until COMMIT/ROLLBACK, which
 *  would make any "and nothing changed" follow-up query fail with "current
 *  transaction is aborted" instead of actually checking anything. Returns
 *  the caught error so the caller can assert on its message/code. Throws if
 *  fn() did NOT throw, since every caller here only reaches for this helper
 *  when a rejection is the point of the test. */
export async function expectRejection(client, fn) {
  await client.query('SAVEPOINT expect_rejection');
  try {
    await fn();
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT expect_rejection');
    return err;
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_rejection');
  throw new Error('expected the operation to be rejected, but it succeeded');
}

/** A unique, obviously-synthetic label prefix for this run -- readability
 *  during a failed/aborted test, not collision-avoidance (rollback already
 *  guarantees nothing persists). */
export function runId() {
  return `TEST_INTEGRATION_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Section L: a defensive, whole-suite-level check that no synthetic test
 *  data survived the run -- called once, AFTER every test file has
 *  finished, outside any single test's own transaction. Every test here
 *  already rolls back its own transaction, which should make this
 *  structurally impossible to fail; this function is the "do not simply
 *  assume cleanup succeeded" proof, not a cleanup step itself. */
export async function verifyNoLeakedTestData() {
  const client = await getPool().connect();
  try {
    const checks = [
      ['customers', `select count(*)::int as n from customers where name like 'TEST_INTEGRATION_%'`],
      ['properties', `select count(*)::int as n from properties p join customers c on c.id = p.customer_id where c.name like 'TEST_INTEGRATION_%'`],
      ['ns_jobs', `select count(*)::int as n from ns_jobs where title like 'TEST_INTEGRATION_%'`],
      ['ns_quotes', `select count(*)::int as n from ns_quotes q join ns_jobs j on j.id = q.job_id where j.title like 'TEST_INTEGRATION_%'`],
      ['job_measurements', `select count(*)::int as n from job_measurements jm join ns_jobs j on j.id = jm.job_id where j.title like 'TEST_INTEGRATION_%'`],
      ['notifications', `select count(*)::int as n from notifications nt join ns_jobs j on j.id = nt.job_id where j.title like 'TEST_INTEGRATION_%'`],
      ['auth.users (synthetic admins)', `select count(*)::int as n from auth.users where email like '%@test-integration.invalid'`],
      ['admin_users (synthetic admins)', `select count(*)::int as n from admin_users where user_id in (select id from auth.users where email like '%@test-integration.invalid')`],
    ];
    const leaks = [];
    for (const [label, sql] of checks) {
      const { rows } = await client.query(sql);
      if (rows[0].n > 0) leaks.push({ table: label, count: rows[0].n });
    }
    return { clean: leaks.length === 0, leaks };
  } finally {
    client.release();
  }
}
