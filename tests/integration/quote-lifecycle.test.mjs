// Sections B, C, R -- create_quote_from_calculation, duplicate_quote, and
// quote-snapshot immutability, tested through the real RPCs (both
// is_admin()-gated) rather than by hand-mirroring their INSERT shape.

import { createIntegrationRecorder, printResults } from './reporter.mjs';
import { withAdminTx, dropAdminClaim, closePool, runId, isConfigured } from './db-client.mjs';
import { createJob, getService, getCurrentRate } from './helpers.mjs';

const { results, record } = createIntegrationRecorder(isConfigured());

async function createQuote(client, jobId, kind = 'final') {
  const { rows } = await client.query('select create_quote_from_calculation($1, $2) as id', [jobId, kind]);
  return rows[0].id;
}
async function duplicateQuote(client, quoteId) {
  const { rows } = await client.query('select duplicate_quote($1) as id', [quoteId]);
  return rows[0].id;
}
async function getQuote(client, quoteId) {
  const { rows } = await client.query('select * from ns_quotes where id = $1', [quoteId]);
  return rows[0];
}
async function getLines(client, quoteId) {
  const { rows } = await client.query(
    `select li.*, s.key as service_key from quote_line_items li join services s on s.id = li.service_id
     where li.quote_id = $1 order by li.sort_order`,
    [quoteId]
  );
  return rows;
}

