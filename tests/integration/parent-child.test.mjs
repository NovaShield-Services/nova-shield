// Section J -- the generic parent/child model, proven once against THREE
// real service pairs (Heating Wire, Permanent Lighting, Christmas Lighting)
// through ONE shared assertion function, not three service-specific test
// bodies. Every expected value below is read from the real database (each
// pair's own current rate/approval state) rather than hardcoded, since the
// point is to prove the MECHANISM is generic, not to re-assert one pair's
// known numbers.
//
// This deliberately covers two pairs whose child is itself priced/approved
// (Permanent Lighting + its jump wire, Christmas Lighting + its jump wire)
// alongside the one pair whose child is genuinely unpriced (Heating Wire +
// its valley child, already covered from the modifier-inheritance angle in
// pricing-engine.test.mjs) -- proving child rows never inherit the parent's
// rate either way, which pricing-engine.test.mjs's single Heating-Wire case
// could not distinguish (0 vs "inherited" both look like 0 there).

import { createIntegrationRecorder, printResults } from './reporter.mjs';
import { withAdminTx, closePool, runId, isConfigured } from './db-client.mjs';
import { createJob, getService, getCurrentRate } from './helpers.mjs';

const { results, record } = createIntegrationRecorder(isConfigured());

const PAIRS = [
  { parentKey: 'winter_deicing_cables', childKey: 'winter_deicing_cables_valley_1st', parentQty: 50, childQty: 2, unit: 'linear_ft', childUnit: 'each' },
  { parentKey: 'permanent_lighting', childKey: 'permanent_lighting_jump', parentQty: 80, childQty: 20, unit: 'linear_ft', childUnit: 'linear_ft' },
  { parentKey: 'christmas_lighting', childKey: 'christmas_lighting_jump', parentQty: 60, childQty: 15, unit: 'linear_ft', childUnit: 'linear_ft' },
];

/** The one generic assertion, run once per pair. Every "expected" value is
 *  derived from the pair's own real rows, never a literal pulled from one
 *  specific service. */
async function assertGenericParentChild(client, prefix, { parentKey, childKey, parentQty, childQty, unit, childUnit }) {
  const parent = await getService(client, parentKey);
  const child = await getService(client, childKey);
  if (child.parent_key !== parent.key) throw new Error(`fixture assumption broke: ${childKey}.parent_key should be '${parent.key}', got ${child.parent_key}`);

  const parentRate = await getCurrentRate(client, parent.id);
  const childRate = await getCurrentRate(client, child.id); // may legitimately be null (unpriced)

  const { jobId } = await createJob(client, prefix);
  await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,$3,$4)`, [jobId, parent.id, parentQty, unit]);
  await client.query(`insert into job_measurements (job_id, service_id, quantity, unit) values ($1,$2,$3,$4)`, [jobId, child.id, childQty, childUnit]);

  // -- generic layer 1: calculate_job_pricing gives each service its own row/rate
  const { rows: priced } = await client.query('select * from calculate_job_pricing($1)', [jobId]);
  if (priced.length !== 2) throw new Error(`[${parentKey}] expected exactly 2 priced rows (parent+child), got ${priced.length}`);
  const parentRow = priced.find((r) => r.service_id === parent.id);
  const childRow = priced.find((r) => r.service_id === child.id);
  if (!parentRow || !childRow) throw new Error(`[${parentKey}] expected one row for the parent and one for the child`);

  const expectedParentRate = parentRate ? Number(parentRate.rate) : 0;
  const expectedChildRate = childRate ? Number(childRate.rate) : 0;
  if (Number(parentRow.unit_rate) !== expectedParentRate) throw new Error(`[${parentKey}] expected parent unit_rate ${expectedParentRate}, got ${parentRow.unit_rate}`);
  if (Number(childRow.unit_rate) !== expectedChildRate) throw new Error(`[${childKey}] expected child unit_rate ${expectedChildRate}, got ${childRow.unit_rate}`);
  if (Number(childRow.unit_rate) === Number(parentRow.unit_rate) && expectedParentRate !== expectedChildRate) {
    throw new Error(`[${childKey}] child row appears to have inherited the parent's rate`);
  }

  // -- generic layer 2: create_quote_from_calculation snapshots the same split
  const { rows: qrows } = await client.query('select create_quote_from_calculation($1, $2) as id', [jobId, 'final']);
  const quoteId = qrows[0].id;
  const { rows: lines } = await client.query('select * from quote_line_items where quote_id = $1', [quoteId]);
  if (lines.length !== 2) throw new Error(`[${parentKey}] expected 2 snapshotted line items, got ${lines.length}`);
  const parentLine = lines.find((l) => l.service_id === parent.id);
  const childLine = lines.find((l) => l.service_id === child.id);
  const expectedParentApproved = (parentRate?.approval_status ?? 'unpriced') === 'approved';
  const expectedChildApproved = (childRate?.approval_status ?? 'unpriced') === 'approved';
  if (parentLine.pricing_approved !== expectedParentApproved) throw new Error(`[${parentKey}] expected parent line pricing_approved=${expectedParentApproved}, got ${parentLine.pricing_approved}`);
  if (childLine.pricing_approved !== expectedChildApproved) throw new Error(`[${childKey}] expected child line pricing_approved=${expectedChildApproved}, got ${childLine.pricing_approved}`);

  // -- generic layer 3: get_customer_quote rolls both rows into exactly one
  //    line, named after the PARENT service's own name (read from the data,
  //    not hardcoded), with bool_and approval and no internal key leakage.
  await client.query(`update ns_quotes set status = 'sent', sent_at = now() where id = $1`, [quoteId]);
  const { rows: drows } = await client.query('select get_customer_quote($1) as doc', [quoteId]);
  const doc = drows[0].doc;
  if (doc.lines.length !== 1) throw new Error(`[${parentKey}] expected exactly 1 customer-facing line for this parent/child pair, got ${doc.lines.length}`);
  const line = doc.lines[0];
  if (line.description !== parent.name) throw new Error(`[${parentKey}] expected the rolled-up line's description to be the parent's own name '${parent.name}', got '${line.description}'`);
  if (line.description.includes(child.name)) throw new Error(`[${childKey}] the child's own name leaked into the customer-facing description`);
  const expectedRollupApproved = expectedParentApproved && expectedChildApproved;
  if (line.pricing_approved !== expectedRollupApproved) throw new Error(`[${parentKey}] expected rollup pricing_approved=${expectedRollupApproved} (bool_and of parent=${expectedParentApproved}, child=${expectedChildApproved}), got ${line.pricing_approved}`);
  const expectedAmount = Number(parentLine.amount) + Number(childLine.amount);
  if (Number(line.amount) !== expectedAmount) throw new Error(`[${parentKey}] expected rollup amount ${expectedAmount} (parent+child snapshots), got ${line.amount}`);
}

async function main() {
  for (const pair of PAIRS) {
    await record(`generic parent/child model holds for ${pair.parentKey} + ${pair.childKey} (own rate, own approval, correct rollup, no leakage)`, async () => {
      await withAdminTx(async (client) => {
        await assertGenericParentChild(client, runId(), pair);
      });
    });
  }

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
