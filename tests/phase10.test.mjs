import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const FENCE = { id: 'svc-fence', key: 'fence', name: 'Fence Cleaning', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const GUTTER = { id: 'svc-gutter', key: 'gutter_brightening', name: 'Gutter Brightening', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const CONCRETE = { id: 'svc-concrete', key: 'concrete', name: 'Concrete / Pressure Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const DECK = { id: 'svc-deck', key: 'deck', name: 'Deck / Wood Cleaning', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const WINDOWS = { id: 'svc-windows', key: 'windows', name: 'Window Cleaning', unit: 'each', category: 'cleaning', quotable: true, active: true, parent_key: null };
const ROOF = { id: 'svc-roof', key: 'roof_soft_wash', name: 'Roof Soft Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const VALLEY1 = { id: 'svc-v1', key: 'winter_deicing_cables_valley_1st', name: 'Heating Wire — Valley (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const ALL_SERVICES = [FENCE, SIDING, GUTTER, CONCRETE, DECK, WINDOWS, ROOF, HW, VALLEY1];

// Mirrors the real configured fence modifiers. Phase 10.5 re-keyed Height
// from group_key='height' (inert -- see git history) to 'fence_height'
// (live, per-row), so this fixture reflects the post-fix data.
const MODIFIERS = [
  { id: 'm-cond-light', service_id: 'svc-fence', group_key: 'condition', group_label: 'Condition', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-heavy', service_id: 'svc-fence', group_key: 'condition', group_label: 'Condition', option_key: 'heavy', label: 'Heavy', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 3 },
  { id: 'm-height-standard', service_id: 'svc-fence', group_key: 'fence_height', group_label: 'Height', option_key: 'standard', label: 'Standard', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-height-tall', service_id: 'svc-fence', group_key: 'fence_height', group_label: 'Height', option_key: 'tall', label: 'Tall', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-sides-one', service_id: 'svc-fence', group_key: 'scope', group_label: 'Sides', option_key: 'one', label: 'One side', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-sides-both', service_id: 'svc-fence', group_key: 'scope', group_label: 'Sides', option_key: 'both', label: 'Both sides', kind: 'multiplier', value: 1.8, is_default: false, sort_order: 2 },
  { id: 'm-mat-vinyl', service_id: 'svc-fence', group_key: 'surface', group_label: 'Material', option_key: 'vinyl', label: 'Vinyl', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-mat-wood', service_id: 'svc-fence', group_key: 'surface', group_label: 'Material', option_key: 'wood', label: 'Wood', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '1_storey', access: 'easy', ground: 'sloped', ladder: 'normal', distance: 'far' }
];

const PRICING_RULES = [
  { service_id: 'svc-fence', approval_status: 'approved', rate: 2, minimum: 149 }
];

const FAKE_API = BASE_FAKE_API_PANEL;

async function main() {
  const { browser, page } = await launchPanelPage({ fakeApi: FAKE_API, promptValue: 'Detached enclosure' });

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

  const fence = (id, section_id, label, quantity, mods = []) => ({
    id, service_id: 'svc-fence', section_id, label, quantity, unit: 'linear_ft',
    measurement_modifiers: mods.map(modifier_id => ({ modifier_id })), job_measurement_addons: []
  });

  // 1. Basic fence
  await record('1. Basic fence: one section renders with correct total', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { title: card.querySelector('h2').textContent, total: card.querySelector('.money').textContent,
        heading: [...card.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent };
    });
    assert.match(info.title, /Fence/);
    assert.match(info.total, /\$160/);
    assert.match(info.heading, /80 linear ft total across 1 fence section/);
  });

  // 2. Multiple fence sections
  await record('2. Multiple fence sections: total sums correctly', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80), fence('m2', 'sec-2', 'Rear fence', 120), fence('m3', 'sec-1', 'Side fence', 65)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 530, unit_rate: 2, minimum_applied: false }]);
    const heading = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent);
    assert.match(heading, /265 linear ft total across 3 fence sections/);
  });

  // 3. Mixed conditions
  await record('3. Mixed Condition: each fence section keeps its own independent selection', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80, ['m-cond-light']), fence('m2', 'sec-2', 'Rear fence', 120, ['m-cond-heavy'])] });
    await renderPanel([{ service_id: 'svc-fence', amount: 400, unit_rate: 2, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Condition'))?.selectedOptions[0]?.textContent);
    });
    assert.equal(picked[0], 'Light');
    assert.equal(picked[1], 'Heavy');
  });

  // 4. No access control (not configured for this service)
  await record('4. No Access control exists (real data has no access group for fence)', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
    const hasAccess = await page.evaluate(() => !![...window.__panel.root.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Access')));
    assert.equal(hasAccess, false);
  });

  // 5. Mixed material
  await record('5. Mixed Material: each fence section keeps its own independent selection', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80, ['m-mat-vinyl']), fence('m2', 'sec-2', 'Rear fence', 120, ['m-mat-wood'])] });
    await renderPanel([{ service_id: 'svc-fence', amount: 400, unit_rate: 2, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Material'))?.selectedOptions[0]?.textContent);
    });
    assert.equal(picked[0], 'Vinyl');
    assert.equal(picked[1], 'Wood');
  });

  // 6. Whole-service scope (Sides) -- job-wide, one control, fans out
  await record('6a. Sides renders as exactly one job-level control, not per-row', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80), fence('m2', 'sec-2', 'Rear fence', 120)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 400, unit_rate: 2, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const sidesLabels = [...window.__panel.root.querySelectorAll('label')].filter(l => l.textContent.includes('Sides'));
      const rowSidesSelects = [...window.__panel.root.querySelectorAll('.section-box select')].filter(s => s.closest('label')?.textContent.includes('Sides'));
      return { sidesControlCount: sidesLabels.length, rowSidesSelectCount: rowSidesSelects.length };
    });
    assert.equal(info.sidesControlCount, 1);
    assert.equal(info.rowSidesSelectCount, 0);
  });

  await record('6b. Changing Sides fans out setMeasurementModifier to every existing fence section', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80, ['m-sides-one']), fence('m2', 'sec-2', 'Rear fence', 120, ['m-sides-one'])] });
    await renderPanel([{ service_id: 'svc-fence', amount: 400, unit_rate: 2, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => {
      const label = [...window.__panel.root.querySelectorAll('label')].find(l => l.textContent.includes('Sides for this visit'));
      const sel = label.querySelector('select');
      sel.value = 'm-sides-both';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(80);
    const calls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(c => c.newId === 'm-sides-both'));
  });

  // 7. No configured addon or gate control; Fence height IS now a real,
  // functional per-row control (Phase 10.5) -- see phase10-5.test.mjs for
  // the dedicated deep-dive on that control specifically.
  await record('7. No flat-addon or gate control exists; Fence height renders as a real per-row control', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const root = window.__panel.root;
      return {
        hasGate: !![...root.querySelectorAll('label,h3')].find(l => /gate/i.test(l.textContent)),
        heightLabel: [...root.querySelectorAll('.section-box label')].find(l => l.textContent.trim().startsWith('Fence height'))?.querySelector('select')?.selectedOptions[0]?.textContent,
        hasOldHeightNote: !![...root.querySelectorAll('p')].find(p => /height.*not yet part/i.test(p.textContent)),
        hasGateNote: !![...root.querySelectorAll('p')].find(p => /gates are not part/i.test(p.textContent))
      };
    });
    assert.equal(info.hasGate, false);
    assert.equal(info.heightLabel, 'Standard');
    assert.equal(info.hasOldHeightNote, false);
    assert.equal(info.hasGateNote, true);
  });

  // 8. Duplicate
  await record('8. Duplicate: copies section, footage, Condition + Material + Sides -- not review/reason/notes', async () => {
    const source = fence('m1', 'sec-2', 'Rear fence', 120, ['m-cond-heavy', 'm-mat-wood', 'm-sides-both']);
    source.review_required = true;
    source.review_reason = 'Unsure if panels are rotted';
    source.notes = '6ft privacy fence, gate at east corner';
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-fence', amount: 496.8, unit_rate: 2, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate').click(); });
    await page.waitForTimeout(80);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.section_id, 'sec-2');
    assert.equal(created[0].m.quantity, 120);
    assert.match(created[0].m.label, /\(copy\)$/);
    assert.equal('review_required' in created[0].m, false);
    assert.equal('notes' in created[0].m, false);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-cond-heavy'));
    assert.ok(modCalls.some(c => c.newId === 'm-mat-wood'));
    assert.ok(modCalls.some(c => c.newId === 'm-sides-both'));
  });

  // 9. Remove / edit
  await record('9a. Remove fence section: calls deleteMeasurement after confirm', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Remove').click(); });
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.deepEqual(deleted, ['m1']);
  });

  await record('9b. Edit fence section: rename and footage change both persist', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const nameInput = window.__panel.root.querySelector('input[aria-label="Fence section name"]');
      nameInput.value = 'Main Front Fence';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      const qtyInput = window.__panel.root.querySelector('input[aria-label="Linear feet"]');
      qtyInput.value = '85';
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => (globalThis.__updateMeasurementCalls || []).some(c => c.patch.quantity === 85));
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.ok(calls.some(c => c.patch.label === 'Main Front Fence'));
    assert.ok(calls.some(c => c.patch.quantity === 85));
  });

  // 10. Minimum charge
  await record('10. Minimum charge: card shows "minimum applied" without replacing the total', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Small enclosure', 20)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 149, unit_rate: 2, minimum_applied: true }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { total: card.querySelector('.money').textContent, rateLine: card.querySelector('p').textContent };
    });
    assert.match(info.total, /\$149/);
    assert.match(info.rateLine, /minimum applied/);
  });

  // 11. Review required
  await record('11. Review flag toggles review_required without touching quantity/section/label', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
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
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
    const hasAdjustmentUi = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('button,label')].find(el => /adjustment/i.test(el.textContent)));
    assert.equal(hasAdjustmentUi, false);
  });

  // 13/14. Quote version + customer rendering -- structural checks; real
  // end-to-end path verified against the live DB separately.
  await record('13. No bespoke RPC/quote-pathway reference anywhere in the component source', async () => {
    const src = await page.evaluate(async () => (await (await fetch('/admin/js/components/fence-cleaning-calculator.js')).text()));
    assert.doesNotMatch(src, /create_quote_from_calculation|createQuoteFromCalculation|recalculate_quote/);
  });

  await record('14. No per-row dollar figure is invented in the DOM (only the card-level total, from pricedRows)', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80), fence('m2', 'sec-2', 'Rear fence', 120)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 400, unit_rate: 2, minimum_applied: false }]);
    const moneyEls = await page.evaluate(() => [...window.__panel.root.querySelectorAll('.money')].map(e => e.textContent));
    assert.equal(moneyEls.length, 1);
  });

  // 15. Multi-service: fence + siding + gutter + concrete + deck + windows + roof + heating-wire (8-way)
  await record('15. Multi-service: Fence + Siding + Gutter + Concrete + Deck + Windows + Roof + Heating Wire all coexist with correct independent totals', async () => {
    await freshPanel(page, { measurements: [
      fence('m-f1', 'sec-1', 'Front fence', 80),
      { id: 'm-sd-1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-gt-1', service_id: 'svc-gutter', section_id: 'sec-1', label: 'Front', quantity: 42, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-cn-1', service_id: 'svc-concrete', section_id: 'sec-1', label: 'Driveway', quantity: 1200, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-dk-1', service_id: 'svc-deck', section_id: 'sec-1', label: 'Main deck', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-w1', service_id: 'svc-windows', section_id: 'sec-1', label: 'Front', quantity: 6, unit: 'each', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-rf-1', service_id: 'svc-roof', section_id: 'sec-1', label: 'Main roof', quantity: 780, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }
    ] });
    await renderPanel([
      { service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false },
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false },
      { service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false },
      { service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false },
      { service_id: 'svc-deck', amount: 210, unit_rate: 0.5, minimum_applied: false },
      { service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false },
      { service_id: 'svc-roof', amount: 351, unit_rate: 0.45, minimum_applied: false },
      { service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true }
    ]);
    const totals = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2'));
      return cards.map(c => ({ title: c.querySelector('h2').textContent, total: c.querySelector('.money').textContent }));
    });
    assert.equal(totals.length, 8);
    assert.match(totals.find(t => t.title.includes('Fence')).total, /\$160/);
    assert.match(totals.find(t => t.title.includes('Siding')).total, /\$126/);
    assert.match(totals.find(t => t.title.includes('Gutter')).total, /\$56\.70/);
    assert.match(totals.find(t => t.title.includes('Concrete')).total, /\$300/);
    assert.match(totals.find(t => t.title.includes('Deck')).total, /\$210/);
    assert.match(totals.find(t => t.title.includes('Window')).total, /\$54/);
    assert.match(totals.find(t => t.title.includes('Roof')).total, /\$351/);
    assert.match(totals.find(t => t.title.includes('Heating Wire')).total, /\$420/);
  });

  // 16. Offline behavior
  await record('16. Offline add-section: createMeasurement returning null does not throw', async () => {
    await page.evaluate(async () => {
      if (window.__panel) window.__panel.root.remove();
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [{ id: 'svc-fence', key: 'fence', name: 'Fence Cleaning', unit: 'linear_ft', quotable: true, active: true, parent_key: null }], modifiers: [], siteFactors: [], sections: [{ id: 'sec-1', name: 'Front' }], pricingRules: [] };
      const createMeasurementFn = async () => null;
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {}, createMeasurementFn });
      document.body.appendChild(panel.root);
      window.__panel = panel;
      window.__panelMeasurements = [{ id: 'm1', service_id: 'svc-fence', section_id: 'sec-1', label: 'Front fence', quantity: 80, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }];
      panel.render({ measurements: window.__panelMeasurements, pricing: [{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }] });
    });
    let threw = false;
    try {
      await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add fence section').click(); });
      await page.waitForTimeout(60);
    } catch { threw = true; }
    assert.equal(threw, false);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
