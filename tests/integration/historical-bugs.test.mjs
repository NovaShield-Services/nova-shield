// Section Q -- a dedicated, minimal regression canary for each of the 5
// historical bugs this project has already found and fixed. Each one has
// broader functional coverage elsewhere (named below); this file exists so
// there is ONE place that maps 1:1 to the 5 numbered bugs and fails loudly,
// by bug number, if any of them ever comes back.
//
// Bug 4 (Fence Height mis-keying) has no other coverage anywhere in this
// suite -- Phase 10.5 only ever verified it through the mocked UI test
// harness, never against the real database -- so it gets a full, fresh
// real-DB test here, not just a canary.

import { createIntegrationRecorder, printResults } from './reporter.mjs';
import { withAdminTx, withTx, expectRejection, closePool, runId, isConfigured } from './db-client.mjs';
import { createJob, createSection, createMeasurement, attachModifier, getService, getModifier, createDraftQuote, addLineItem, markSentDirect } from './helpers.mjs';

const { results, record } = createIntegrationRecorder(isConfigured());

async function main() {
  await record('BUG 1 (Phase 3): an unpriced child measurement snapshots unit_rate as 0, never NULL -- full coverage in quote-lifecycle.test.mjs', async () => {
    await withAdminTx(async (client) => {
      const valley = await getService(client, 'winter_deicing_cables_valley_1st');
      const { jobId } = await createJob(client, runId());
      await createMeasurement(client, jobId, valley.id, { quantity: 2, unit: 'each' });

      const { rows } = await client.query('select create_quote_from_calculation($1, $2) as id', [jobId, 'final']);
      const { rows: lines } = await client.query('select unit_rate from quote_line_items where quote_id = $1', [rows[0].id]);
      if (lines[0].unit_rate === null) throw new Error('BUG 1 REGRESSED: unit_rate is NULL for an unpriced child');
      if (Number(lines[0].unit_rate) !== 0) throw new Error(`expected unit_rate 0, got ${lines[0].unit_rate}`);
    });
  });

  await record('BUG 2: an unpriced child never borrows its approved parent\'s approval on the customer rollup -- full coverage in customer-rollup.test.mjs', async () => {
    await withAdminTx(async (client) => {
      const hw = await getService(client, 'winter_deicing_cables'); // provisional parent
      const valley = await getService(client, 'winter_deicing_cables_valley_1st'); // unpriced child
      const { jobId } = await createJob(client, runId());
      await createMeasurement(client, jobId, hw.id, { quantity: 50, unit: 'linear_ft' });
      await createMeasurement(client, jobId, valley.id, { quantity: 2, unit: 'each' });

      const { rows } = await client.query('select create_quote_from_calculation($1, $2) as id', [jobId, 'final']);
      await client.query(`update ns_quotes set status = 'sent', sent_at = now() where id = $1`, [rows[0].id]);
      const { rows: docRows } = await client.query('select get_customer_quote($1) as doc', [rows[0].id]);
      const line = docRows[0].doc.lines.find((l) => l.description === 'Heating Wire Installation');
      if (line.pricing_approved !== false) throw new Error('BUG 2 REGRESSED: the rollup reads approved even though a child measurement is unpriced');
    });
  });

  await record('BUG 3: no internal service key, group key, or child-only label leaks into a customer-facing rollup line -- full coverage in customer-rollup.test.mjs', async () => {
    await withAdminTx(async (client) => {
      const hw = await getService(client, 'winter_deicing_cables');
      const valley = await getService(client, 'winter_deicing_cables_valley_1st');
      const { jobId } = await createJob(client, runId());
      await createMeasurement(client, jobId, hw.id, { quantity: 50, unit: 'linear_ft' });
      await createMeasurement(client, jobId, valley.id, { quantity: 2, unit: 'each' });

      const { rows } = await client.query('select create_quote_from_calculation($1, $2) as id', [jobId, 'final']);
      await client.query(`update ns_quotes set status = 'sent', sent_at = now() where id = $1`, [rows[0].id]);
      const { rows: docRows } = await client.query('select get_customer_quote($1) as doc', [rows[0].id]);
      const descriptions = docRows[0].doc.lines.map((l) => l.description);
      for (const leak of ['winter_deicing_cables_valley_1st', 'winter_deicing_cables', 'Valley', 'group_key']) {
        if (descriptions.some((d) => d.includes(leak))) throw new Error(`BUG 3 REGRESSED: internal detail leaked into a customer-facing description: ${JSON.stringify(descriptions)}`);
      }
    });
  });

  await record('BUG 4 (Phase 10.5): fence_height drives fence pricing, while the generic section-level building height (storeys) has no effect on it at all', async () => {
    // Pre-10.5, Fence's height modifier was keyed under the same generic,
    // inert group_key the calculation engine associates with section-driven
    // storeys-based factors elsewhere (siding) -- so a fence measurement's
    // own chosen height option never actually multiplied anything. The fix
    // re-keyed it to 'fence_height', a group_key no section-driven lookup
    // for any other service will ever match. Proven here two ways: the
    // modifier's real multiplier value (1.1 for 'tall') is what actually
    // applies, and it stays exactly that value whether the fence sits in a
    // 1-storey or 2-storey section -- the generic height dimension never
    // touches it either way.
    await withAdminTx(async (client) => {
      const fence = await getService(client, 'fence');
      const tall = await getModifier(client, 'fence', 'fence_height', 'tall');
      if (Number(tall.value) === 1) throw new Error('fixture assumption broke: fence_height/tall is expected to be a real, non-1.0 multiplier');

      const { jobId: jobA } = await createJob(client, `${runId()}_A`);
      const secA = await createSection(client, jobA, { storeys: '2_storey' });
      const mA = await createMeasurement(client, jobA, fence.id, { sectionId: secA.id, quantity: 80, unit: 'linear_ft' });
      await attachModifier(client, mA.id, tall.id);

      const { jobId: jobB } = await createJob(client, `${runId()}_B`);
      const secB = await createSection(client, jobB, { storeys: '1_storey' });
      const mB = await createMeasurement(client, jobB, fence.id, { sectionId: secB.id, quantity: 80, unit: 'linear_ft' });
      await attachModifier(client, mB.id, tall.id);

      const { rows: rowsA } = await client.query('select modifier_factor from calculate_job_pricing($1) where service_id = $2', [jobA, fence.id]);
      const { rows: rowsB } = await client.query('select modifier_factor from calculate_job_pricing($1) where service_id = $2', [jobB, fence.id]);

      if (Number(rowsA[0].modifier_factor) !== Number(tall.value)) throw new Error(`BUG 4 REGRESSED: fence_height='tall' should apply its real multiplier (${tall.value}), got ${rowsA[0].modifier_factor} in a 2-storey section`);
      if (Number(rowsB[0].modifier_factor) !== Number(tall.value)) throw new Error(`BUG 4 REGRESSED: fence_height='tall' should apply its real multiplier (${tall.value}), got ${rowsB[0].modifier_factor} in a 1-storey section`);
      if (Number(rowsA[0].modifier_factor) !== Number(rowsB[0].modifier_factor)) throw new Error('BUG 4 REGRESSED: the generic section storeys value is affecting fence pricing -- the same fence_height selection produced two different factors');
    });
  });

  await record('BUG 5 (Phase 16/A): a customer cannot accept a quote with unapproved pricing -- full coverage in acceptance.test.mjs', async () => {
    await withTx(async (client) => {
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, runId());
      const quote = await createDraftQuote(client, jobId);
      await addLineItem(client, quote.id, siding.id, { description: 'Siding / Soft Wash', pricingApproved: false, amount: 500 });
      await markSentDirect(client, quote.id);

      const err = await expectRejection(client, () => client.query('select respond_to_quote($1, $2)', [quote.id, 'accepted']));
      if (!/Final pricing is still pending confirmation/.test(err.message)) throw new Error(`BUG 5 REGRESSED: expected the provisional-pricing rejection, got: ${err.message}`);
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
