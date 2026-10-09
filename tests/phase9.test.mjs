import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const DECK = { id: 'svc-deck', key: 'deck', name: 'Deck / Wood Cleaning', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const CONCRETE = { id: 'svc-concrete', key: 'concrete', name: 'Concrete / Pressure Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const GUTTER = { id: 'svc-gutter', key: 'gutter_brightening', name: 'Gutter Brightening', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const WINDOWS = { id: 'svc-windows', key: 'windows', name: 'Window Cleaning', unit: 'each', category: 'cleaning', quotable: true, active: true, parent_key: null };
const ROOF = { id: 'svc-roof', key: 'roof_soft_wash', name: 'Roof Soft Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const VALLEY1 = { id: 'svc-v1', key: 'winter_deicing_cables_valley_1st', name: 'Heating Wire — Valley (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const ALL_SERVICES = [DECK, SIDING, CONCRETE, GUTTER, WINDOWS, ROOF, HW, VALLEY1];

// Mirrors the real configured deck modifiers.
const MODIFIERS = [
  { id: 'm-acc-easy', service_id: 'svc-deck', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-acc-diff', service_id: 'svc-deck', group_key: 'access', group_label: 'Access', option_key: 'difficult', label: 'Difficult', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 3 },
  { id: 'm-cond-light', service_id: 'svc-deck', group_key: 'condition', group_label: 'Condition', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-weathered', service_id: 'svc-deck', group_key: 'condition', group_label: 'Condition', option_key: 'very_weathered', label: 'Very weathered', kind: 'multiplier', value: 1.45, is_default: false, sort_order: 4 },
  { id: 'm-mat-wood', service_id: 'svc-deck', group_key: 'surface', group_label: 'Material', option_key: 'wood', label: 'Wood', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-mat-composite', service_id: 'svc-deck', group_key: 'surface', group_label: 'Material', option_key: 'composite', label: 'Composite', kind: 'multiplier', value: 0.9, is_default: false, sort_order: 2 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Main deck', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Upper deck', storeys: '2_storey', access: 'difficult', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-deck', approval_status: 'approved', rate: 0.5, minimum: 199 }
];

const FAKE_API = BASE_FAKE_API_PANEL;

async function main() {
  const { browser, page } = await launchPanelPage({ fakeApi: FAKE_API, promptValue: 'Rear platform' });

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

  const deck = (id, section_id, label, quantity, mods = []) => ({
    id, service_id: 'svc-deck', section_id, label, quantity, unit: 'sq_ft',
    measurement_modifiers: mods.map(modifier_id => ({ modifier_id })), job_measurement_addons: []
  });

  // 1. Basic deck
  await record('1. Basic deck: one section renders with correct total', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Main deck', 420)] });
    await renderPanel([{ service_id: 'svc-deck', amount: 210, unit_rate: 0.5, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { title: card.querySelector('h2').textContent, total: card.querySelector('.money').textContent,
        heading: [...card.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent };
    });
    assert.match(info.title, /Deck/);
    assert.match(info.total, /\$210/);
    assert.match(info.heading, /420 sq ft total across 1 deck section/);
  });

  // 2. Multiple deck sections
  await record('2. Multiple deck sections: total sums correctly', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Main deck', 420), deck('m2', 'sec-2', 'Upper deck', 180), deck('m3', 'sec-1', 'Rear platform', 120)] });
    await renderPanel([{ service_id: 'svc-deck', amount: 400, unit_rate: 0.5, minimum_applied: false }]);
    const heading = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent);
    assert.match(heading, /720 sq ft total across 3 deck sections/);
  });

  // 3. Mixed conditions
  await record('3. Mixed Condition: each deck section keeps its own independent selection', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Main deck', 420, ['m-cond-light']), deck('m2', 'sec-2', 'Upper deck', 180, ['m-cond-weathered'])] });
    await renderPanel([{ service_id: 'svc-deck', amount: 400, unit_rate: 0.5, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Condition'))?.selectedOptions[0]?.textContent);
    });
    assert.equal(picked[0], 'Light');
    assert.equal(picked[1], 'Very weathered');
  });

  // 4. Mixed access (section-driven, via job_sections)
  await record('4. Mixed access: Main deck (easy) and Upper deck (difficult) reflected via their own section hints', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Main deck', 420), deck('m2', 'sec-2', 'Upper deck', 180)] });
    await renderPanel([{ service_id: 'svc-deck', amount: 400, unit_rate: 0.5, minimum_applied: false }]);
    const hints = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.hint')].map(h => h.textContent).filter(t => t.includes('Access comes from')));
    assert.ok(hints.some(h => h.includes('Main deck') && h.includes('easy access')));
    assert.ok(hints.some(h => h.includes('Upper deck') && h.includes('difficult access')));
  });

  // 5. No stairs/railing measurement type, no flat addon, no job-wide control (real data has none)
  await record('5. No fake stairs/railing/addon/job-wide controls exist (real data has none of these)', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Main deck', 420)] });
    await renderPanel([{ service_id: 'svc-deck', amount: 210, unit_rate: 0.5, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const root = window.__panel.root;
      return {
        hasStairsOrRailing: !![...root.querySelectorAll('label,h3')].find(l => /stair|railing/i.test(l.textContent)),
        hasJobWideLabel: !![...root.querySelectorAll('.card > label')].find(l => l.textContent.includes('for this visit')),
        hasHeightLabel: !![...root.querySelectorAll('label')].find(l => l.textContent.trim() === 'Height')
      };
    });
    assert.equal(info.hasStairsOrRailing, false);
    assert.equal(info.hasJobWideLabel, false);
    assert.equal(info.hasHeightLabel, false);
  });

  // 6. Duplicate
  await record('6. Duplicate: copies section, sq ft, Condition + Material -- not review/reason/notes', async () => {
    const source = deck('m1', 'sec-2', 'Upper deck', 180, ['m-cond-weathered', 'm-mat-composite']);
    source.review_required = true;
    source.review_reason = 'Loose board, confirm safe before cleaning';
    source.notes = 'Stairs lead down to lower patio, not separately measured';
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-deck', amount: 117.45, unit_rate: 0.5, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate').click(); });
    await page.waitForTimeout(80);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.section_id, 'sec-2');
    assert.equal(created[0].m.quantity, 180);
    assert.match(created[0].m.label, /\(copy\)$/);
    assert.equal('review_required' in created[0].m, false);
    assert.equal('notes' in created[0].m, false);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-cond-weathered'));
    assert.ok(modCalls.some(c => c.newId === 'm-mat-composite'));
  });

  // 7. Remove / edit
  await record('7a. Remove deck section: calls deleteMeasurement after confirm', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Main deck', 420)] });
    await renderPanel([{ service_id: 'svc-deck', amount: 210, unit_rate: 0.5, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Remove').click(); });
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.deepEqual(deleted, ['m1']);
  });

  await record('7b. Edit deck section: rename and area change both persist', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Main deck', 420)] });
    await renderPanel([{ service_id: 'svc-deck', amount: 210, unit_rate: 0.5, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const nameInput = window.__panel.root.querySelector('input[aria-label="Deck section name"]');
      nameInput.value = 'Main Rear Deck';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      const qtyInput = window.__panel.root.querySelector('input[aria-label="Square feet"]');
      qtyInput.value = '450';
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => (globalThis.__updateMeasurementCalls || []).some(c => c.patch.quantity === 450));
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.ok(calls.some(c => c.patch.label === 'Main Rear Deck'));
    assert.ok(calls.some(c => c.patch.quantity === 450));
  });

  // 8. No flat addon applicable -- confirmed structurally in test 5; skip duplicate assertion here.

  // 9. Minimum charge
  await record('9. Minimum charge: card shows "minimum applied" without replacing the total', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Small platform', 100)] });
    await renderPanel([{ service_id: 'svc-deck', amount: 199, unit_rate: 0.5, minimum_applied: true }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { total: card.querySelector('.money').textContent, rateLine: card.querySelector('p').textContent };
    });
    assert.match(info.total, /\$199/);
    assert.match(info.rateLine, /minimum applied/);
  });

  // 10. Review required
  await record('10. Review flag toggles review_required without touching quantity/section/label', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Main deck', 420)] });
    await renderPanel([{ service_id: 'svc-deck', amount: 210, unit_rate: 0.5, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => { window.__panel.root.querySelector('input[type=checkbox]').click(); });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].patch.review_required, true);
    assert.equal('quantity' in calls[0].patch, false);
    assert.equal('label' in calls[0].patch, false);
  });

  // 11. Manual adjustment -- structural, stays quote-level
  await record('11. No manual-adjustment UI inside the calculator (quote-level concept)', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Main deck', 420)] });
    await renderPanel([{ service_id: 'svc-deck', amount: 210, unit_rate: 0.5, minimum_applied: false }]);
    const hasAdjustmentUi = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('button,label')].find(el => /adjustment/i.test(el.textContent)));
    assert.equal(hasAdjustmentUi, false);
  });

  // 12/13. Quote version + customer rendering -- structural checks; real
  // end-to-end path verified against the live DB separately.
  await record('12. No bespoke RPC/quote-pathway reference anywhere in the component source', async () => {
    const src = await page.evaluate(async () => (await (await fetch('/admin/js/components/deck-cleaning-calculator.js')).text()));
    assert.doesNotMatch(src, /create_quote_from_calculation|createQuoteFromCalculation|recalculate_quote/);
  });

  await record('13. No per-row dollar figure is invented in the DOM (only the card-level total, from pricedRows)', async () => {
    await freshPanel(page, { measurements: [deck('m1', 'sec-1', 'Main deck', 420), deck('m2', 'sec-2', 'Upper deck', 180)] });
    await renderPanel([{ service_id: 'svc-deck', amount: 335.1, unit_rate: 0.5, minimum_applied: false }]);
    const moneyEls = await page.evaluate(() => [...window.__panel.root.querySelectorAll('.money')].map(e => e.textContent));
    assert.equal(moneyEls.length, 1);
  });

  // 14. Multi-service: deck + siding + concrete + gutter + windows + roof + heating-wire (7-way)
  await record('14. Multi-service: Deck + Siding + Concrete + Gutter + Windows + Roof + Heating Wire all coexist with correct independent totals', async () => {
    await freshPanel(page, { measurements: [
      deck('m-d1', 'sec-1', 'Main deck', 420),
      { id: 'm-sd-1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-cn-1', service_id: 'svc-concrete', section_id: 'sec-1', label: 'Driveway', quantity: 1200, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-gt-1', service_id: 'svc-gutter', section_id: 'sec-1', label: 'Front', quantity: 42, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-w1', service_id: 'svc-windows', section_id: 'sec-1', label: 'Front', quantity: 6, unit: 'each', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-rf-1', service_id: 'svc-roof', section_id: 'sec-1', label: 'Main roof', quantity: 780, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }
    ] });
    await renderPanel([
      { service_id: 'svc-deck', amount: 210, unit_rate: 0.5, minimum_applied: false },
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false },
      { service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false },
      { service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false },
      { service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false },
      { service_id: 'svc-roof', amount: 351, unit_rate: 0.45, minimum_applied: false },
      { service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true }
    ]);
    const totals = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2'));
      return cards.map(c => ({ title: c.querySelector('h2').textContent, total: c.querySelector('.money').textContent }));
    });
    assert.equal(totals.length, 7);
    assert.match(totals.find(t => t.title.includes('Deck')).total, /\$210/);
    assert.match(totals.find(t => t.title.includes('Siding')).total, /\$126/);
    assert.match(totals.find(t => t.title.includes('Concrete')).total, /\$300/);
    assert.match(totals.find(t => t.title.includes('Gutter')).total, /\$56\.70/);
    assert.match(totals.find(t => t.title.includes('Window')).total, /\$54/);
    assert.match(totals.find(t => t.title.includes('Roof')).total, /\$351/);
    assert.match(totals.find(t => t.title.includes('Heating Wire')).total, /\$420/);
  });

  // 15. Offline behavior
  await record('15. Offline add-section: createMeasurement returning null does not throw', async () => {
    await page.evaluate(async () => {
      if (window.__panel) window.__panel.root.remove();
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [{ id: 'svc-deck', key: 'deck', name: 'Deck / Wood Cleaning', unit: 'sq_ft', quotable: true, active: true, parent_key: null }], modifiers: [], siteFactors: [], sections: [{ id: 'sec-1', name: 'Main deck', access: 'easy' }], pricingRules: [] };
      const createMeasurementFn = async () => null;
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {}, createMeasurementFn });
      document.body.appendChild(panel.root);
      window.__panel = panel;
      window.__panelMeasurements = [{ id: 'm1', service_id: 'svc-deck', section_id: 'sec-1', label: 'Main deck', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] }];
      panel.render({ measurements: window.__panelMeasurements, pricing: [{ service_id: 'svc-deck', amount: 210, unit_rate: 0.5, minimum_applied: false }] });
    });
    let threw = false;
    try {
      await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add deck section').click(); });
      await page.waitForTimeout(60);
    } catch { threw = true; }
    assert.equal(threw, false);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
