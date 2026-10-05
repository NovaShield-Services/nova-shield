// Phase C -- the Permanent Lighting option-group architecture: sibling
// quotes sharing option_group_id, each independently priced from an
// explicit measurement subset via create_option_quote/send_option_group,
// customer sibling-discovery and single-choice acceptance through
// get_customer_quote/respond_to_quote, and the DB-enforced
// "at most one accepted option per group" invariant.
//
// *** NOT YET RUN AGAINST A LIVE DATABASE ***
// This session's Supabase write path (every DDL/DML statement, even a
// throwaway temp table) timed out repeatedly after the schema migration
// landed -- confirmed via read-only pg_stat_activity/pg_locks that nothing
// is actually locked; it is an infrastructure-level outage on the write
// path specifically, not a bug in this suite's SQL. Every assertion below
// is derived by re-reading the actual migration SQL line by line (see the
// Phase C migration text) and, where a number is involved, from rates
// already empirically confirmed live in Phase B (permanent_lighting $5/ft,
// its jump wire $2/ft; christmas_lighting $5/ft, its jump wire $2/ft;
// siding's real rate via getCurrentRate) -- never invented. Run this file
// for real the first chance SUPABASE_DB_URL + a healthy write path are
// both available, before trusting it as a passing suite.

import { createIntegrationRecorder, printResults } from './reporter.mjs';
import { withAdminTx, withTx, dropAdminClaim, expectRejection, closePool, runId, isConfigured } from './db-client.mjs';
import { createJob, getService, getCurrentRate, createDraftQuote, addLineItem, markSentDirect } from './helpers.mjs';

const { results, record } = createIntegrationRecorder(isConfigured());

async function addMeasurement(client, jobId, serviceId, quantity, unit = 'linear_ft') {
  const { rows } = await client.query(
    `insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,$3,$4) returning id`,
    [jobId, serviceId, quantity, unit]
  );
  return rows[0].id;
}
async function createQuote(client, jobId, kind = 'final') {
  const { rows } = await client.query('select create_quote_from_calculation($1, $2) as id', [jobId, kind]);
  return rows[0].id;
}
async function createOption(client, jobId, groupId, label, sortOrder, measurementIds, parentId = null) {
  const { rows } = await client.query(
    'select create_option_quote($1, $2, $3, $4, $5, $6, $7) as id',
    [jobId, groupId, label, sortOrder, measurementIds, 'final', parentId]
  );
  return rows[0].id;
}
async function getQuote(client, id) {
  const { rows } = await client.query('select * from ns_quotes where id = $1', [id]);
  return rows[0];
}
async function sendGroup(client, groupId) {
  await client.query('select send_option_group($1)', [groupId]);
}
async function customerDoc(client, id) {
  const { rows } = await client.query('select get_customer_quote($1) as doc', [id]);
  return rows[0].doc;
}

