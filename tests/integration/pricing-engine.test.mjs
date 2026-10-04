// Section A -- calculate_job_pricing, tested against real rows through the
// real function. No pricing formula is duplicated here as the system under
// test; every assertion compares the function's own output to a hand
// computation kept in a comment for readability. calculate_job_pricing is
// itself is_admin()-gated, so every case runs inside withAdminTx (see
// db-client.mjs for exactly what that does and does not fake).
//
// calculate_job_pricing's own RETURNS TABLE has no approval-status column
// at all -- that's a create_quote_from_calculation concern, covered in
// quote-lifecycle.test.mjs, not here.

import { createIntegrationRecorder, printResults } from './reporter.mjs';
import { withAdminTx, closePool, runId, isConfigured } from './db-client.mjs';
import { createJob, createSection, createMeasurement, attachModifier, getService, getCurrentRate, getModifier } from './helpers.mjs';

const { results, record } = createIntegrationRecorder(isConfigured());

async function priceOf(client, jobId) {
  const { rows } = await client.query('select * from calculate_job_pricing($1)', [jobId]);
  return rows;
}

async function main() {
  await record('base rate: quantity x rate, no modifiers, no section', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const rate = await getCurrentRate(client, siding.id);
      const { jobId } = await createJob(client, prefix);
      await createMeasurement(client, jobId, siding.id, { quantity: 1000, unit: 'sq_ft' });

      const [row] = await priceOf(client, jobId);
      const expected = 1000 * Number(rate.rate);
      if (expected <= Number(rate.minimum)) throw new Error('fixture no longer clears the minimum -- pick a larger quantity');
      if (Number(row.computed_amount) !== expected) throw new Error(`expected computed_amount ${expected}, got ${row.computed_amount}`);
      if (row.minimum_applied !== false) throw new Error('minimum should not have applied');
      if (Number(row.amount) !== expected) throw new Error(`expected amount ${expected}, got ${row.amount}`);
    });
  });

  await record('minimum interaction: a tiny quantity is floored at the real minimum, not the computed amount', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const rate = await getCurrentRate(client, siding.id);
      const { jobId } = await createJob(client, prefix);
      await createMeasurement(client, jobId, siding.id, { quantity: 10, unit: 'sq_ft' });

      const [row] = await priceOf(client, jobId);
      const computed = 10 * Number(rate.rate);
      if (computed >= Number(rate.minimum)) throw new Error('fixture no longer undershoots the minimum -- pick a smaller quantity');
      if (Number(row.computed_amount) !== computed) throw new Error(`expected computed_amount ${computed}, got ${row.computed_amount}`);
      if (row.minimum_applied !== true) throw new Error('minimum should have applied');
      if (Number(row.amount) !== Number(rate.minimum)) throw new Error(`expected amount to floor at the minimum ${rate.minimum}, got ${row.amount}`);
    });
  });

  await record('section-driven height and access: each section contributes its own factor, isolated per job', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const rate = await getCurrentRate(client, siding.id);
      const height2 = await getModifier(client, 'siding', 'height', '2_storey');
      const accessDifficult = await getModifier(client, 'siding', 'access', 'difficult');

      const { jobId } = await createJob(client, prefix);
      const sec = await createSection(client, jobId, { storeys: '2_storey', access: 'difficult' });
      await createMeasurement(client, jobId, siding.id, { sectionId: sec.id, quantity: 1000, unit: 'sq_ft' });

      const [row] = await priceOf(client, jobId);
      const expectedFactor = Number(height2.value) * Number(accessDifficult.value);
      const expected = 1000 * Number(rate.rate) * expectedFactor;
      if (Math.abs(Number(row.modifier_factor) - expectedFactor) > 0.0001) {
        throw new Error(`expected factor ${expectedFactor}, got ${row.modifier_factor}`);
      }
      if (Math.abs(Number(row.computed_amount) - expected) > 0.01) {
        throw new Error(`expected computed_amount ~${expected}, got ${row.computed_amount}`);
      }
    });
  });

  await record('site factors (property-wide, not service-specific) multiply in: ground x ladder x distance', async () => {
    // Never exercised with a non-default value in any prior phase's
    // verification, per the Phase 16 audit -- a genuine first for this
    // specific combination, not a re-confirmation of known-good math.
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const rate = await getCurrentRate(client, siding.id);
      const { jobId } = await createJob(client, prefix);
      const sec = await createSection(client, jobId, { ground: 'slope', ladder: 'difficult', distance: 'moderate' });
      await createMeasurement(client, jobId, siding.id, { sectionId: sec.id, quantity: 1000, unit: 'sq_ft' });

      const { rows: sf } = await client.query(
        `select group_key, multiplier from site_factors where (group_key,option_key) in (('ground','slope'),('ladder','difficult'),('distance','moderate'))`
      );
      const expectedFactor = sf.reduce((acc, r) => acc * Number(r.multiplier), 1);
      const expected = Math.round(1000 * Number(rate.rate) * expectedFactor * 100) / 100;

      const [row] = await priceOf(client, jobId);
      if (Math.abs(Number(row.computed_amount) - expected) > 0.01) {
        throw new Error(`expected computed_amount ~${expected} (factor ${expectedFactor}), got ${row.computed_amount} (factor ${row.modifier_factor})`);
      }
    });
  });

  await record('row-level condition/surface modifiers never bleed between rows of the same service', async () => {
    // A combined-job total matching a hand sum is NOT by itself proof of
    // isolation -- two swapped-but-compensating factors could coincidentally
    // sum to the same total. This proves each row's OWN factor directly
    // (via two single-row jobs using the exact same config) before ever
    // checking the combined job's aggregate.
    await withAdminTx(async (client) => {
      const prefix = runId();
      const wpc = await getService(client, 'winter_property_care');
      const rate = await getCurrentRate(client, wpc.id);
      const scopeDeck = await getModifier(client, 'winter_property_care', 'scope', 'walk_steps_deck');
      const scopeWalkway = await getModifier(client, 'winter_property_care', 'scope', 'walkway');
      const surfaceWood = await getModifier(client, 'winter_property_care', 'surface', 'wood_deck');
      const surfaceConcrete = await getModifier(client, 'winter_property_care', 'surface', 'concrete');
      const factorA = Number(scopeDeck.value) * Number(surfaceWood.value);
      const factorB = Number(scopeWalkway.value) * Number(surfaceConcrete.value);
      if (Math.abs(factorA - factorB) < 0.01) throw new Error('fixture picked two configs whose factors are too close to tell apart -- pick more different options');

      // Row A alone, isolated
      const { jobId: jobA } = await createJob(client, `${prefix}_A`);
      const mA = await createMeasurement(client, jobA, wpc.id, { quantity: 4, unit: 'each' });
      await attachModifier(client, mA.id, scopeDeck.id);
      await attachModifier(client, mA.id, surfaceWood.id);
      const [rowA] = await priceOf(client, jobA);
      if (Math.abs(Number(rowA.modifier_factor) - factorA) > 0.001) {
        throw new Error(`row A alone: expected factor ${factorA}, got ${rowA.modifier_factor}`);
      }

      // Row B alone, isolated
      const { jobId: jobB } = await createJob(client, `${prefix}_B`);
      const mB = await createMeasurement(client, jobB, wpc.id, { quantity: 4, unit: 'each' });
      await attachModifier(client, mB.id, scopeWalkway.id);
      await attachModifier(client, mB.id, surfaceConcrete.id);
      const [rowB] = await priceOf(client, jobB);
      if (Math.abs(Number(rowB.modifier_factor) - factorB) > 0.001) {
        throw new Error(`row B alone: expected factor ${factorB}, got ${rowB.modifier_factor}`);
      }

      // Now both rows together in one job, on different sections -- the
      // combined total must equal the sum of the two isolated lines above,
      // proving the combination didn't cross-contaminate either row.
      const { jobId: jobBoth } = await createJob(client, `${prefix}_both`);
      const secA = await createSection(client, jobBoth, { name: 'Front' });
      const secB = await createSection(client, jobBoth, { name: 'Rear' });
      const mA2 = await createMeasurement(client, jobBoth, wpc.id, { sectionId: secA.id, quantity: 4, unit: 'each' });
      await attachModifier(client, mA2.id, scopeDeck.id);
      await attachModifier(client, mA2.id, surfaceWood.id);
      const mB2 = await createMeasurement(client, jobBoth, wpc.id, { sectionId: secB.id, quantity: 4, unit: 'each' });
      await attachModifier(client, mB2.id, scopeWalkway.id);
      await attachModifier(client, mB2.id, surfaceConcrete.id);

      const expectedTotal = Number(rowA.computed_amount) + Number(rowB.computed_amount);
      const [rowBoth] = await priceOf(client, jobBoth);
      if (Math.abs(Number(rowBoth.computed_amount) - expectedTotal) > 0.01) {
        throw new Error(`expected combined computed_amount ${expectedTotal} (sum of the two isolated rows), got ${rowBoth.computed_amount}`);
      }
    });
  });

  await record('flat modifier adds once per measurement row, not multiplied by quantity', async () => {
    // The Phase 15 finding: "Salt every visit (+$30)" is a flat add per
    // service-area row, regardless of visit count -- re-proven here
    // through calculate_job_pricing directly, not a calculator mock.
    await withAdminTx(async (client) => {
      const prefix = runId();
      const wpc = await getService(client, 'winter_property_care');
      const rate = await getCurrentRate(client, wpc.id);
      const scopeWalkway = await getModifier(client, 'winter_property_care', 'scope', 'walkway');
      const surfaceConcrete = await getModifier(client, 'winter_property_care', 'surface', 'concrete');
      const saltEvery = await getModifier(client, 'winter_property_care', 'salting', 'every_visit');

      const { jobId } = await createJob(client, prefix);
      const m = await createMeasurement(client, jobId, wpc.id, { quantity: 6, unit: 'each' });
      await attachModifier(client, m.id, scopeWalkway.id);
      await attachModifier(client, m.id, surfaceConcrete.id);
      await attachModifier(client, m.id, saltEvery.id);

      const [row] = await priceOf(client, jobId);
      const expected = 6 * Number(rate.rate) * Number(scopeWalkway.value) * Number(surfaceConcrete.value) + Number(saltEvery.value);
      const wrongIfMultiplied = 6 * Number(rate.rate) * Number(scopeWalkway.value) * Number(surfaceConcrete.value) + 6 * Number(saltEvery.value);
      if (Math.abs(Number(row.computed_amount) - wrongIfMultiplied) < 0.01) {
        throw new Error('flat modifier appears to be multiplied by quantity -- that would be a real regression');
      }
      if (Math.abs(Number(row.computed_amount) - expected) > 0.01) {
        throw new Error(`expected computed_amount ~${expected}, got ${row.computed_amount}`);
      }
    });
  });

  await record('child services get their own row, their own factor, and never inherit the parent\'s modifiers', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const hw = await getService(client, 'winter_deicing_cables');
      const valley = await getService(client, 'winter_deicing_cables_valley_1st');
      const rate = await getCurrentRate(client, hw.id);
      const valleyRate = await getCurrentRate(client, valley.id); // null -- genuinely unpriced

      if (valleyRate !== null) throw new Error('fixture assumption broke: the valley child is expected to have no pricing_rules row at all');

      const { jobId } = await createJob(client, prefix);
      const sec = await createSection(client, jobId, { storeys: '2_storey', access: 'difficult' }); // would affect the PARENT if (and only if) inherited
      await createMeasurement(client, jobId, hw.id, { sectionId: sec.id, quantity: 50, unit: 'linear_ft' });
      // Child: no section at all (jump-wire-style children never carry one)
      await createMeasurement(client, jobId, valley.id, { quantity: 2, unit: 'each' });

      const rows = await priceOf(client, jobId);
      const parentRow = rows.find((r) => r.service_id === hw.id);
      const childRow = rows.find((r) => r.service_id === valley.id);
      if (!parentRow || !childRow) throw new Error('expected one row per service_id, parent and child both present');
      if (Number(childRow.unit_rate) !== 0) throw new Error(`child has no pricing_rules row, so unit_rate should be 0, got ${childRow.unit_rate}`);
      if (Number(childRow.modifier_factor) !== 1) throw new Error(`child has no section, so its own factor should be exactly 1, got ${childRow.modifier_factor}`);
      if (Number(childRow.computed_amount) !== 0) throw new Error(`child computed_amount should be 0, got ${childRow.computed_amount}`);
    });
  });

  await record('multiple measurements of the same service sum into one aggregated row (mixed elevations, weighted-average factor)', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const rate = await getCurrentRate(client, siding.id);
      const height2 = await getModifier(client, 'siding', 'height', '2_storey');
      const accessDifficult = await getModifier(client, 'siding', 'access', 'difficult');

      const { jobId } = await createJob(client, prefix);
      const secFront = await createSection(client, jobId, { name: 'Front', storeys: '1_storey', access: 'easy' });
      const secRear = await createSection(client, jobId, { name: 'Rear', storeys: '2_storey', access: 'difficult' });
      await createMeasurement(client, jobId, siding.id, { sectionId: secFront.id, quantity: 200, unit: 'sq_ft' });
      await createMeasurement(client, jobId, siding.id, { sectionId: secRear.id, quantity: 300, unit: 'sq_ft' });

      const factorRear = Number(height2.value) * Number(accessDifficult.value);
      const expectedWeightedFactor = (1 * 200 + factorRear * 300) / 500;
      const expectedComputed = 200 * Number(rate.rate) * 1 + 300 * Number(rate.rate) * factorRear;

      const [row] = await priceOf(client, jobId);
      if (Number(row.quantity) !== 500) throw new Error(`expected summed quantity 500, got ${row.quantity}`);
      if (Math.abs(Number(row.modifier_factor) - expectedWeightedFactor) > 0.001) {
        throw new Error(`expected weighted-average factor ~${expectedWeightedFactor}, got ${row.modifier_factor}`);
      }
      if (Math.abs(Number(row.computed_amount) - expectedComputed) > 0.01) {
        throw new Error(`expected computed_amount ~${expectedComputed}, got ${row.computed_amount}`);
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
