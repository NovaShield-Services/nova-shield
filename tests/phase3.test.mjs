import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const HW ={ id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const VALLEY1 = { id: 'svc-v1', key: 'winter_deicing_cables_valley_1st', name: 'Heating Wire — Valley (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const VALLEY2 = { id: 'svc-v2', key: 'winter_deicing_cables_valley_2nd', name: 'Heating Wire — Valley (2nd floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const CORNER1 = { id: 'svc-c1', key: 'winter_deicing_cables_corner_1st', name: 'Heating Wire — Corner (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const CORNER2 = { id: 'svc-c2', key: 'winter_deicing_cables_corner_2nd', name: 'Heating Wire — Corner (2nd floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
// A generic service with no specialized calculator. Each real service key
// used here so far (siding, then windows) eventually got its own real
// calculator registered in a later phase, breaking this fixture's "generic/
// unrelated" premise -- using a deliberately fake, never-real key sidesteps
// that instead of renaming this fixture again next phase.
const UNRELATED = { id: 'svc-unrelated', key: 'unrelated_test_service', name: 'Unrelated Test Service', unit: 'each', category: 'cleaning', quotable: true, active: true, parent_key: null };
const ALL_SERVICES = [HW, VALLEY1, VALLEY2, CORNER1, CORNER2, UNRELATED];

const MODIFIERS = [
  { id: 'm-cond-good', service_id: 'svc-hw', group_key: 'condition', group_label: 'Gutter condition', option_key: 'good', label: 'Good', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-older', service_id: 'svc-hw', group_key: 'condition', group_label: 'Gutter condition', option_key: 'older', label: 'Older, needs care', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-cond-poor', service_id: 'svc-hw', group_key: 'condition', group_label: 'Gutter condition', option_key: 'poor', label: 'Poor - assess before fitting', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 3 },
  { id: 'm-scope-edge', service_id: 'svc-hw', group_key: 'scope', group_label: 'Coverage', option_key: 'edge_only', label: 'Roof edge only', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-scope-full', service_id: 'svc-hw', group_key: 'scope', group_label: 'Coverage', option_key: 'edge_gutters_downspouts', label: 'Roof edge + gutters + downspouts', kind: 'multiplier', value: 1.35, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-hw', approval_status: 'provisional', rate: 14, minimum: 450 }
  // the four child services have no row at all -- deliberately unpriced
];

const FAKE_API = BASE_FAKE_API_PANEL;

async function main() {
  const { browser, page } = await launchPanelPage({ fakeApi: FAKE_API });

  async function freshPanel(page, { measurements }) {
    return page.evaluate(async ({ services, modifiers, sections, pricingRules, measurements }) => {
      // Each test gets its own panel AND its own fresh sections array copy
      // (the component pushes newly-created sections into refs.sections
      // in place, which must not leak between tests) -- the previous
      // test's panel is removed first so document-wide queries in a test
      // can never accidentally match stale DOM from an earlier one.
      if (window.__panel) window.__panel.root.remove();
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services, modifiers, siteFactors: [], sections: sections.map(s => ({ ...s })), pricingRules };
      globalThis.__createCalls = [];
      const createMeasurementFn = async (jobId, m) => {
        globalThis.__createCalls.push({ jobId, m });
        const id = 'new-m-' + globalThis.__createCalls.length;
        return { id, job_id: jobId, ...m, measurement_modifiers: [], job_measurement_addons: [] };
      };
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {}, createMeasurementFn });
      document.body.appendChild(panel.root);
      window.__panel = panel;
      window.__panelMeasurements = measurements;
      return true;
    }, { services: ALL_SERVICES, modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements });
  }

  function renderPanel(pricing) {
    return page.evaluate((pricing) => window.__panel.render({ measurements: window.__panelMeasurements, pricing }), pricing);
  }

  await record('Single eave run: grouped card, badge shows worst state (unpriced, from the empty-pricing baseline)', async () => {
    const eave = { id: 'm-eave-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] };
    await freshPanel(page, { measurements: [eave] });
    await renderPanel([{ service_id: 'svc-hw', amount: 450, unit_rate: 14, minimum_applied: true }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return {
        title: card.querySelector('h2').textContent,
        total: card.querySelector('.money').textContent,
        hasEaveHeading: !![...card.querySelectorAll('h3')].find(h => h.textContent.includes('Eave')),
        hasDownspoutHeading: !![...card.querySelectorAll('h3')].find(h => h.textContent.includes('Downspout')),
        hasValleyStepper: !![...card.querySelectorAll('strong')].find(s => s.textContent.includes('Valley'))
      };
    });
    assert.match(info.title, /Heating Wire Installation/);
    assert.match(info.total, /\$450/);
    assert.equal(info.hasEaveHeading, true);
    assert.equal(info.hasDownspoutHeading, true);
    assert.equal(info.hasValleyStepper, true);
  });

  await record('Mixed elevations: two eave runs on different sections both render with their own elevation hint', async () => {
    const eave1 = { id: 'm-eave-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] };
    const eave2 = { id: 'm-eave-2', service_id: 'svc-hw', section_id: 'sec-2', label: 'Eave run', quantity: 42, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] };
    await freshPanel(page, { measurements: [eave1, eave2] });
    await renderPanel([{ service_id: 'svc-hw', amount: 1008, unit_rate: 14, minimum_applied: false }]);
    const hints = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.card .hint')].map(h => h.textContent).filter(t => t.includes('Height/access')));
    assert.equal(hints.length, 2);
    assert.ok(hints.some(h => h.includes('Front') && h.includes('1 storey')));
    assert.ok(hints.some(h => h.includes('Rear') && h.includes('2 storey')));
  });

  await record('Section heading shows total footage per group, omitted when the group is empty', async () => {
    const eave1 = { id: 'm-eave-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] };
    const eave2 = { id: 'm-eave-2', service_id: 'svc-hw', section_id: 'sec-2', label: 'Eave run', quantity: 42, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] };
    await freshPanel(page, { measurements: [eave1, eave2] });
    await renderPanel([{ service_id: 'svc-hw', amount: 1008, unit_rate: 14, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const headings = [...window.__panel.root.querySelectorAll('.card h3')].map(h => h.parentElement.textContent);
      return {
        eave: headings.find(t => t.includes('Eave / gutter sections')),
        downspout: headings.find(t => t.includes('Downspout drops'))
      };
    });
    assert.match(info.eave, /72 ft total across 2 runs/);
    // No downspout runs exist in this test's fixture -- the heading must not
    // claim "0 ft total across 0 runs", it should just omit the total.
    assert.doesNotMatch(info.downspout, /ft total/);
  });

  await record('Add eave section defaults to the last run\'s elevation instead of resetting to blank', async () => {
    const eave1 = { id: 'm-eave-1', service_id: 'svc-hw', section_id: 'sec-2', label: 'Eave run', quantity: 42, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] };
    await freshPanel(page, { measurements: [eave1] });
    await renderPanel([{ service_id: 'svc-hw', amount: 450, unit_rate: 14, minimum_applied: true }]);
    await page.evaluate(() => {
      const btn = [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add eave section');
      btn.click();
    });
    await page.waitForTimeout(80);
    const calls = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].m.section_id, 'sec-2');
  });

  await record('Add downspout drop: labeled with the Downspout prefix and routed through offline-aware createMeasurement', async () => {
    // A service's card only exists once something has already been
    // measured for it (same rule the generic editor has always had) --
    // simulating "Heating Wire Installation was already added" with one
    // eave run already present, same as a real tech would see.
    const eave = { id: 'm-eave-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] };
    await freshPanel(page, { measurements: [eave] });
    await renderPanel([{ service_id: 'svc-hw', amount: 450, unit_rate: 14, minimum_applied: true }]);
    await page.evaluate(() => {
      const btn = [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add downspout drop');
      btn.click();
    });
    await page.waitForTimeout(80);
    const calls = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].m.service_id, 'svc-hw');
    assert.match(calls[0].m.label, /^Downspout/);
  });

  await record('Valley stepper: + creates with review_required, + again updates quantity, - to 0 deletes', async () => {
    const eave = { id: 'm-eave-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] };
    await freshPanel(page, { measurements: [eave] });
    await renderPanel([{ service_id: 'svc-hw', amount: 450, unit_rate: 14, minimum_applied: true }]);
    await page.evaluate(() => {
      globalThis.__createCalls = [];
      globalThis.__updateMeasurementCalls = [];
      globalThis.__deleteMeasurementCalls = [];
    });
    const plusBtn = () => page.evaluate(() => {
      const row = [...window.__panel.root.querySelectorAll('.row-item')].find(r => r.querySelector('strong')?.textContent.includes('Valley — 1st floor'));
      row.querySelector('button[aria-label="More Valley — 1st floor"]').click();
    });
    const minusBtn = () => page.evaluate(() => {
      const row = [...window.__panel.root.querySelectorAll('.row-item')].find(r => r.querySelector('strong')?.textContent.includes('Valley — 1st floor'));
      row.querySelector('button[aria-label="Fewer Valley — 1st floor"]').click();
    });

    await plusBtn();
    await page.waitForTimeout(60);
    let created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.service_id, 'svc-v1');
    assert.equal(created[0].m.quantity, 1);
    assert.equal(created[0].m.review_required, true);
    assert.match(created[0].m.review_reason, /No approved rate/);

    // The component tracks the newly-created row itself (closure state),
    // so the next click updates rather than re-creating.
    await plusBtn();
    await page.waitForTimeout(60);
    let updated = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.equal(updated.length, 1);
    assert.equal(updated[0].patch.quantity, 2);

    await minusBtn();
    await minusBtn();
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.equal(deleted.length, 1);
  });

  await record('Gutter condition dropdown calls setMeasurementModifier with the real configured group', async () => {
    const eave = { id: 'm-eave-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] };
    await freshPanel(page, { measurements: [eave] });
    await renderPanel([{ service_id: 'svc-hw', amount: 450, unit_rate: 14, minimum_applied: true }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => {
      const label = [...window.__panel.root.querySelectorAll('label')].find(l => l.textContent.includes('Gutter condition'));
      const sel = label.querySelector('select');
      sel.value = 'm-cond-poor';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].measurementId, 'm-eave-1');
    assert.equal(calls[0].newId, 'm-cond-poor');
  });

  await record('Bracket authorization checkbox flags the primary run for review, no price attached', async () => {
    const eave = { id: 'm-eave-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', notes: null, review_required: false, measurement_modifiers: [], job_measurement_addons: [] };
    await freshPanel(page, { measurements: [eave] });
    await renderPanel([{ service_id: 'svc-hw', amount: 450, unit_rate: 14, minimum_applied: true }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const box = [...window.__panel.root.querySelectorAll('input[type=checkbox]')].find(c => c.closest('label')?.textContent.includes('Authorize bracket repairs'));
      box.click();
    });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'm-eave-1');
    assert.equal(calls[0].patch.review_required, true);
    assert.match(calls[0].patch.notes, /bracket-repair-authorized/);
    // No dollar amount anywhere in the patch -- this is purely an
    // authorization + review flag, never an invented price.
    assert.equal('amount' in calls[0].patch, false);
  });

  await record('No optional pre-winter prep toggle exists (no configured pricing for it)', async () => {
    await freshPanel(page, { measurements: [] });
    await renderPanel([]);
    const hasPrepToggle = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('label, button')].find(el => /prep|flush|re-secure/i.test(el.textContent)));
    assert.equal(hasPrepToggle, false);
  });

  await record('An unrelated service is unaffected by the grouping/specialized-calculator logic', async () => {
    const unrelatedM = { id: 'm-unrelated-1', service_id: 'svc-unrelated', section_id: 'sec-1', label: 'Front', quantity: 12, unit: 'each', measurement_modifiers: [], job_measurement_addons: [] };
    await freshPanel(page, { measurements: [unrelatedM] });
    await renderPanel([{ service_id: 'svc-unrelated', amount: 150, unit_rate: 12.5, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')];
      const unrelatedCard = cards.find(c => c.querySelector('h2')?.textContent.includes('Unrelated'));
      return { found: !!unrelatedCard, hasAddAreaBtn: !!unrelatedCard?.querySelector('button')?.textContent.includes('Add area') || [...unrelatedCard.querySelectorAll('button')].some(b => b.textContent === '+ Add area') };
    });
    assert.equal(info.found, true);
    assert.equal(info.hasAddAreaBtn, true);
  });

  await record('Add-a-service dropdown excludes child services entirely', async () => {
    await freshPanel(page, { measurements: [] });
    await renderPanel([]);
    const options = await page.evaluate(() => {
      const label = [...window.__panel.root.querySelectorAll('label')].find(l => l.textContent.includes('Add a service to this job'));
      return [...label.querySelector('select').options].map(o => o.textContent);
    });
    assert.ok(!options.some(o => o.includes('Valley')));
    assert.ok(!options.some(o => o.includes('Corner')));
    assert.ok(options.some(o => o.includes('Heating Wire Installation')));
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