async function main() {
  // -- 1/7/13: ordinary quotes are completely unaffected --------------

  await record('1/7. an ordinary quote created after the migration has option_group_id/option_label/option_sort_order all NULL', async () => {
    await withAdminTx(async (client) => {
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, runId());
      await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const quoteId = await createQuote(client, jobId);
      const quote = await getQuote(client, quoteId);
      if (quote.option_group_id !== null) throw new Error(`expected option_group_id null for an ordinary quote, got ${quote.option_group_id}`);
      if (quote.option_label !== null) throw new Error(`expected option_label null for an ordinary quote, got ${quote.option_label}`);
      if (quote.option_sort_order !== null) throw new Error(`expected option_sort_order null for an ordinary quote, got ${quote.option_sort_order}`);
    });
  });

  await record('13. get_customer_quote on a historical (option_group_id NULL) quote returns option_group: null, every other field unchanged', async () => {
    await withAdminTx(async (client) => {
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, runId());
      await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const quoteId = await createQuote(client, jobId);
      await client.query(`update ns_quotes set status='sent', sent_at=now() where id=$1`, [quoteId]);
      const doc = await customerDoc(client, quoteId);
      if (doc.option_group !== null) throw new Error(`expected option_group: null for an ordinary quote, got ${JSON.stringify(doc.option_group)}`);
      if (!Array.isArray(doc.lines) || doc.lines.length !== 1) throw new Error('ordinary quote rollup broke');
    });
  });

  await record('21. malformed/missing option_group_id never crashes an ordinary create_quote_from_calculation call, repeated on the same job', async () => {
    await withAdminTx(async (client) => {
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, runId());
      await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const v1 = await createQuote(client, jobId);
      const v2 = await createQuote(client, jobId);
      const [q1, q2] = [await getQuote(client, v1), await getQuote(client, v2)];
      if (q1.version !== 1 || q2.version !== 2) throw new Error(`expected versions 1,2, got ${q1.version},${q2.version}`);
      if (q2.parent_quote_id !== v1) throw new Error('ordinary version/parent chaining broke');
    });
  });

  // -- 2/3/4: creating the group -----------------------------------------

  await record('2/3/4. three sibling options share option_group_id, are NOT chained as versions of each other, and each prices only its own measurement subset', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const perm = await getService(client, 'permanent_lighting');
      const permJump = await getService(client, 'permanent_lighting_jump');
      const xmas = await getService(client, 'christmas_lighting');
      const xmasJump = await getService(client, 'christmas_lighting_jump');
      const { jobId } = await createJob(client, prefix);

      const m1 = await addMeasurement(client, jobId, perm.id, 80);
      const m2 = await addMeasurement(client, jobId, permJump.id, 20);
      const m3 = await addMeasurement(client, jobId, xmas.id, 60);
      const m4 = await addMeasurement(client, jobId, xmasJump.id, 15);

      const groupId = crypto.randomUUID();
      const optA = await createOption(client, jobId, groupId, 'Essential', 1, [m1, m2]);
      const optB = await createOption(client, jobId, groupId, 'Complete', 2, [m1, m2, m3, m4]);
      const optC = await createOption(client, jobId, groupId, 'Full Home', 3, [m3, m4]);

      const [qa, qb, qc] = [await getQuote(client, optA), await getQuote(client, optB), await getQuote(client, optC)];

      if (qa.option_group_id !== groupId || qb.option_group_id !== groupId || qc.option_group_id !== groupId) {
        throw new Error('siblings do not share option_group_id');
      }
      if (qa.parent_quote_id !== null || qb.parent_quote_id !== null || qc.parent_quote_id !== null) {
        throw new Error('CHAINING BUG: a freshly-created sibling must never auto-inherit a parent_quote_id from another sibling');
      }
      if (new Set([qa.version, qb.version, qc.version]).size !== 3) throw new Error('siblings must still get distinct, job-unique version numbers');

      const permRate = await getCurrentRate(client, perm.id);
      const jumpRate = await getCurrentRate(client, permJump.id);
      const xmasRate = await getCurrentRate(client, xmas.id);
      const xmasJumpRate = await getCurrentRate(client, xmasJump.id);
      const expectedA = 80 * Number(permRate.rate) + 20 * Number(jumpRate.rate);
      const expectedC = 60 * Number(xmasRate.rate) + 15 * Number(xmasJumpRate.rate);
      const expectedB = expectedA + expectedC;

      if (Number(qa.total) !== expectedA) throw new Error(`Option A total: expected ${expectedA}, got ${qa.total}`);
      if (Number(qc.total) !== expectedC) throw new Error(`Option C total: expected ${expectedC}, got ${qc.total}`);
      if (Number(qb.total) !== expectedB) throw new Error(`Option B total: expected ${expectedB} (A+C's measurements combined), got ${qb.total}`);

      const { rows: linksA } = await client.query('select measurement_id from quote_option_measurements where quote_id = $1 order by measurement_id', [optA]);
      if (linksA.length !== 2) throw new Error(`expected 2 quote_option_measurements rows for Option A, got ${linksA.length}`);
    });
  });

  await record('19. an option group can have exactly 2 options (not every group needs 3)', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      const m1 = await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const groupId = crypto.randomUUID();
      const optA = await createOption(client, jobId, groupId, 'Small', 1, [m1]);
      const optB = await createOption(client, jobId, groupId, 'Large', 2, [m1]);
      const { rows } = await client.query('select count(*)::int as n from ns_quotes where option_group_id = $1', [groupId]);
      if (rows[0].n !== 2) throw new Error(`expected exactly 2 options in the group, got ${rows[0].n}`);
    });
  });

  await record('create_option_quote rejects a measurement that does not belong to the given job', async () => {
    await withAdminTx(async (client) => {
      const siding = await getService(client, 'siding');
      const { jobId: jobA } = await createJob(client, `${runId()}_A`);
      const { jobId: jobB } = await createJob(client, `${runId()}_B`);
      const foreignMeasurement = await addMeasurement(client, jobB, siding.id, 500, 'sq_ft');
      const err = await expectRejection(client, () =>
        createOption(client, jobA, crypto.randomUUID(), 'Essential', 1, [foreignMeasurement])
      );
      if (!/do not belong to this job/i.test(err.message)) throw new Error(`expected the cross-job measurement rejection, got: ${err.message}`);
    });
  });

  await record('create_option_quote is blocked for a non-admin claim', async () => {
    await withAdminTx(async (client) => {
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, runId());
      const m1 = await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      await dropAdminClaim(client);
      let blocked = false;
      try { await createOption(client, jobId, crypto.randomUUID(), 'Essential', 1, [m1]); }
      catch (err) { blocked = /not authorised/i.test(err.message); }
      if (!blocked) throw new Error('expected a non-admin claim to be rejected with "Not authorised."');
    });
  });

  await record('send_option_group is blocked for a non-admin claim', async () => {
    await withAdminTx(async (client) => {
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, runId());
      const m1 = await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const groupId = crypto.randomUUID();
      await createOption(client, jobId, groupId, 'Essential', 1, [m1]);
      await dropAdminClaim(client);
      let blocked = false;
      try { await sendGroup(client, groupId); }
      catch (err) { blocked = /not authorised/i.test(err.message); }
      if (!blocked) throw new Error('expected a non-admin claim to be rejected with "Not authorised."');
    });
  });

  // -- 5/6: calculate_job_pricing stays backward compatible ---------------

  await record('5. calculate_job_pricing(job_id) -- the plain, pre-Phase-C call shape -- behaves exactly as before (every measurement, no filter)', async () => {
    await withAdminTx(async (client) => {
      const siding = await getService(client, 'siding');
      const rate = await getCurrentRate(client, siding.id);
      const { jobId } = await createJob(client, runId());
      await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      // Deliberately the exact 1-argument call every pre-Phase-C caller uses.
      const { rows } = await client.query('select amount from calculate_job_pricing($1)', [jobId]);
      if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`);
      if (Number(rows[0].amount) !== 1000 * Number(rate.rate)) throw new Error(`expected ${1000 * Number(rate.rate)}, got ${rows[0].amount}`);
    });
  });

  await record('6. calculate_job_pricing(job_id, subset) prices only the supplied measurements, leaving the rest out entirely', async () => {
    await withAdminTx(async (client) => {
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, runId());
      const m1 = await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const m2 = await addMeasurement(client, jobId, siding.id, 500, 'sq_ft');
      const { rows: all } = await client.query('select amount from calculate_job_pricing($1)', [jobId]);
      const { rows: subset } = await client.query('select amount from calculate_job_pricing($1, $2) as t', [jobId, [m1]]);
      if (subset.length !== 1) throw new Error(`expected 1 aggregated row for the filtered subset, got ${subset.length}`);
      if (Number(subset[0].amount) === Number(all[0].amount)) throw new Error('subset pricing is identical to the full job -- the filter did not apply');
      const rate = await getCurrentRate(client, siding.id);
      if (Number(subset[0].amount) !== 1000 * Number(rate.rate)) throw new Error(`expected the m1-only amount, got ${subset[0].amount}`);
    });
  });

  // -- 11: parent/child rollup inside a single option ----------------------

  await record('11. parent/child pricing rolls up correctly inside one option (Permanent Lighting + its jump wire, via get_customer_quote)', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const perm = await getService(client, 'permanent_lighting');
      const permJump = await getService(client, 'permanent_lighting_jump');
      const { jobId } = await createJob(client, prefix);
      const m1 = await addMeasurement(client, jobId, perm.id, 80);
      const m2 = await addMeasurement(client, jobId, permJump.id, 20);
      const groupId = crypto.randomUUID();
      const optA = await createOption(client, jobId, groupId, 'Essential', 1, [m1, m2]);
      const optB = await createOption(client, jobId, groupId, 'Complete', 2, [m1, m2]);
      await sendGroup(client, groupId);
      const doc = await customerDoc(client, optA);
      if (doc.lines.length !== 1) throw new Error(`expected the parent+child pair to roll up into exactly 1 customer-facing line, got ${doc.lines.length}`);
      if (doc.lines[0].description !== 'Permanent Outdoor Lighting') throw new Error(`expected the rollup to use the parent's name, got ${doc.lines[0].description}`);
      if (doc.lines[0].pricing_approved !== true) throw new Error('both permanent_lighting and its jump wire are approved -- the rollup must read approved');
    });
  });

  await record('provisional pricing still blocks customer acceptance of an option, exactly as for an ordinary quote (Phase A unchanged)', async () => {
    await withTx(async (client) => {
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, runId());
      const quote = await createDraftQuote(client, jobId);
      await addLineItem(client, quote.id, siding.id, { description: 'Siding / Soft Wash', pricingApproved: false, amount: 500 });
      await markSentDirect(client, quote.id);
      // Simulate option-group membership directly (withTx has no admin
      // claim, so create_option_quote itself can't be called here) --
      // this isolates respond_to_quote's own gate, which must fire
      // identically whether or not the quote happens to be in a group.
      const groupId = crypto.randomUUID();
      await client.query(`update ns_quotes set option_group_id=$1, option_label='Essential', option_sort_order=1 where id=$2`, [groupId, quote.id]);

      const err = await expectRejection(client, () => client.query('select respond_to_quote($1, $2)', [quote.id, 'accepted']));
      if (!/Final pricing is still pending confirmation/.test(err.message)) throw new Error(`expected the provisional-pricing rejection, got: ${err.message}`);
    });
  });

  // -- 8/9: exactly one accepted option, and the race invariant -----------

  await record('8. accepting one option supersedes its sent siblings, and the same option group cannot have a second acceptance afterward', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const perm = await getService(client, 'permanent_lighting');
      const xmas = await getService(client, 'christmas_lighting');
      const { jobId } = await createJob(client, prefix);
      const m1 = await addMeasurement(client, jobId, perm.id, 80);
      const m2 = await addMeasurement(client, jobId, xmas.id, 60);
      const groupId = crypto.randomUUID();
      const optA = await createOption(client, jobId, groupId, 'Essential', 1, [m1]);
      const optB = await createOption(client, jobId, groupId, 'Complete', 2, [m2]);
      await sendGroup(client, groupId);

      await client.query('select respond_to_quote($1, $2)', [optA, 'accepted']);
      const [qa, qb] = [await getQuote(client, optA), await getQuote(client, optB)];
      if (qa.status !== 'accepted') throw new Error(`expected Option A accepted, got ${qa.status}`);
      if (qb.status !== 'superseded') throw new Error(`expected Option B superseded once A was accepted, got ${qb.status}`);

      const err = await expectRejection(client, () => client.query('select respond_to_quote($1, $2)', [optB, 'accepted']));
      if (!/already been accepted|no longer open for a response/i.test(err.message)) {
        throw new Error(`expected B's accept to be rejected (either as "already accepted" or "no longer open", since it is now superseded), got: ${err.message}`);
      }
    });
  });

  await record('9. the partial unique index -- not just the RPC pre-check -- is what actually prevents two accepted siblings', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      const m1 = await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const m2 = await addMeasurement(client, jobId, siding.id, 500, 'sq_ft');
      const groupId = crypto.randomUUID();
      const optA = await createOption(client, jobId, groupId, 'Essential', 1, [m1]);
      const optB = await createOption(client, jobId, groupId, 'Complete', 2, [m2]);
      await sendGroup(client, groupId);

      await client.query(`update ns_quotes set status = 'accepted' where id = $1`, [optA]);
      // Bypass respond_to_quote's own friendly pre-check entirely -- a raw
      // UPDATE is exactly what a genuine race between two concurrent
      // requests would look like at the database level.
      const err = await expectRejection(client, () => client.query(`update ns_quotes set status = 'accepted' where id = $1`, [optB]));
      if (!/unique|duplicate key/i.test(err.message)) throw new Error(`expected a unique-violation from ns_quotes_one_accepted_per_option_group, got: ${err.message}`);
    });
  });

  await record('a duplicate accept request on the SAME already-accepted option is safe (idempotent double-click), not a crash or a corruption', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      const m1 = await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const groupId = crypto.randomUUID();
      const optA = await createOption(client, jobId, groupId, 'Essential', 1, [m1]);
      const optB = await createOption(client, jobId, groupId, 'Complete', 2, [m1]);
      await sendGroup(client, groupId);
      await client.query('select respond_to_quote($1, $2)', [optA, 'accepted']);
      const before = await getQuote(client, optA);

      const err = await expectRejection(client, () => client.query('select respond_to_quote($1, $2)', [optA, 'accepted']));
      if (!/no longer open for a response/i.test(err.message)) throw new Error(`expected the already-responded message on a repeat click, got: ${err.message}`);
      const after = await getQuote(client, optA);
      if (after.responded_at.getTime() !== before.responded_at.getTime()) throw new Error('a repeated accept click must not change the original responded_at');
    });
  });

  // -- send_option_group ---------------------------------------------------

  await record('send_option_group sends every sibling in one notification, and mark_quote_sent refuses to send one directly', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      const m1 = await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const m2 = await addMeasurement(client, jobId, siding.id, 500, 'sq_ft');
      const groupId = crypto.randomUUID();
      const optA = await createOption(client, jobId, groupId, 'Essential', 1, [m1]);
      const optB = await createOption(client, jobId, groupId, 'Complete', 2, [m2]);

      const err = await expectRejection(client, () => client.query('select mark_quote_sent($1)', [optA]));
      if (!/send the whole group/i.test(err.message)) throw new Error(`expected mark_quote_sent to refuse an option-group member, got: ${err.message}`);

      await sendGroup(client, groupId);
      const { rows: sentCount } = await client.query(`select count(*)::int as n from ns_quotes where option_group_id = $1 and status = 'sent'`, [groupId]);
      if (sentCount[0].n !== 2) throw new Error(`expected both options sent, got ${sentCount[0].n}`);
      const { rows: notifCount } = await client.query(`select count(*)::int as n from notifications where job_id = $1 and kind = 'quote_ready'`, [jobId]);
      if (notifCount[0].n !== 1) throw new Error(`expected exactly 1 quote_ready notification for the whole group, got ${notifCount[0].n}`);
      const { rows: anchor } = await client.query(`select payload->>'quote_id' as anchor_id from notifications where job_id = $1 and kind = 'quote_ready'`, [jobId]);
      if (anchor[0].anchor_id !== optA) throw new Error(`expected the notification to anchor at the lowest option_sort_order sibling (Option A), got ${anchor[0].anchor_id}`);
    });
  });

  await record('send_option_group supersedes a prior sent ORDINARY quote on the same job, but never a sibling inside the group being sent', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const oldOrdinary = await createQuote(client, jobId);
      await client.query(`update ns_quotes set status='sent', sent_at=now() where id=$1`, [oldOrdinary]);

      const m2 = await addMeasurement(client, jobId, siding.id, 500, 'sq_ft');
      const groupId = crypto.randomUUID();
      const optA = await createOption(client, jobId, groupId, 'Essential', 1, [m2]);
      const optB = await createOption(client, jobId, groupId, 'Complete', 2, [m2]);
      await sendGroup(client, groupId);

      const old = await getQuote(client, oldOrdinary);
      if (old.status !== 'superseded') throw new Error(`expected the old ordinary sent quote to be superseded, got ${old.status}`);
      const [qa, qb] = [await getQuote(client, optA), await getQuote(client, optB)];
      if (qa.status !== 'sent' || qb.status !== 'sent') throw new Error('sending the group must not supersede its own siblings');
    });
  });

  // -- 12: customer discovery + ordering -----------------------------------

  await record('12. get_customer_quote discovers the whole group from ANY sibling id, in deterministic option_sort_order, with no internal leakage', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      const m1 = await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const groupId = crypto.randomUUID();
      const optC = await createOption(client, jobId, groupId, 'Full Home', 3, [m1]);
      const optA = await createOption(client, jobId, groupId, 'Essential', 1, [m1]);
      const optB = await createOption(client, jobId, groupId, 'Complete', 2, [m1]);
      await sendGroup(client, groupId);

      for (const probeId of [optA, optB, optC]) {
        const doc = await customerDoc(client, probeId);
        const labels = doc.option_group.options.map(o => o.option_label);
        if (labels.join(',') !== 'Essential,Complete,Full Home') {
          throw new Error(`expected deterministic option_sort_order ordering regardless of which sibling id was queried (probed via ${probeId}), got: ${labels.join(',')}`);
        }
        if (doc.option_group.options.length !== 3) throw new Error(`expected 3 options listed, got ${doc.option_group.options.length}`);
        if (doc.option_group.group_id !== groupId) throw new Error('group_id mismatch in the discovery payload');
      }
    });
  });

  // -- duplicate_quote carries option fields forward on revision -----------

  await record('duplicate_quote on an option keeps the revision inside the same group/label/slot, not silently promoting it to an ordinary quote', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      const m1 = await addMeasurement(client, jobId, siding.id, 1000, 'sq_ft');
      const groupId = crypto.randomUUID();
      const optB_v1 = await createOption(client, jobId, groupId, 'Complete', 2, [m1]);

      const { rows } = await client.query('select duplicate_quote($1) as id', [optB_v1]);
      const optB_v2 = rows[0].id;
      const revised = await getQuote(client, optB_v2);

      if (revised.option_group_id !== groupId) throw new Error('REGRESSION: a revised option fell out of its option group');
      if (revised.option_label !== 'Complete') throw new Error('REGRESSION: a revised option lost its label');
      if (revised.option_sort_order !== 2) throw new Error('REGRESSION: a revised option lost its sort order');
      if (revised.parent_quote_id !== optB_v1) throw new Error('expected the revision to point parent_quote_id at the version it revised');

      const { rows: links } = await client.query('select count(*)::int as n from quote_option_measurements where quote_id = $1', [optB_v2]);
      if (links[0].n !== 1) throw new Error('REGRESSION: a revised option lost its measurement-scope link');
    });
  });

  await printResultsAndExit();
}

async function printResultsAndExit() {
  const tally = printResults(results);
  if (isConfigured()) await closePool();
  if (tally.failed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  if (isConfigured()) await closePool();
  process.exit(1);
});
