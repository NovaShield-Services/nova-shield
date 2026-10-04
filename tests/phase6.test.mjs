import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const WINDOWS = { id: 'svc-windows', key: 'windows', name: 'Window Cleaning', unit: 'each', category: 'cleaning', quotable: true, active: true, parent_key: null };
const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const GUTTER = { id: 'svc-gutter', key: 'gutter_brightening', name: 'Gutter Brightening', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const VALLEY1 = { id: 'svc-v1', key: 'winter_deicing_cables_valley_1st', name: 'Heating Wire — Valley (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const ALL_SERVICES = [WINDOWS, SIDING, GUTTER, HW, VALLEY1];

// Mirrors the real configured windows modifiers.
const MODIFIERS = [
  { id: 'm-h-1', service_id: 'svc-windows', group_key: 'height', group_label: 'Height', option_key: '1_storey', label: 'Ground floor', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-h-2', service_id: 'svc-windows', group_key: 'height', group_label: 'Height', option_key: '2_storey', label: '2 storeys', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-scope-ext', service_id: 'svc-windows', group_key: 'scope', group_label: 'Scope', option_key: 'exterior_only', label: 'Exterior only', kind: 'multiplier', value: 0.7, is_default: true, sort_order: 1 },
  { id: 'm-scope-both', service_id: 'svc-windows', group_key: 'scope', group_label: 'Scope', option_key: 'interior_exterior', label: 'Interior + exterior', kind: 'multiplier', value: 1, is_default: false, sort_order: 2 },
  { id: 'm-type-std', service_id: 'svc-windows', group_key: 'surface', group_label: 'Window type', option_key: 'standard', label: 'Standard', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-type-panes', service_id: 'svc-windows', group_key: 'surface', group_label: 'Window type', option_key: 'many_panes', label: 'Many panes / divided', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-type-storm', service_id: 'svc-windows', group_key: 'surface', group_label: 'Window type', option_key: 'storm', label: 'Storm / difficult', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-windows', approval_status: 'approved', rate: 9, minimum: 149 }
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

  const grp = (id, section_id, label, quantity, mods = []) => ({
    id, service_id: 'svc-windows', section_id, label, quantity, unit: 'each',
    measurement_modifiers: mods.map(modifier_id => ({ modifier_id })), job_measurement_addons: []
  });

  await record('Count buckets: total matches sum across groups, "windows" not "each"', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front ground standard', 6), grp('m2', 'sec-2', 'Rear upper standard', 4)] });
    await renderPanel([{ service_id: 'svc-windows', amount: 90, unit_rate: 9, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return {
        title: card.querySelector('h2').textContent,
        total: card.querySelector('.money').textContent,
        heading: [...card.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent
      };
    });
    assert.match(info.title, /Window Cleaning/);
    assert.match(info.total, /\$90/);
    assert.match(info.heading, /10 windows total across 2 groups/);
  });

  await record('Height is section-driven: Front (1 storey) and Rear (2 storey) each show their own hint', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 6), grp('m2', 'sec-2', 'Rear', 4)] });
    await renderPanel([{ service_id: 'svc-windows', amount: 90, unit_rate: 9, minimum_applied: false }]);
    // Scoped to the component's own per-row phrase ("Height comes from") --
    // the panel's own closing hint ("Height and access come from...") also
    // contains the word "Height" and would otherwise be a 3rd false match.
    const hints = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.hint')].map(h => h.textContent).filter(t => t.includes('Height comes from')));
    assert.equal(hints.length, 2);
    assert.ok(hints.some(h => h.includes('Front') && h.includes('1 storey')));
    assert.ok(hints.some(h => h.includes('Rear') && h.includes('2 storey')));
  });

  await record('Window type is independent per group: Front=standard, Rear=storm', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 6, ['m-type-std']), grp('m2', 'sec-2', 'Rear', 4, ['m-type-storm'])] });
    await renderPanel([{ service_id: 'svc-windows', amount: 90, unit_rate: 9, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Window type'))?.selectedOptions[0]?.textContent);
    });
    assert.equal(picked[0], 'Standard');
    assert.equal(picked[1], 'Storm / difficult');
  });

  await record('Scope renders as exactly one job-level control, not per-row', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 6), grp('m2', 'sec-2', 'Rear', 4)] });
    await renderPanel([{ service_id: 'svc-windows', amount: 90, unit_rate: 9, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const scopeLabels = [...window.__panel.root.querySelectorAll('label')].filter(l => l.textContent.includes('Scope'));
      const rowScopeSelects = [...window.__panel.root.querySelectorAll('.section-box select')].filter(s => s.closest('label')?.textContent.includes('Scope'));
      return { scopeControlCount: scopeLabels.length, rowScopeSelectCount: rowScopeSelects.length };
    });
    assert.equal(info.scopeControlCount, 1);
    assert.equal(info.rowScopeSelectCount, 0);
  });

  await record('Changing Scope fans out setMeasurementModifier to every existing group', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 6, ['m-scope-ext']), grp('m2', 'sec-2', 'Rear', 4, ['m-scope-ext'])] });
    await renderPanel([{ service_id: 'svc-windows', amount: 90, unit_rate: 9, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => {
      const label = [...window.__panel.root.querySelectorAll('label')].find(l => l.textContent.includes('Scope for this visit'));
      const sel = label.querySelector('select');
      sel.value = 'm-scope-both';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(80);
    const calls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(c => c.newId === 'm-scope-both'));
  });

  await record('Stepper: + increases count via updateMeasurement, never creates/deletes the row', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 6)] });
    await renderPanel([{ service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; globalThis.__createCalls = []; globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { window.__panel.root.querySelector('button[aria-label="More"]').click(); });
    await page.waitForTimeout(60);
    await page.evaluate(() => { window.__panel.root.querySelector('button[aria-label="More"]').click(); });
    await page.waitForTimeout(60);
    const updates = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    const creates = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(creates.length, 0);
    assert.equal(updates.length, 2);
    assert.equal(updates[0].patch.quantity, 7);
    assert.equal(updates[1].patch.quantity, 8); // not 7 again -- confirms count is reassigned, not read from the stale initial value
  });

  await record('Stepper: minus never goes below zero and never deletes the row', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 0)] });
    await renderPanel([{ service_id: 'svc-windows', amount: 0, unit_rate: 9, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { window.__panel.root.querySelector('button[aria-label="Fewer"]').click(); });
    await page.waitForTimeout(60);
    const updates = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    const deletes = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.equal(deletes.length, 0);
    assert.equal(updates[0].patch.quantity, 0);
  });

  await record('Minimum charge: card shows "minimum applied" without replacing the total', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 2)] });
    await renderPanel([{ service_id: 'svc-windows', amount: 149, unit_rate: 9, minimum_applied: true }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { total: card.querySelector('.money').textContent, rateLine: card.querySelector('p').textContent };
    });
    assert.match(info.total, /\$149/);
    assert.match(info.rateLine, /minimum applied/);
  });

  await record('Review flag toggles review_required without touching quantity/section/label', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 6)] });
    await renderPanel([{ service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => { window.__panel.root.querySelector('input[type=checkbox]').click(); });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].patch.review_required, true);
    assert.equal('quantity' in calls[0].patch, false);
    assert.equal('section_id' in calls[0].patch, false);
    assert.equal('label' in calls[0].patch, false);
  });

  await record('No duplicate button anywhere in this calculator (deliberate)', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 6)] });
    await renderPanel([{ service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false }]);
    const hasDuplicate = await page.evaluate(() => !![...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate'));
    assert.equal(hasDuplicate, false);
  });

  await record('Add window group: picks up current visit-wide Scope and Window-type default', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 6, ['m-scope-both'])] });
    await renderPanel([{ service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add window group').click(); });
    await page.waitForTimeout(80);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-scope-both')); // current visit scope, not scope's own default (exterior_only)
    assert.ok(modCalls.some(c => c.newId === 'm-type-std')); // window type's own default
  });

  await record('No child-service behavior: windows never spawns a second card or extra service rows', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 6)] });
    await renderPanel([{ service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false }]);
    const serviceCardCount = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2')).length);
    assert.equal(serviceCardCount, 1);
  });

  // Three-way multi-service coexistence (explicitly required)
  await record('Multi-service: Windows + Siding + Gutter Brightening + Heating Wire all coexist with correct independent totals', async () => {
    await freshPanel(page, { measurements: [
      grp('m-w1', 'sec-1', 'Front', 6),
      { id: 'm-sd-1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-gt-1', service_id: 'svc-gutter', section_id: 'sec-1', label: 'Front', quantity: 42, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }
    ] });
    await renderPanel([
      { service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false },
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false },
      { service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false },
      { service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true }
    ]);
    const totals = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2'));
      return cards.map(c => ({ title: c.querySelector('h2').textContent, total: c.querySelector('.money').textContent }));
    });
    assert.equal(totals.length, 4);
    assert.match(totals.find(t => t.title.includes('Window')).total, /\$54/);
    assert.match(totals.find(t => t.title.includes('Siding')).total, /\$126/);
    assert.match(totals.find(t => t.title.includes('Gutter')).total, /\$56\.70/);
    assert.match(totals.find(t => t.title.includes('Heating Wire')).total, /\$420/);
  });

  await record('Interaction model is distinct: uses steppers (unlike Siding/Gutter), has no bracket section or eave/downspout split (unlike Heating Wire)', async () => {
    await freshPanel(page, { measurements: [grp('m1', 'sec-1', 'Front', 6)] });
    await renderPanel([{ service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const root = window.__panel.root;
      return {
        hasSteppers: !![...root.querySelectorAll('button')].find(b => b.textContent === '−' || b.textContent === '+'),
        hasNumberInput: !![...root.querySelectorAll('input[type=number]')].length,
        hasBracketSection: !![...root.querySelectorAll('*')].find(el => /bracket/i.test(el.textContent || ''))
      };
    });
    assert.equal(info.hasSteppers, true);
    assert.equal(info.hasNumberInput, false); // quantity is stepped, never typed
    assert.equal(info.hasBracketSection, false);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
