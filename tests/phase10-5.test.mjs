import assert from 'node:assert/strict';
import { createRecorder, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const FENCE = { id: 'svc-fence', key: 'fence', name: 'Fence Cleaning', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };

// Post-Phase-10.5 real data shape: Height's group_key is 'fence_height'
// (re-keyed from the generic, inert 'height'). group_label is still
// literally "Height" -- the migration deliberately did not rename it --
// so these fixtures intentionally keep group_label: 'Height' to prove the
// component's "Fence height" label is a presentation override, not a DB fact.
const MODIFIERS = [
  { id: 'm-cond-light', service_id: 'svc-fence', group_key: 'condition', group_label: 'Condition', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-normal', service_id: 'svc-fence', group_key: 'condition', group_label: 'Condition', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-cond-heavy', service_id: 'svc-fence', group_key: 'condition', group_label: 'Condition', option_key: 'heavy', label: 'Heavy', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 3 },
  { id: 'm-height-standard', service_id: 'svc-fence', group_key: 'fence_height', group_label: 'Height', option_key: 'standard', label: 'Standard', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-height-tall', service_id: 'svc-fence', group_key: 'fence_height', group_label: 'Height', option_key: 'tall', label: 'Tall', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-height-vtall', service_id: 'svc-fence', group_key: 'fence_height', group_label: 'Height', option_key: 'very_tall', label: 'Very tall', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 3 },
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

// Does NOT reuse BASE_FAKE_API_PANEL: this file's deleteMeasurement is
// deliberately a no-op (a real, pre-existing discrepancy from every other
// panel file's tracked version) -- concatenating onto the shared base
// would redeclare the same export twice and fail to load as a module.
const FAKE_API = `
  export async function createSection(jobId, section) {
    globalThis.__createSectionCalls = globalThis.__createSectionCalls || [];
    const id = 'new-sec-' + globalThis.__createSectionCalls.length;
    globalThis.__createSectionCalls.push({ jobId, section });
    return { id, job_id: jobId, ...section };
  }
  export async function updateMeasurement(id, patch) {
    globalThis.__updateMeasurementCalls = globalThis.__updateMeasurementCalls || [];
    globalThis.__updateMeasurementCalls.push({ id, patch });
    return { id, ...patch };
  }
  export async function deleteMeasurement(id) {}
  export async function setMeasurementModifier(measurementId, groupIds, newId) {
    globalThis.__setModifierCalls = globalThis.__setModifierCalls || [];
    globalThis.__setModifierCalls.push({ measurementId, groupIds, newId });
  }
  export async function deleteMeasurementAddon() {}
  export async function addMeasurementAddon() { return {}; }
`;

async function main() {
  const { browser, page } = await launchPanelPage({ fakeApi: FAKE_API, promptValue: 'New section' });

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
    }, { services: [FENCE], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements });
  }

  function renderPanel(pricing) {
    return page.evaluate((pricing) => window.__panel.render({ measurements: window.__panelMeasurements, pricing }), pricing);
  }

  const fence = (id, section_id, label, quantity, mods = []) => ({
    id, service_id: 'svc-fence', section_id, label, quantity, unit: 'linear_ft',
    measurement_modifiers: mods.map(modifier_id => ({ modifier_id })), job_measurement_addons: []
  });

  function heightSelectIn(box) {
    return [...box.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Fence height'))?.querySelector('select');
  }

  // 1. Label override: DB group_label is "Height", component shows "Fence height"
  await record('1. Fence height control renders with the overridden label, not the raw DB "Height" label', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const box = window.__panel.root.querySelector('.section-box');
      const labels = [...box.querySelectorAll('label > span')].map(s => s.textContent);
      return { labels, hasBareHeight: labels.includes('Height'), hasFenceHeight: labels.includes('Fence height') };
    });
    assert.equal(info.hasFenceHeight, true);
    assert.equal(info.hasBareHeight, false);
  });

  // 2. Default selection and real option set
  await record('2. Fence height defaults to Standard and offers Standard/Tall/Very tall', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const sel = [...window.__panel.root.querySelectorAll('.section-box label')].find(l => l.textContent.trim().startsWith('Fence height')).querySelector('select');
      return { selected: sel.selectedOptions[0].textContent, options: [...sel.options].map(o => o.textContent) };
    });
    assert.equal(info.selected, 'Standard');
    assert.deepEqual(info.options, ['Standard', 'Tall', 'Very tall']);
  });

  // 3. Three-group layout: Condition, Fence height, Material now share grid--3
  await record('3. Per-row modifier grid uses grid--3 (Condition + Fence height + Material)', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const box = window.__panel.root.querySelector('.section-box');
      const grid3 = box.querySelector('.grid--3');
      return { hasGrid3: !!grid3, labelCount: grid3 ? grid3.querySelectorAll('label').length : 0 };
    });
    assert.equal(info.hasGrid3, true);
    assert.equal(info.labelCount, 3);
  });

  // 4. Mixed heights: each fence row keeps its own independent selection
  await record('4. Mixed Fence height: each row keeps its own independent selection, no bleed', async () => {
    await freshPanel(page, { measurements: [
      fence('m1', 'sec-1', 'Front fence', 80, ['m-height-standard']),
      fence('m2', 'sec-2', 'Rear fence', 120, ['m-height-tall']),
      fence('m3', 'sec-1', 'Side fence', 65, ['m-height-vtall'])
    ] });
    await renderPanel([{ service_id: 'svc-fence', amount: 1000, unit_rate: 2, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Fence height'))?.querySelector('select')?.selectedOptions[0]?.textContent);
    });
    assert.deepEqual(picked, ['Standard', 'Tall', 'Very tall']);
  });

  // 5. Changing height on one row only calls setMeasurementModifier for
  // THAT row -- it is a per-row control, not fanned out like Sides.
  await record('5. Changing Fence height on one row updates only that measurement, not every row', async () => {
    await freshPanel(page, { measurements: [
      fence('m1', 'sec-1', 'Front fence', 80, ['m-height-standard']),
      fence('m2', 'sec-2', 'Rear fence', 120, ['m-height-standard'])
    ] });
    await renderPanel([{ service_id: 'svc-fence', amount: 400, unit_rate: 2, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      const sel = [...boxes[0].querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Fence height')).querySelector('select');
      sel.value = 'm-height-vtall';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(80);
    const calls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].measurementId, 'm1');
    assert.equal(calls[0].newId, 'm-height-vtall');
  });

  // 6. Duplicate copies the source row's Fence height selection too
  await record('6. Duplicate copies Fence height along with Condition/Material/Sides', async () => {
    const source = fence('m1', 'sec-2', 'Rear fence', 120, ['m-cond-heavy', 'm-mat-wood', 'm-sides-both', 'm-height-vtall']);
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-fence', amount: 596.16, unit_rate: 2, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate').click(); });
    await page.waitForTimeout(80);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-height-vtall'), 'expected the duplicate to copy the Very tall selection');
  });

  // 7. Adding a new fence section seeds the default Fence height (Standard)
  await record('7. + Add fence section seeds the new row with the default Fence height', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80, ['m-height-tall'])] });
    await renderPanel([{ service_id: 'svc-fence', amount: 176, unit_rate: 2, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add fence section').click(); });
    await page.waitForTimeout(80);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-height-standard'), 'expected the new row to be seeded with the Standard default');
  });

  // 8. The old "not yet part of this calculation" note is gone; the
  // remaining hint mentions only gates.
  await record('8. Bottom hint no longer claims height is unpriced; mentions only gates', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 160, unit_rate: 2, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const hints = [...window.__panel.root.querySelectorAll('p.hint')].map(p => p.textContent);
      return { mentionsHeightUnpriced: hints.some(h => /height.*not yet part/i.test(h)), mentionsGates: hints.some(h => /gates are not part/i.test(h)) };
    });
    assert.equal(info.mentionsHeightUnpriced, false);
    assert.equal(info.mentionsGates, true);
  });

  // 9. Sides remains the one job-wide control; Fence height is NOT folded into it
  await record('9. Sides remains the single job-wide control, separate from the per-row Fence height controls', async () => {
    await freshPanel(page, { measurements: [fence('m1', 'sec-1', 'Front fence', 80), fence('m2', 'sec-2', 'Rear fence', 120)] });
    await renderPanel([{ service_id: 'svc-fence', amount: 400, unit_rate: 2, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const sidesControls = [...window.__panel.root.querySelectorAll('label')].filter(l => l.textContent.includes('Sides for this visit'));
      const heightControlsInRows = [...window.__panel.root.querySelectorAll('.section-box')].map(box =>
        !![...box.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Fence height')));
      return { sidesControlCount: sidesControls.length, heightControlsInRows };
    });
    assert.equal(info.sidesControlCount, 1);
    assert.deepEqual(info.heightControlsInRows, [true, true]);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
