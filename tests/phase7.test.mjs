import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const CONCRETE = { id: 'svc-concrete', key: 'concrete', name: 'Concrete / Pressure Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const GUTTER = { id: 'svc-gutter', key: 'gutter_brightening', name: 'Gutter Brightening', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const WINDOWS = { id: 'svc-windows', key: 'windows', name: 'Window Cleaning', unit: 'each', category: 'cleaning', quotable: true, active: true, parent_key: null };
const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const VALLEY1 = { id: 'svc-v1', key: 'winter_deicing_cables_valley_1st', name: 'Heating Wire — Valley (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const ALL_SERVICES = [CONCRETE, SIDING, GUTTER, WINDOWS, HW, VALLEY1];

// Mirrors the real configured concrete modifiers.
const MODIFIERS = [
  { id: 'm-acc-easy', service_id: 'svc-concrete', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-surf-concrete', service_id: 'svc-concrete', group_key: 'surface', group_label: 'Surface', option_key: 'concrete', label: 'Poured concrete', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-surf-interlock', service_id: 'svc-concrete', group_key: 'surface', group_label: 'Surface', option_key: 'interlock', label: 'Interlock / pavers', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-cond-light', service_id: 'svc-concrete', group_key: 'condition', group_label: 'Condition', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-heavy', service_id: 'svc-concrete', group_key: 'condition', group_label: 'Condition', option_key: 'heavy_staining', label: 'Heavy staining', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 4 },
  { id: 'm-treat-none', service_id: 'svc-concrete', group_key: 'addon', group_label: 'Special treatment', option_key: 'none', label: 'None', kind: 'flat', value: 0, is_default: true, sort_order: 1 },
  { id: 'm-treat-degreaser', service_id: 'svc-concrete', group_key: 'addon', group_label: 'Special treatment', option_key: 'degreaser', label: 'Oil / degreaser', kind: 'flat', value: 50, is_default: false, sort_order: 2 },
  { id: 'm-treat-rust', service_id: 'svc-concrete', group_key: 'addon', group_label: 'Special treatment', option_key: 'rust', label: 'Rust treatment', kind: 'flat', value: 75, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '1_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-concrete', approval_status: 'approved', rate: 0.25, minimum: 149 }
];

const FAKE_API = BASE_FAKE_API_PANEL;

async function main() {
  const { browser, page } = await launchPanelPage({ fakeApi: FAKE_API, promptValue: 'Garage' });

  async function freshPanel(page, { measurements }) {
    return page.evaluate(async ({ services, modifiers, sections, pricingRules, measurements }) => {
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

  const zone = (id, section_id, label, quantity, mods = []) => ({
    id, service_id: 'svc-concrete', section_id, label, quantity, unit: 'sq_ft',
    measurement_modifiers: mods.map(modifier_id => ({ modifier_id })), job_measurement_addons: []
  });

  // 1. Single zone
  await record('1. Single concrete zone renders with correct total', async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Driveway', 1200)] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { title: card.querySelector('h2').textContent, total: card.querySelector('.money').textContent,
        heading: [...card.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent };
    });
    assert.match(info.title, /Concrete/);
    assert.match(info.total, /\$300/);
    assert.match(info.heading, /1,200 sq ft total across 1 zone/);
  });

  // 2. Multiple zones
  await record('2. Multiple zones: total sums correctly across zones', async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Driveway', 1200), zone('m2', 'sec-1', 'Front walkway', 180), zone('m3', 'sec-2', 'Rear patio', 450)] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 500, unit_rate: 0.25, minimum_applied: false }]);
    const heading = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent);
    assert.match(heading, /1,830 sq ft total across 3 zones/);
  });

  // 3. Zone-specific modifiers
  await record('3. Zone-specific modifiers: each zone keeps its own Surface/Condition/Treatment independently', async () => {
    await freshPanel(page, { measurements: [
      zone('m1', 'sec-1', 'Driveway', 1200, ['m-surf-concrete', 'm-cond-heavy', 'm-treat-degreaser']),
      zone('m2', 'sec-2', 'Rear patio', 450, ['m-surf-interlock', 'm-cond-light', 'm-treat-none'])
    ] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 500, unit_rate: 0.25, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => {
        const sel = (label) => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes(label))?.selectedOptions[0]?.textContent;
        return { surface: sel('Surface'), condition: sel('Condition'), treatment: sel('Special treatment') };
      });
    });
    assert.deepEqual(picked[0], { surface: 'Poured concrete', condition: 'Heavy staining', treatment: 'Oil / degreaser (+$50.00)' });
    assert.deepEqual(picked[1], { surface: 'Interlock / pavers', condition: 'Light', treatment: 'None' });
  });

  // 4. No job-wide modifier control exists for this service
  await record('4. No job-wide control: concrete has no Scope-style single selector (real data has no job-wide group)', async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Driveway', 1200)] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false }]);
    const hasJobWideLabel = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('.card > label')].find(l => l.textContent.includes('for this visit')));
    assert.equal(hasJobWideLabel, false);
  });

  // 5. Mixed conditions across zones (same as #3 but also checking total is still a single clean number from pricedRows, not re-derived)
  await record('5. Mixed conditions: card total still comes from pricedRows, not recomputed client-side', async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Driveway', 1200, ['m-cond-heavy']), zone('m2', 'sec-2', 'Rear patio', 450, ['m-cond-light'])] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 489.75, unit_rate: 0.25, minimum_applied: false }]);
    const total = await page.evaluate(() => window.__panel.root.querySelector('.card .money').textContent);
    assert.match(total, /\$489\.75/);
  });

  // 6. Duplicate
  await record('6. Duplicate: copies section, sq ft, and every modifier (Surface/Condition/Treatment) -- not review/reason/notes', async () => {
    const source = zone('m1', 'sec-2', 'Rear patio', 450, ['m-surf-interlock', 'm-cond-heavy', 'm-treat-rust']);
    source.review_required = true;
    source.review_reason = 'Unsure if pavers are sealed';
    source.notes = 'Heavy rust stains near planter';
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 219, unit_rate: 0.25, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate').click(); });
    await page.waitForTimeout(80);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.section_id, 'sec-2');
    assert.equal(created[0].m.quantity, 450);
    assert.match(created[0].m.label, /\(copy\)$/);
    assert.equal('review_required' in created[0].m, false);
    assert.equal('notes' in created[0].m, false);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-surf-interlock'));
    assert.ok(modCalls.some(c => c.newId === 'm-cond-heavy'));
    assert.ok(modCalls.some(c => c.newId === 'm-treat-rust'));
  });

  // 7. Remove zone
  await record('7. Remove zone: calls deleteMeasurement after confirm', async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Driveway', 1200)] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Remove').click(); });
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.deepEqual(deleted, ['m1']);
  });

  // 8. Edit zone (name + sq ft)
  await record('8. Edit zone: renaming and changing square footage both persist via updateMeasurement', async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Driveway', 1200)] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const nameInput = window.__panel.root.querySelector('input[aria-label="Zone name"]');
      nameInput.value = 'Main Driveway';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      const qtyInput = window.__panel.root.querySelector('input[aria-label="Square feet"]');
      qtyInput.value = '1350';
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.ok(calls.some(c => c.patch.label === 'Main Driveway'));
    assert.ok(calls.some(c => c.patch.quantity === 1350));
  });

  // 9. Minimum charge
  await record('9. Minimum charge: card shows "minimum applied" without replacing the total', async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Small patch', 100)] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 149, unit_rate: 0.25, minimum_applied: true }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { total: card.querySelector('.money').textContent, rateLine: card.querySelector('p').textContent };
    });
    assert.match(info.total, /\$149/);
    assert.match(info.rateLine, /minimum applied/);
  });

  // 10. Manual adjustment -- structural: stays a quote-level concept, not duplicated here
  await record('10. No manual-adjustment UI inside the calculator (quote-level concept, same as other calculators)', async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Driveway', 1200)] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false }]);
    const hasAdjustmentUi = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('button,label')].find(el => /adjustment/i.test(el.textContent)));
    assert.equal(hasAdjustmentUi, false);
  });

  // 11. Review required
  await record('11. Review flag toggles review_required without touching quantity/section/label', async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Driveway', 1200)] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => { window.__panel.root.querySelector('input[type=checkbox]').click(); });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].patch.review_required, true);
    assert.equal('quantity' in calls[0].patch, false);
    assert.equal('label' in calls[0].patch, false);
  });

  // 12/13. Quote version + customer rendering -- structural checks here;
  // the real end-to-end path is verified against the live DB separately.
  await record('12. No bespoke RPC/quote-pathway reference anywhere in the component source', async () => {
    const src = await page.evaluate(async () => (await (await fetch('/admin/js/components/concrete-cleaning-calculator.js')).text()));
    assert.doesNotMatch(src, /create_quote_from_calculation|createQuoteFromCalculation|recalculate_quote/);
  });

  await record('13. No per-row dollar figure is invented in the DOM (only the card-level total, from pricedRows)', async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Driveway', 1200), zone('m2', 'sec-2', 'Rear patio', 450)] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 412.5, unit_rate: 0.25, minimum_applied: false }]);
    const moneyEls = await page.evaluate(() => [...window.__panel.root.querySelectorAll('.money')].map(e => e.textContent));
    assert.equal(moneyEls.length, 1);
  });

  // 14. Multi-service: concrete + siding + gutter + windows + heating-wire (4-way, all at once)
  await record('14. Multi-service: Concrete + Siding + Gutter + Windows + Heating Wire all coexist with correct independent totals', async () => {
    await freshPanel(page, { measurements: [
      zone('m-c1', 'sec-1', 'Driveway', 1200),
      { id: 'm-sd-1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-gt-1', service_id: 'svc-gutter', section_id: 'sec-1', label: 'Front', quantity: 42, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-w1', service_id: 'svc-windows', section_id: 'sec-1', label: 'Front', quantity: 6, unit: 'each', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }
    ] });
    await renderPanel([
      { service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false },
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false },
      { service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false },
      { service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false },
      { service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true }
    ]);
    const totals = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2'));
      return cards.map(c => ({ title: c.querySelector('h2').textContent, total: c.querySelector('.money').textContent }));
    });
    assert.equal(totals.length, 5);
    assert.match(totals.find(t => t.title.includes('Concrete')).total, /\$300/);
    assert.match(totals.find(t => t.title.includes('Siding')).total, /\$126/);
    assert.match(totals.find(t => t.title.includes('Gutter')).total, /\$56\.70/);
    assert.match(totals.find(t => t.title.includes('Window')).total, /\$54/);
    assert.match(totals.find(t => t.title.includes('Heating Wire')).total, /\$420/);
  });

  // 15. Offline persistence
  await record('15. Offline add-zone: createMeasurement returning null does not throw', async () => {
    await page.evaluate(async () => {
      if (window.__panel) window.__panel.root.remove();
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [{ id: 'svc-concrete', key: 'concrete', name: 'Concrete / Pressure Washing', unit: 'sq_ft', quotable: true, active: true, parent_key: null }], modifiers: [], siteFactors: [], sections: [{ id: 'sec-1', name: 'Front', access: 'easy' }], pricingRules: [] };
      const createMeasurementFn = async () => null;
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {}, createMeasurementFn });
      document.body.appendChild(panel.root);
      window.__panel = panel;
      window.__panelMeasurements = [{ id: 'm1', service_id: 'svc-concrete', section_id: 'sec-1', label: 'Driveway', quantity: 1200, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] }];
      panel.render({ measurements: window.__panelMeasurements, pricing: [{ service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false }] });
    });
    let threw = false;
    try {
      await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add zone').click(); });
      await page.waitForTimeout(60);
    } catch { threw = true; }
    assert.equal(threw, false);
  });

  // 16. Design test: distinct from Siding despite both being area services
  await record("16. Design test: distinct from Siding -- 3 per-zone modifiers incl. a flat-priced one, no job-wide control, 'zones' not 'walls'", async () => {
    await freshPanel(page, { measurements: [zone('m1', 'sec-1', 'Driveway', 1200)] });
    await renderPanel([{ service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const root = window.__panel.root;
      return {
        heading: root.querySelector('h3')?.textContent,
        hasTreatmentDollarSuffix: !![...root.querySelectorAll('option')].find(o => /\+\$/.test(o.textContent)),
        hasSurfaceLabel: !![...root.querySelectorAll('label')].find(l => l.textContent.includes('Surface'))
      };
    });
    assert.match(info.heading, /Zones/);
    assert.equal(info.hasTreatmentDollarSuffix, true);
    assert.equal(info.hasSurfaceLabel, true);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