async function main() {
  await record('create_quote_from_calculation is blocked for a non-admin claim', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,100,'sq_ft')`, [jobId, siding.id]);

      await dropAdminClaim(client);
      let blocked = false;
      try { await createQuote(client, jobId); } catch (err) { blocked = /not authorised/i.test(err.message); }
      if (!blocked) throw new Error('expected a non-admin claim to be rejected with "Not authorised."');
    });
  });

  await record('quote creation snapshots unit_rate, modifier_factor, amount, and pricing_approved correctly for an approved service', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const rate = await getCurrentRate(client, siding.id);
      if (rate.approval_status !== 'approved') throw new Error('fixture assumption broke: siding is expected to be approved');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,1000,'sq_ft')`, [jobId, siding.id]);

      const quoteId = await createQuote(client, jobId);
      const [line] = await getLines(client, quoteId);
      if (Number(line.unit_rate) !== Number(rate.rate)) throw new Error(`expected unit_rate ${rate.rate}, got ${line.unit_rate}`);
      if (Number(line.amount) !== 1000 * Number(rate.rate)) throw new Error(`expected amount ${1000 * Number(rate.rate)}, got ${line.amount}`);
      if (line.pricing_approved !== true) throw new Error('expected pricing_approved=true for an approved service');
    });
  });

  await record('HISTORICAL BUG (Phase 3): an unpriced child measurement does not crash quote creation, and snapshots unit_rate as 0, not NULL', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const valley = await getService(client, 'winter_deicing_cables_valley_1st');
      const rate = await getCurrentRate(client, valley.id);
      if (rate !== null) throw new Error('fixture assumption broke: the valley child is expected to have no pricing_rules row at all');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,2,'each')`, [jobId, valley.id]);

      const quoteId = await createQuote(client, jobId); // must not throw a unit_rate NOT NULL violation
      const [line] = await getLines(client, quoteId);
      if (line.unit_rate === null) throw new Error('unit_rate is NULL -- the historical NOT NULL-violation bug is back');
      if (Number(line.unit_rate) !== 0) throw new Error(`expected unit_rate snapshot of 0 for an unpriced service, got ${line.unit_rate}`);
      if (line.pricing_approved !== false) throw new Error('an unpriced child must never snapshot as approved');
    });
  });

  await record('quote creation correctly flows auth.uid() into created_by', async () => {
    await withAdminTx(async (client, adminId) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,1000,'sq_ft')`, [jobId, siding.id]);
      const quoteId = await createQuote(client, jobId);
      const quote = await getQuote(client, quoteId);
      if (quote.created_by !== adminId) throw new Error(`expected created_by=${adminId}, got ${quote.created_by}`);
    });
  });

  await record('duplicate_quote is blocked for a non-admin claim', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,100,'sq_ft')`, [jobId, siding.id]);
      const quoteId = await createQuote(client, jobId);

      await dropAdminClaim(client);
      let blocked = false;
      try { await duplicateQuote(client, quoteId); } catch (err) { blocked = /not authorised/i.test(err.message); }
      if (!blocked) throw new Error('expected a non-admin claim to be rejected with "Not authorised."');
    });
  });

  await record('duplicate_quote: new version created, old quote left intact, lines/snapshot/approval copied, parent_quote_id set correctly', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,1000,'sq_ft')`, [jobId, siding.id]);
      const v1 = await createQuote(client, jobId);
      await client.query(`update ns_quotes set status='sent', sent_at=now() where id=$1`, [v1]);

      const v2 = await duplicateQuote(client, v1);
      const [quote1, quote2] = [await getQuote(client, v1), await getQuote(client, v2)];
      const [lines1, lines2] = [await getLines(client, v1), await getLines(client, v2)];

      if (quote2.version !== quote1.version + 1) throw new Error(`expected v2.version = v1.version+1, got ${quote1.version} -> ${quote2.version}`);
      if (quote2.parent_quote_id !== v1) throw new Error(`expected v2.parent_quote_id = v1's id, got ${quote2.parent_quote_id}`);
      if (quote2.status !== 'draft') throw new Error(`expected a fresh duplicate to start as draft, got ${quote2.status}`);
      if (quote1.status !== 'sent') throw new Error('duplicating must not change the original quote\'s own status');
      if (lines2.length !== lines1.length) throw new Error(`expected ${lines1.length} copied lines, got ${lines2.length}`);
      if (Number(lines2[0].amount) !== Number(lines1[0].amount)) throw new Error('duplicated line amount does not match the frozen snapshot');
      if (lines2[0].pricing_approved !== lines1[0].pricing_approved) throw new Error('duplicated line did not preserve pricing_approved');
      if (Number(quote2.subtotal) !== Number(quote1.subtotal)) throw new Error('duplicated quote subtotal does not match');
    });
  });

  await record('duplicate_quote preserves child-service lines (Heating Wire + an unpriced valley child)', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const hw = await getService(client, 'winter_deicing_cables');
      const valley = await getService(client, 'winter_deicing_cables_valley_1st');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,50,'linear_ft')`, [jobId, hw.id]);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,2,'each')`, [jobId, valley.id]);
      const v1 = await createQuote(client, jobId);
      const v2 = await duplicateQuote(client, v1);

      const lines2 = await getLines(client, v2);
      const childLine = lines2.find((l) => l.service_key === 'winter_deicing_cables_valley_1st');
      if (!childLine) throw new Error('child line was not carried over by duplication');
      if (Number(childLine.unit_rate) !== 0) throw new Error('duplicated child line should still snapshot unit_rate=0');
    });
  });

  await record('FINDING: duplicate_quote does NOT copy internal_notes -- a fresh draft starts with none, even if the source quote has one', async () => {
    // This directly corrects an earlier (Phase 15) report, which claimed
    // internal notes were "preserved verbatim" on duplication -- that
    // claim came from a hand-simulation of duplicate_quote written before
    // this suite's admin-auth technique existed, not from calling the
    // real function. The real function's own INSERT column list simply
    // never includes internal_notes. Documented here, not silently
    // "fixed" -- whether notes SHOULD carry forward is a product decision,
    // not something to decide unilaterally while writing a test.
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,1000,'sq_ft')`, [jobId, siding.id]);
      const v1 = await createQuote(client, jobId);
      await client.query(`update ns_quotes set internal_notes = 'a note only on v1' where id = $1`, [v1]);

      const v2 = await duplicateQuote(client, v1);
      const [quote1, quote2] = [await getQuote(client, v1), await getQuote(client, v2)];
      if (quote1.internal_notes !== 'a note only on v1') throw new Error('duplicating must not touch the original\'s own internal_notes');
      if (quote2.internal_notes !== null) {
        throw new Error(`expected the real duplicate_quote to leave internal_notes unset on the new version, got ${JSON.stringify(quote2.internal_notes)} -- if this now fails, duplicate_quote has been changed to copy it, and this test (and the finding above) should be updated to match`);
      }
    });
  });

  await record('QUOTE INTEGRITY: an already-created quote is immutable to later pricing-configuration changes', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,1000,'sq_ft')`, [jobId, siding.id]);
      const quoteId = await createQuote(client, jobId);
      const [before] = await getLines(client, quoteId);

      // Change the live price book, inside this same (rolled-back) transaction
      await client.query(`update pricing_rules set effective_to = now() where service_id = $1 and effective_to is null`, [siding.id]);
      await client.query(
        `insert into pricing_rules (service_id, rate, minimum, approval_status, effective_from) values ($1, 999, 0, 'approved', now())`,
        [siding.id]
      );

      const [after] = await getLines(client, quoteId);
      if (Number(after.amount) !== Number(before.amount)) {
        throw new Error(`existing quote changed after a price-book update: was ${before.amount}, now ${after.amount} -- historical quotes must stay frozen`);
      }

      // Prove the new rate is genuinely live (this isn't just "the function
      // can't see the change") by pricing a brand new job with it.
      const { jobId: jobId2 } = await createJob(client, `${prefix}_2`);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,1000,'sq_ft')`, [jobId2, siding.id]);
      const { rows: newPricing } = await client.query('select amount from calculate_job_pricing($1)', [jobId2]);
      if (Number(newPricing[0].amount) !== 1000 * 999) {
        throw new Error(`expected a brand-new job to use the new $999 rate (999000), got ${newPricing[0].amount}`);
      }
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
