// Section I -- baseline today's ns_quotes semantics (version, parent_quote_id,
// status, kind, and how the customer URL maps to a visible quote) BEFORE any
// Permanent Lighting option-group work exists, so that future work can't
// silently change these without a test noticing.
//
// The customer-facing URL (site/js/pages/quote.js) is literally
// `quote.html?id=<ns_quotes.id>` -- there is no separate access token. The
// one and only gate is get_customer_quote's own status/is_admin() check
// below; there is no option_group_id/option_label column yet (the Phase 16
// report's proposed, additive, nullable columns for option-group work).

import { createIntegrationRecorder, printResults } from './reporter.mjs';
import { withAdminTx, dropAdminClaim, expectRejection, closePool, runId, isConfigured } from './db-client.mjs';
import { createJob, getService } from './helpers.mjs';

const { results, record } = createIntegrationRecorder(isConfigured());

async function createQuote(client, jobId, kind = 'final') {
  const { rows } = await client.query('select create_quote_from_calculation($1, $2) as id', [jobId, kind]);
  return rows[0].id;
}
async function getQuote(client, quoteId) {
  const { rows } = await client.query('select * from ns_quotes where id = $1', [quoteId]);
  return rows[0];
}
async function getCustomerQuote(client, quoteId) {
  const { rows } = await client.query('select get_customer_quote($1) as doc', [quoteId]);
  return rows[0].doc;
}

async function main() {
  await record('BASELINE: calling create_quote_from_calculation twice on the same job produces version 1 then version 2, with v2.parent_quote_id pointing at v1', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,1000,'sq_ft')`, [jobId, siding.id]);

      const v1 = await createQuote(client, jobId);
      const v2 = await createQuote(client, jobId);
      const [q1, q2] = [await getQuote(client, v1), await getQuote(client, v2)];

      if (q1.version !== 1) throw new Error(`expected the first quote on a job to be version 1, got ${q1.version}`);
      if (q1.parent_quote_id !== null) throw new Error(`expected the first quote to have no parent, got ${q1.parent_quote_id}`);
      if (q2.version !== 2) throw new Error(`expected the second quote on the same job to be version 2, got ${q2.version}`);
      if (q2.parent_quote_id !== v1) throw new Error(`expected the second quote's parent_quote_id to be the first quote's id, got ${q2.parent_quote_id}`);
    });
  });

  await record('BASELINE: kind is a hard 2-value CHECK (preliminary_estimate/final) -- a hypothetical 3rd value for option tiers is rejected at the DB level', async () => {
    // Confirms the Phase 16 report's own reasoning for why option tiers must
    // be a new nullable column (option_group_id/option_label), not a 3rd
    // `kind` value -- this constraint is exactly what rules that shortcut out.
    await withAdminTx(async (client) => {
      const prefix = runId();
      const { jobId } = await createJob(client, prefix);
      const err = await expectRejection(client, () =>
        client.query(`insert into ns_quotes (job_id, version, kind, status, subtotal, total) values ($1, 99, 'option_tier', 'draft', 0, 0)`, [jobId])
      );
      if (!/ns_quotes_kind_check/.test(err.message)) throw new Error(`expected the kind CHECK constraint to fire, got: ${err.message}`);
    });
  });

  await record('BASELINE: get_customer_quote hides a draft quote from a non-admin (the customer URL for an unsent quote shows nothing)', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,1000,'sq_ft')`, [jobId, siding.id]);
      const quoteId = await createQuote(client, jobId); // left as draft

      await dropAdminClaim(client);
      const err = await expectRejection(client, () => getCustomerQuote(client, quoteId));
      if (!/Quote not found/i.test(err.message)) throw new Error(`expected "Quote not found." for a draft quote viewed as a non-admin, got: ${err.message}`);
    });
  });

  await record('BASELINE: an admin can preview a draft quote through the same get_customer_quote RPC the customer URL uses', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,1000,'sq_ft')`, [jobId, siding.id]);
      const quoteId = await createQuote(client, jobId); // still draft, admin claim still active

      const doc = await getCustomerQuote(client, quoteId);
      if (doc.status !== 'draft') throw new Error(`expected the admin preview to show status 'draft', got ${doc.status}`);
    });
  });

  await record('BASELINE: declined, superseded, and expired quotes all stay visible at their own URL forever -- there is no separate expiry enforcement', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const { jobId } = await createJob(client, prefix);

      for (const status of ['declined', 'superseded', 'expired']) {
        const { rows } = await client.query(
          `insert into ns_quotes (job_id, version, kind, status, subtotal, total) values ($1, $2, 'final', $3, 500, 500) returning id`,
          [jobId, { declined: 11, superseded: 12, expired: 13 }[status], status]
        );
        const quoteId = rows[0].id;
        await dropAdminClaim(client);
        const doc = await getCustomerQuote(client, quoteId);
        if (doc.status !== status) throw new Error(`expected a '${status}' quote to remain visible at its own URL with that status, got ${doc.status}`);
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
