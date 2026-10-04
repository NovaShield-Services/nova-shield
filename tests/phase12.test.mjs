import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const GRAFFITI = { id: 'svc-graffiti', key: 'graffiti', name: 'Graffiti Removal', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const MOSS = { id: 'svc-moss', key: 'moss', name: 'Moss Removal', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const GUTTER = { id: 'svc-gutter', key: 'gutter_brightening', name: 'Gutter Brightening', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const CONCRETE = { id: 'svc-concrete', key: 'concrete', name: 'Concrete / Pressure Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const DECK = { id: 'svc-deck', key: 'deck', name: 'Deck / Wood Cleaning', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const FENCE = { id: 'svc-fence', key: 'fence', name: 'Fence Cleaning', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const WINDOWS = { id: 'svc-windows', key: 'windows', name: 'Window Cleaning', unit: 'each', category: 'cleaning', quotable: true, active: true, parent_key: null };
const ROOF = { id: 'svc-roof', key: 'roof_soft_wash', name: 'Roof Soft Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const ALL_SERVICES = [GRAFFITI, MOSS, SIDING, GUTTER, CONCRETE, DECK, FENCE, WINDOWS, ROOF, HW];

// Mirrors the real configured Graffiti Removal modifiers. Deliberately NO
// 'scope' group -- the real data has no job-wide control for this service.
const MODIFIERS = [
  { id: 'm-access-easy', service_id: 'svc-graffiti', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-access-normal', service_id: 'svc-graffiti', group_key: 'access', group_label: 'Access', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-access-difficult', service_id: 'svc-graffiti', group_key: 'access', group_label: 'Access', option_key: 'difficult', label: 'Difficult', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 3 },
  { id: 'm-diff-fresh', service_id: 'svc-graffiti', group_key: 'condition', group_label: 'Difficulty', option_key: 'fresh', label: 'Fresh', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-diff-setin', service_id: 'svc-graffiti', group_key: 'condition', group_label: 'Difficulty', option_key: 'set_in', label: 'Set-in', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 2 },
  { id: 'm-diff-old', service_id: 'svc-graffiti', group_key: 'condition', group_label: 'Difficulty', option_key: 'old_multiple', label: 'Old / multiple layers', kind: 'multiplier', value: 1.5, is_default: false, sort_order: 3 },
  { id: 'm-surf-painted', service_id: 'svc-graffiti', group_key: 'surface', group_label: 'Surface', option_key: 'painted', label: 'Painted', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-surf-brick', service_id: 'svc-graffiti', group_key: 'surface', group_label: 'Surface', option_key: 'brick', label: 'Brick', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-surf-delicate', service_id: 'svc-graffiti', group_key: 'surface', group_label: 'Surface', option_key: 'delicate', label: 'Delicate', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front wall', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Garage side', storeys: '1_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-graffiti', approval_status: 'approved', rate: 0.75, minimum: 149 }
];

const FAKE_API = BASE_FAKE_API_PANEL;

async function main() {
  const { browser, page } = await launchPanelPage({ fakeApi: FAKE_API, promptValue: 'Rear retaining wall' });

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

  const graffiti = (id, section_id, label, quantity, mods = []) => ({
    id, service_id: 'svc-graffiti', section_id, label, quantity, unit: 'sq_ft',
    measurement_modifiers: mods.map(modifier_id => ({ modifier_id })), job_measurement_addons: []
  });

  // 1. Basic graffiti calculation
  await record('1. Basic Graffiti: one affected area renders with correct total', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 120)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 90, unit_rate: 0.75, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { title: card.querySelector('h2').textContent, total: card.querySelector('.money').textContent,
        heading: [...card.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent };
    });
    assert.match(info.title, /Graffiti/);
    assert.match(info.total, /\$90/);
    assert.match(info.heading, /120 sq ft total across 1 affected area/);
  });

  // 2. Multiple affected areas
  await record('2. Multiple affected areas: total sums correctly', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 85), graffiti('m2', 'sec-2', 'Garage side', 42), graffiti('m3', 'sec-1', 'Rear retaining wall', 30)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 130, unit_rate: 0.75, minimum_applied: false }]);
    const heading = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent);
    assert.match(heading, /157 sq ft total across 3 affected areas/);
  });

  // 3. Mixed Difficulty (condition) stays per-area
  await record('3. Mixed Difficulty: each affected area keeps its own independent selection', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 85, ['m-diff-fresh']), graffiti('m2', 'sec-2', 'Garage side', 42, ['m-diff-old'])] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 112, unit_rate: 0.75, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Difficulty'))?.selectedOptions[0]?.textContent);
    });
    assert.equal(picked[0], 'Fresh');
    assert.equal(picked[1], 'Old / multiple layers');
  });

  // 4. Mixed Surface
  await record('4. Mixed Surface: each affected area keeps its own independent selection', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 85, ['m-surf-painted']), graffiti('m2', 'sec-2', 'Garage side', 42, ['m-surf-brick'])] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 101, unit_rate: 0.75, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Surface'))?.selectedOptions[0]?.textContent);
    });
    assert.equal(picked[0], 'Painted');
    assert.equal(picked[1], 'Brick');
  });

  // 5. Access is section-driven -- no per-row control, no height anywhere
  await record('5. Access has no per-row control (section-driven); no Height control anywhere (none configured)', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-2', 'Garage side', 42)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 35.49, unit_rate: 0.75, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const root = window.__panel.root;
      return {
        hasAccessDropdown: !![...root.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Access')),
        hasHeightDropdown: !![...root.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Height')),
        hint: [...root.querySelectorAll('p.hint')].find(p => /Access comes from/.test(p.textContent))?.textContent
      };
    });
    assert.equal(info.hasAccessDropdown, false);
    assert.equal(info.hasHeightDropdown, false);
    assert.match(info.hint, /Access comes from "Garage side" \(normal access\)/);
  });

  // 6. No addon control (none configured for graffiti)
  await record('6. No flat-addon control exists (no kind=flat modifiers configured for Graffiti)', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 120)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 90, unit_rate: 0.75, minimum_applied: false }]);
    const hasAddonUi = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('button,label')].find(el => /addon/i.test(el.textContent)));
    assert.equal(hasAddonUi, false);
  });

  // 7. Duplicate
  await record('7. Duplicate: copies section, sq ft, Difficulty + Surface -- not review/reason/notes', async () => {
    const source = graffiti('m1', 'sec-2', 'Garage side', 42, ['m-diff-old', 'm-surf-delicate']);
    source.review_required = true;
    source.review_reason = 'Coating appears delicate, additional photo required';
    source.notes = 'Customer wants only visible markings removed';
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 75.6, unit_rate: 0.75, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate').click(); });
    await page.waitForTimeout(80);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.section_id, 'sec-2');
    assert.equal(created[0].m.quantity, 42);
    assert.match(created[0].m.label, /\(copy\)$/);
    assert.equal('review_required' in created[0].m, false);
    assert.equal('notes' in created[0].m, false);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-diff-old'));
    assert.ok(modCalls.some(c => c.newId === 'm-surf-delicate'));
  });

  // 8. Remove / edit
  await record('8a. Remove affected area: calls deleteMeasurement after confirm', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 120)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 90, unit_rate: 0.75, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Remove').click(); });
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.deepEqual(deleted, ['m1']);
  });

  await record('8b. Edit affected area: rename and area change both persist', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 120)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 90, unit_rate: 0.75, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const nameInput = window.__panel.root.querySelector('input[aria-label="Affected area name"]');
      nameInput.value = 'Front wall, east section';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      const qtyInput = window.__panel.root.querySelector('input[aria-label="Affected area (sq ft)"]');
      qtyInput.value = '135';
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.ok(calls.some(c => c.patch.label === 'Front wall, east section'));
    assert.ok(calls.some(c => c.patch.quantity === 135));
  });

  // 9. Minimum charge
  await record('9. Minimum charge: card shows "minimum applied" without replacing the total', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Small tag', 50)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 149, unit_rate: 0.75, minimum_applied: true }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { total: card.querySelector('.money').textContent, rateLine: card.querySelector('p').textContent };
    });
    assert.match(info.total, /\$149/);
    assert.match(info.rateLine, /minimum applied/);
  });

  // 10. Review required
  await record('10. Review flag toggles review_required without touching quantity/section/label', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 120)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 90, unit_rate: 0.75, minimum_applied: false }]);
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
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 120)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 90, unit_rate: 0.75, minimum_applied: false }]);
    const hasAdjustmentUi = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('button,label')].find(el => /adjustment/i.test(el.textContent)));
    assert.equal(hasAdjustmentUi, false);
  });

  // 12/13. Quote version + customer rendering -- structural checks; real
  // end-to-end path verified against the live DB separately.
  await record('12. No bespoke RPC/quote-pathway reference anywhere in the component source', async () => {
    const src = await page.evaluate(async () => (await (await fetch('/admin/js/components/graffiti-removal-calculator.js')).text()));
    assert.doesNotMatch(src, /create_quote_from_calculation|createQuoteFromCalculation|recalculate_quote/);
  });

  await record('13. No per-row dollar figure is invented in the DOM (only the card-level total, from pricedRows)', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 85), graffiti('m2', 'sec-2', 'Garage side', 42)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 95.25, unit_rate: 0.75, minimum_applied: false }]);
    const moneyEls = await page.evaluate(() => [...window.__panel.root.querySelectorAll('.money')].map(e => e.textContent));
    assert.equal(moneyEls.length, 1);
  });

  // 14. Multi-service: graffiti + moss + siding + gutter + concrete + deck + fence + windows + roof + heating-wire (10-way)
  await record('14. Multi-service: Graffiti + Moss + Siding + Gutter + Concrete + Deck + Fence + Windows + Roof + Heating Wire all coexist with correct independent totals', async () => {
    await freshPanel(page, { measurements: [
      graffiti('m-gf-1', 'sec-1', 'Front wall', 120),
      { id: 'm-ms-1', service_id: 'svc-moss', section_id: 'sec-1', label: 'Front roof', quantity: 400, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-sd-1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-gt-1', service_id: 'svc-gutter', section_id: 'sec-1', label: 'Front', quantity: 42, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-cn-1', service_id: 'svc-concrete', section_id: 'sec-1', label: 'Driveway', quantity: 1200, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-dk-1', service_id: 'svc-deck', section_id: 'sec-1', label: 'Main deck', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-f1', service_id: 'svc-fence', section_id: 'sec-1', label: 'Front fence', quantity: 80, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-w1', service_id: 'svc-windows', section_id: 'sec-1', label: 'Front', quantity: 6, unit: 'each', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-rf-1', service_id: 'svc-roof', section_id: 'sec-1', label: 'Main roof', quantity: 780, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }
    ] });
    await renderPanel([
      { service_id: 'svc-graffiti', amount: 90, unit_rate: 0.75, minimum_applied: false },
      { service_id: 'svc-moss', amount: 140, unit_rate: 0.35, minimum_applied: false },
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false },
      { service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false },
      { service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false },
      { service_id: 'svc-deck', amount: 210, unit_rate: 0.5, minimum_applied: false },
      { service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false },
      { service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false },
      { service_id: 'svc-roof', amount: 351, unit_rate: 0.45, minimum_applied: false },
      { service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true }
    ]);
    const totals = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2'));
      return cards.map(c => ({ title: c.querySelector('h2').textContent, total: c.querySelector('.money').textContent }));
    });
    assert.equal(totals.length, 10);
    assert.match(totals.find(t => t.title.includes('Graffiti')).total, /\$90/);
    assert.match(totals.find(t => t.title.includes('Moss')).total, /\$140/);
    assert.match(totals.find(t => t.title.includes('Siding')).total, /\$126/);
    assert.match(totals.find(t => t.title.includes('Gutter')).total, /\$56\.70/);
    assert.match(totals.find(t => t.title.includes('Concrete')).total, /\$300/);
    assert.match(totals.find(t => t.title.includes('Deck')).total, /\$210/);
    assert.match(totals.find(t => t.title.includes('Fence')).total, /\$160/);
    assert.match(totals.find(t => t.title.includes('Window')).total, /\$54/);
    assert.match(totals.find(t => t.title.includes('Roof')).total, /\$351/);
    assert.match(totals.find(t => t.title.includes('Heating Wire')).total, /\$420/);
  });

  // 15. Offline behavior
  await record('15. Offline add-area: createMeasurement returning null does not throw', async () => {
    await page.evaluate(async () => {
      if (window.__panel) window.__panel.root.remove();
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [{ id: 'svc-graffiti', key: 'graffiti', name: 'Graffiti Removal', unit: 'sq_ft', quotable: true, active: true, parent_key: null }], modifiers: [], siteFactors: [], sections: [{ id: 'sec-1', name: 'Front wall' }], pricingRules: [] };
      const createMeasurementFn = async () => null;
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {}, createMeasurementFn });
      document.body.appendChild(panel.root);
      window.__panel = panel;
      window.__panelMeasurements = [{ id: 'm1', service_id: 'svc-graffiti', section_id: 'sec-1', label: 'Front wall', quantity: 120, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] }];
      panel.render({ measurements: window.__panelMeasurements, pricing: [{ service_id: 'svc-graffiti', amount: 90, unit_rate: 0.75, minimum_applied: false }] });
    });
    let threw = false;
    try {
      await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add affected area').click(); });
      await page.waitForTimeout(60);
    } catch { threw = true; }
    assert.equal(threw, false);
  });

  // 16. Design test: Graffiti is NOT a Moss clone -- no job-wide control exists
  await record('16. Design test: no job-wide control exists (real data has no scope group for Graffiti, unlike Moss)', async () => {
    await freshPanel(page, { measurements: [graffiti('m1', 'sec-1', 'Front wall', 85), graffiti('m2', 'sec-2', 'Garage side', 42)] });
    await renderPanel([{ service_id: 'svc-graffiti', amount: 95.25, unit_rate: 0.75, minimum_applied: false }]);
    const hasJobWideControl = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('label')].find(l => /for this visit/i.test(l.textContent)));
    assert.equal(hasJobWideControl, false);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
