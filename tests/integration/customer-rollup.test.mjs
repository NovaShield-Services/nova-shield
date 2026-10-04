// Sections D, E -- get_customer_quote's parent/child rollup and
// pricing_approved propagation, tested through the real function on a
// quote actually built by create_quote_from_calculation (not a hand-built
// quote_line_items row shaped to look like its output).

import { createIntegrationRecorder, printResults } from './reporter.mjs';
import { withAdminTx, closePool, runId, isConfigured } from './db-client.mjs';
import { createJob, getService } from './helpers.mjs';

const { results, record } = createIntegrationRecorder(isConfigured());

async function createAndSendQuote(client, jobId) {
  const { rows } = await client.query('select create_quote_from_calculation($1, $2) as id', [jobId, 'final']);
  const quoteId = rows[0].id;
  await client.query(`update ns_quotes set status='sent', sent_at=now() where id=$1`, [quoteId]);
  return quoteId;
}
async function getCustomerQuote(client, quoteId) {
  const { rows } = await client.query('select get_customer_quote($1) as doc', [quoteId]);
  return rows[0].doc;
}

async function main() {
  await record('all three real parent/child pairs roll up into one line each, with no internal key or child-service leakage', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const services = {};
      for (const key of ['permanent_lighting', 'permanent_lighting_jump', 'christmas_lighting', 'christmas_lighting_jump', 'winter_deicing_cables', 'winter_deicing_cables_valley_1st']) {
        services[key] = await getService(client, key);
      }
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,80,'linear_ft')`, [jobId, services.permanent_lighting.id]);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,20,'linear_ft')`, [jobId, services.permanent_lighting_jump.id]);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,60,'linear_ft')`, [jobId, services.christmas_lighting.id]);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,15,'linear_ft')`, [jobId, services.christmas_lighting_jump.id]);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,50,'linear_ft')`, [jobId, services.winter_deicing_cables.id]);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,2,'each')`, [jobId, services.winter_deicing_cables_valley_1st.id]);

      const quoteId = await createAndSendQuote(client, jobId);
      const doc = await getCustomerQuote(client, quoteId);

      if (doc.lines.length !== 3) throw new Error(`expected exactly 3 customer-facing lines (one per parent), got ${doc.lines.length}: ${JSON.stringify(doc.lines.map((l) => l.description))}`);
      const descriptions = doc.lines.map((l) => l.description);
      for (const leak of ['Jump Wire', 'Valley', 'winter_deicing_cables', 'permanent_lighting', 'group_key', 'scope']) {
        if (descriptions.some((d) => d.includes(leak))) throw new Error(`a customer-facing description leaked internal detail: ${JSON.stringify(descriptions)}`);
      }

      const perm = doc.lines.find((l) => l.description === 'Permanent Outdoor Lighting');
      const xmas = doc.lines.find((l) => l.description === 'Seasonal Christmas Lighting');
      const hw = doc.lines.find((l) => l.description === 'Heating Wire Installation');
      if (!perm || !xmas || !hw) throw new Error('one of the three expected parent lines is missing');

      if (Number(perm.amount) !== 80 * 5 + 20 * 2) throw new Error(`Permanent Lighting rollup amount wrong: ${perm.amount}`);
      if (Number(xmas.amount) !== 60 * 5 + 15 * 2) throw new Error(`Christmas Lighting rollup amount wrong: ${xmas.amount}`);
      if (Number(hw.amount) !== 50 * 14) throw new Error(`Heating Wire rollup amount wrong (valley child contributes $0): ${hw.amount}`);
    });
  });

  await record('pricing_approved propagates via bool_and: a fully-approved pair rolls up approved', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const perm = await getService(client, 'permanent_lighting');
      const permJump = await getService(client, 'permanent_lighting_jump');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,80,'linear_ft')`, [jobId, perm.id]);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,20,'linear_ft')`, [jobId, permJump.id]);
      const quoteId = await createAndSendQuote(client, jobId);
      const doc = await getCustomerQuote(client, quoteId);
      const line = doc.lines.find((l) => l.description === 'Permanent Outdoor Lighting');
      if (line.pricing_approved !== true) throw new Error('both permanent_lighting and its jump wire are approved -- the rollup must be approved too');
    });
  });

  await record('pricing_approved propagates via bool_and: an unpriced child makes the WHOLE rolled-up line unapproved, even though the parent itself is provisional-not-unpriced', async () => {
    // The second historical bug case: an unpriced child must not "hide"
    // behind an approved-looking parent, or vice versa -- bool_and means
    // ANY unapproved member of the group makes the whole group unapproved.
    await withAdminTx(async (client) => {
      const prefix = runId();
      const hw = await getService(client, 'winter_deicing_cables');
      const valley = await getService(client, 'winter_deicing_cables_valley_1st');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,50,'linear_ft')`, [jobId, hw.id]);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,2,'each')`, [jobId, valley.id]);
      const quoteId = await createAndSendQuote(client, jobId);
      const doc = await getCustomerQuote(client, quoteId);
      const line = doc.lines.find((l) => l.description === 'Heating Wire Installation');
      if (line.pricing_approved !== false) throw new Error('Heating Wire is provisional and its valley child is unpriced -- the rollup must read unapproved');
    });
  });

  await record('a lone approved service (no children involved) rolls up as its own single line, unaffected by provisional services elsewhere on the same quote', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const hw = await getService(client, 'winter_deicing_cables');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,1000,'sq_ft')`, [jobId, siding.id]);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,50,'linear_ft')`, [jobId, hw.id]);
      const quoteId = await createAndSendQuote(client, jobId);
      const doc = await getCustomerQuote(client, quoteId);
      const sidingLine = doc.lines.find((l) => l.description === 'Siding / Soft Wash');
      if (!sidingLine) throw new Error('siding line missing from rollup');
      if (sidingLine.pricing_approved !== true) throw new Error('siding is independently approved and must not be dragged down by heating wire being provisional on the same quote');
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
