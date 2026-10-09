import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const MOSS = { id: 'svc-moss', key: 'moss', name: 'Moss Removal', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const GUTTER = { id: 'svc-gutter', key: 'gutter_brightening', name: 'Gutter Brightening', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const CONCRETE = { id: 'svc-concrete', key: 'concrete', name: 'Concrete / Pressure Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const DECK = { id: 'svc-deck', key: 'deck', name: 'Deck / Wood Cleaning', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const FENCE = { id: 'svc-fence', key: 'fence', name: 'Fence Cleaning', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const WINDOWS = { id: 'svc-windows', key: 'windows', name: 'Window Cleaning', unit: 'each', category: 'cleaning', quotable: true, active: true, parent_key: null };
const ROOF = { id: 'svc-roof', key: 'roof_soft_wash', name: 'Roof Soft Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const ALL_SERVICES = [MOSS, SIDING, GUTTER, CONCRETE, DECK, FENCE, WINDOWS, ROOF, HW];

// Mirrors the real configured Moss Removal modifiers.
const MODIFIERS = [
  { id: 'm-access-easy', service_id: 'svc-moss', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-access-difficult', service_id: 'svc-moss', group_key: 'access', group_label: 'Access', option_key: 'difficult', label: 'Difficult', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-access-vdifficult', service_id: 'svc-moss', group_key: 'access', group_label: 'Access', option_key: 'very_difficult', label: 'Very difficult', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 3 },
  { id: 'm-cov-light', service_id: 'svc-moss', group_key: 'condition', group_label: 'Coverage', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cov-moderate', service_id: 'svc-moss', group_key: 'condition', group_label: 'Coverage', option_key: 'moderate', label: 'Moderate', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 2 },
  { id: 'm-cov-heavy', service_id: 'svc-moss', group_key: 'condition', group_label: 'Coverage', option_key: 'heavy', label: 'Heavy', kind: 'multiplier', value: 1.4, is_default: false, sort_order: 3 },
  { id: 'm-fu-onetime', service_id: 'svc-moss', group_key: 'scope', group_label: 'Follow-up', option_key: 'one_time', label: 'One-time', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-fu-preventative', service_id: 'svc-moss', group_key: 'scope', group_label: 'Follow-up', option_key: 'preventative', label: 'Plus preventative', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-surf-roof', service_id: 'svc-moss', group_key: 'surface', group_label: 'Surface', option_key: 'roof', label: 'Roof', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-surf-siding', service_id: 'svc-moss', group_key: 'surface', group_label: 'Surface', option_key: 'siding', label: 'Siding', kind: 'multiplier', value: 1.05, is_default: false, sort_order: 2 },
  { id: 'm-surf-walkway', service_id: 'svc-moss', group_key: 'surface', group_label: 'Surface', option_key: 'walkway', label: 'Walkway', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front roof', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear roof', storeys: '1_storey', access: 'difficult', ground: 'sloped', ladder: 'normal', distance: 'far' }
];

const PRICING_RULES = [
  { service_id: 'svc-moss', approval_status: 'approved', rate: 0.35, minimum: 149 }
];

const FAKE_API = BASE_FAKE_API_PANEL;

async function main() {
  const { browser, page } = await launchPanelPage({ fakeApi: FAKE_API, promptValue: 'Detached shed roof' });

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

  const moss = (id, section_id, label, quantity, mods = []) => ({
    id, service_id: 'svc-moss', section_id, label, quantity, unit: 'sq_ft',
    measurement_modifiers: mods.map(modifier_id => ({ modifier_id })), job_measurement_addons: []
  });

  // 1. Basic moss calculation
  await record('1. Basic Moss: one affected area renders with correct total', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 140, unit_rate: 0.35, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { title: card.querySelector('h2').textContent, total: card.querySelector('.money').textContent,
        heading: [...card.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent };
    });
    assert.match(info.title, /Moss/);
    assert.match(info.total, /\$140/);
    assert.match(info.heading, /400 sq ft total across 1 affected area/);
  });

  // 2. Multiple affected areas
  await record('2. Multiple affected areas: total sums correctly', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400), moss('m2', 'sec-2', 'Rear roof', 180), moss('m3', 'sec-1', 'Garage roof', 90)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 240.1, unit_rate: 0.35, minimum_applied: false }]);
    const heading = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent);
    assert.match(heading, /670 sq ft total across 3 affected areas/);
  });

  // 3. Mixed Coverage (severity) stays per-area, never bled into the whole job
  await record('3. Mixed Coverage: each affected area keeps its own independent selection', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400, ['m-cov-light']), moss('m2', 'sec-2', 'Rear roof', 180, ['m-cov-heavy'])] });
    await renderPanel([{ service_id: 'svc-moss', amount: 400, unit_rate: 0.35, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Coverage'))?.selectedOptions[0]?.textContent);
    });
    assert.equal(picked[0], 'Light');
    assert.equal(picked[1], 'Heavy');
  });

  // 4. Access is section-driven (real, live group -- not rendered as a per-row control)
  await record('4. Access has no per-row control (section-driven); section hint names it correctly', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-2', 'Rear roof', 180)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 72.45, unit_rate: 0.35, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const root = window.__panel.root;
      return {
        hasAccessDropdown: !![...root.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Access')),
        hint: [...root.querySelectorAll('p.hint')].find(p => /Access comes from/.test(p.textContent))?.textContent
      };
    });
    assert.equal(info.hasAccessDropdown, false);
    assert.match(info.hint, /Access comes from "Rear roof" \(difficult access\)/);
  });

  // 5. Mixed Surface
  await record('5. Mixed Surface: each affected area keeps its own independent selection', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400, ['m-surf-roof']), moss('m2', 'sec-2', 'Walkway', 60, ['m-surf-walkway'])] });
    await renderPanel([{ service_id: 'svc-moss', amount: 206, unit_rate: 0.35, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Surface'))?.selectedOptions[0]?.textContent);
    });
    assert.equal(picked[0], 'Roof');
    assert.equal(picked[1], 'Walkway');
  });

  // 6. No addon control (none configured for moss)
  await record('6. No flat-addon control exists (no kind=flat modifiers configured for Moss)', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 140, unit_rate: 0.35, minimum_applied: false }]);
    const hasAddonUi = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('button,label')].find(el => /addon/i.test(el.textContent)));
    assert.equal(hasAddonUi, false);
  });

  // 7. Follow-up (job-wide) renders once and fans out
  await record('7a. Follow-up renders as exactly one job-level control, not per-area', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400), moss('m2', 'sec-2', 'Rear roof', 180)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 203, unit_rate: 0.35, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const fuLabels = [...window.__panel.root.querySelectorAll('label')].filter(l => l.textContent.includes('Follow-up'));
      const rowFuSelects = [...window.__panel.root.querySelectorAll('.section-box select')].filter(s => s.closest('label')?.textContent.includes('Follow-up'));
      return { fuControlCount: fuLabels.length, rowFuSelectCount: rowFuSelects.length };
    });
    assert.equal(info.fuControlCount, 1);
    assert.equal(info.rowFuSelectCount, 0);
  });

  await record('7b. Changing Follow-up fans out setMeasurementModifier to every existing affected area', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400, ['m-fu-onetime']), moss('m2', 'sec-2', 'Rear roof', 180, ['m-fu-onetime'])] });
    await renderPanel([{ service_id: 'svc-moss', amount: 203, unit_rate: 0.35, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => {
      const label = [...window.__panel.root.querySelectorAll('label')].find(l => l.textContent.includes('Follow-up for this visit'));
      const sel = label.querySelector('select');
      sel.value = 'm-fu-preventative';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(80);
    const calls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(c => c.newId === 'm-fu-preventative'));
  });

  // 8. Duplicate
  await record('8. Duplicate: copies section, sq ft, Coverage + Surface + Follow-up -- not review/reason/notes', async () => {
    const source = moss('m1', 'sec-2', 'Rear roof', 180, ['m-cov-heavy', 'm-surf-siding', 'm-fu-preventative']);
    source.review_required = true;
    source.review_reason = 'Unsure how far growth extends under the ridge cap';
    source.notes = 'Growth concentrated on north-facing slope, shaded by trees';
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-moss', amount: 130.57, unit_rate: 0.35, minimum_applied: false }]);
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
    assert.ok(modCalls.some(c => c.newId === 'm-cov-heavy'));
    assert.ok(modCalls.some(c => c.newId === 'm-surf-siding'));
    assert.ok(modCalls.some(c => c.newId === 'm-fu-preventative'));
  });

  // 9. Remove / edit
  await record('9a. Remove affected area: calls deleteMeasurement after confirm', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 140, unit_rate: 0.35, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Remove').click(); });
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.deepEqual(deleted, ['m1']);
  });

  await record('9b. Edit affected area: rename and area change both persist', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 140, unit_rate: 0.35, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const nameInput = window.__panel.root.querySelector('input[aria-label="Affected area name"]');
      nameInput.value = 'Main roof, north slope';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      const qtyInput = window.__panel.root.querySelector('input[aria-label="Affected area (sq ft)"]');
      qtyInput.value = '450';
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => (globalThis.__updateMeasurementCalls || []).some(c => c.patch.quantity === 450));
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.ok(calls.some(c => c.patch.label === 'Main roof, north slope'));
    assert.ok(calls.some(c => c.patch.quantity === 450));
  });

  // 10. Minimum charge
  await record('10. Minimum charge: card shows "minimum applied" without replacing the total', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Small patch', 100)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 149, unit_rate: 0.35, minimum_applied: true }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { total: card.querySelector('.money').textContent, rateLine: card.querySelector('p').textContent };
    });
    assert.match(info.total, /\$149/);
    assert.match(info.rateLine, /minimum applied/);
  });

  // 11. Review required
  await record('11. Review flag toggles review_required without touching quantity/section/label', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 140, unit_rate: 0.35, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => { window.__panel.root.querySelector('input[type=checkbox]').click(); });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].patch.review_required, true);
    assert.equal('quantity' in calls[0].patch, false);
    assert.equal('label' in calls[0].patch, false);
  });

  // 12. Manual adjustment -- structural, stays quote-level
  await record('12. No manual-adjustment UI inside the calculator (quote-level concept)', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 140, unit_rate: 0.35, minimum_applied: false }]);
    const hasAdjustmentUi = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('button,label')].find(el => /adjustment/i.test(el.textContent)));
    assert.equal(hasAdjustmentUi, false);
  });

  // 13/14. Quote version + customer rendering -- structural checks; real
  // end-to-end path verified against the live DB separately.
  await record('13. No bespoke RPC/quote-pathway reference anywhere in the component source', async () => {
    const src = await page.evaluate(async () => (await (await fetch('/admin/js/components/moss-removal-calculator.js')).text()));
    assert.doesNotMatch(src, /create_quote_from_calculation|createQuoteFromCalculation|recalculate_quote/);
  });

  await record('14. No per-row dollar figure is invented in the DOM (only the card-level total, from pricedRows)', async () => {
    await freshPanel(page, { measurements: [moss('m1', 'sec-1', 'Front roof', 400), moss('m2', 'sec-2', 'Rear roof', 180)] });
    await renderPanel([{ service_id: 'svc-moss', amount: 203, unit_rate: 0.35, minimum_applied: false }]);
    const moneyEls = await page.evaluate(() => [...window.__panel.root.querySelectorAll('.money')].map(e => e.textContent));
    assert.equal(moneyEls.length, 1);
  });

  // 15. Multi-service: moss + siding + gutter + concrete + deck + fence + windows + roof + heating-wire (9-way)
  await record('15. Multi-service: Moss + Siding + Gutter + Concrete + Deck + Fence + Windows + Roof + Heating Wire all coexist with correct independent totals', async () => {
    await freshPanel(page, { measurements: [
      moss('m-ms-1', 'sec-1', 'Front roof', 400),
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
    assert.equal(totals.length, 9);
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

  // 16. Offline behavior
  await record('16. Offline add-area: createMeasurement returning null does not throw', async () => {
    await page.evaluate(async () => {
      if (window.__panel) window.__panel.root.remove();
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [{ id: 'svc-moss', key: 'moss', name: 'Moss Removal', unit: 'sq_ft', quotable: true, active: true, parent_key: null }], modifiers: [], siteFactors: [], sections: [{ id: 'sec-1', name: 'Front roof' }], pricingRules: [] };
      const createMeasurementFn = async () => null;
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {}, createMeasurementFn });
      document.body.appendChild(panel.root);
      window.__panel = panel;
      window.__panelMeasurements = [{ id: 'm1', service_id: 'svc-moss', section_id: 'sec-1', label: 'Front roof', quantity: 400, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] }];
      panel.render({ measurements: window.__panelMeasurements, pricing: [{ service_id: 'svc-moss', amount: 140, unit_rate: 0.35, minimum_applied: false }] });
    });
    let threw = false;
    try {
      await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add affected area').click(); });
      await page.waitForTimeout(60);
    } catch { threw = true; }
    assert.equal(threw, false);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
