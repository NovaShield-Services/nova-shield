import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const GUTTER = { id: 'svc-gutter', key: 'gutter_brightening', name: 'Gutter Brightening', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const VALLEY1 = { id: 'svc-v1', key: 'winter_deicing_cables_valley_1st', name: 'Heating Wire — Valley (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const ALL_SERVICES = [GUTTER, SIDING, HW, VALLEY1];

// Mirrors the real configured gutter_brightening modifiers.
const MODIFIERS = [
  { id: 'm-acc-easy', service_id: 'svc-gutter', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-ox-light', service_id: 'svc-gutter', group_key: 'condition', group_label: 'Oxidation', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-ox-normal', service_id: 'svc-gutter', group_key: 'condition', group_label: 'Oxidation', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-ox-tiger', service_id: 'svc-gutter', group_key: 'condition', group_label: 'Oxidation', option_key: 'tiger_striping', label: 'Visible tiger striping', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 3 },
  { id: 'm-ox-heavy', service_id: 'svc-gutter', group_key: 'condition', group_label: 'Oxidation', option_key: 'heavy', label: 'Heavy oxidation', kind: 'multiplier', value: 1.4, is_default: false, sort_order: 4 },
  { id: 'm-scope-front', service_id: 'svc-gutter', group_key: 'scope', group_label: 'Scope', option_key: 'front', label: 'Front-facing', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-scope-full', service_id: 'svc-gutter', group_key: 'scope', group_label: 'Scope', option_key: 'full', label: 'Full exterior', kind: 'multiplier', value: 1.35, is_default: false, sort_order: 2 },
  { id: 'm-scope-fulldiff', service_id: 'svc-gutter', group_key: 'scope', group_label: 'Scope', option_key: 'full_difficult', label: 'Full + difficult sections', kind: 'multiplier', value: 1.5, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-gutter', approval_status: 'approved', rate: 1.35, minimum: 149 }
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

  const run = (id, section_id, label, quantity, mods = []) => ({
    id, service_id: 'svc-gutter', section_id, label, quantity, unit: 'linear_ft',
    measurement_modifiers: mods.map(modifier_id => ({ modifier_id })), job_measurement_addons: []
  });

  // Normal linear calc + "pure measurement summary" exact wording from the spec
  await record('Normal linear calc: total matches the spec example (42+55+24+18=139 ft across 4 sections)', async () => {
    await freshPanel(page, { measurements: [
      run('m1', 'sec-1', 'Front', 42), run('m2', 'sec-2', 'Rear', 55),
      run('m3', 'sec-1', 'Garage', 24), run('m4', 'sec-1', 'Addition', 18)
    ] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 187.65, unit_rate: 1.35, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return {
        title: card.querySelector('h2').textContent,
        total: card.querySelector('.money').textContent,
        heading: [...card.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent
      };
    });
    assert.match(info.title, /Gutter Brightening/);
    assert.match(info.total, /\$187\.65/);
    assert.match(info.heading, /139 linear ft total across 4 sections/);
  });

  // Mixed elevation UI: Front/Rear each show their own height
  await record('Mixed elevation: Front (1 storey) and Rear (2 storey) each show their own hint', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 42), run('m2', 'sec-2', 'Rear', 55)] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 131.0, unit_rate: 1.35, minimum_applied: false }]);
    const hints = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.hint')].map(h => h.textContent).filter(t => t.includes('Height/access')));
    assert.equal(hints.length, 2);
    assert.ok(hints.some(h => h.includes('Front') && h.includes('1 storey')));
    assert.ok(hints.some(h => h.includes('Rear') && h.includes('2 storey')));
  });

  // Oxidation is per-row and independent
  await record('Oxidation (condition) is independent per row: Front=light, Rear=heavy, each keeps its own selection', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 42, ['m-ox-light']), run('m2', 'sec-2', 'Rear', 55, ['m-ox-heavy'])] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 150, unit_rate: 1.35, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Oxidation'))?.selectedOptions[0]?.textContent);
    });
    assert.equal(picked[0], 'Light');
    assert.equal(picked[1], 'Heavy oxidation');
  });

  // Scope is a single job-level control, not per-row
  await record('Scope renders as exactly one job-level control, not a per-row dropdown', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 42), run('m2', 'sec-2', 'Rear', 55)] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 150, unit_rate: 1.35, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const scopeLabels = [...window.__panel.root.querySelectorAll('label')].filter(l => l.textContent.includes('Scope'));
      const rowScopeSelects = [...window.__panel.root.querySelectorAll('.section-box select')]
        .filter(s => s.closest('label')?.textContent.includes('Scope'));
      return { scopeControlCount: scopeLabels.length, rowScopeSelectCount: rowScopeSelects.length };
    });
    assert.equal(info.scopeControlCount, 1);
    assert.equal(info.rowScopeSelectCount, 0);
  });

  await record('Changing the job-level Scope control fans out setMeasurementModifier to every existing row', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 42, ['m-scope-front']), run('m2', 'sec-2', 'Rear', 55, ['m-scope-front'])] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 150, unit_rate: 1.35, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => {
      const label = [...window.__panel.root.querySelectorAll('label')].find(l => l.textContent.includes('Scope for this visit'));
      const sel = label.querySelector('select');
      sel.value = 'm-scope-full';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(80);
    const calls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.equal(calls.length, 2);
    assert.deepEqual(new Set(calls.map(c => c.measurementId)), new Set(['m1', 'm2']));
    assert.ok(calls.every(c => c.newId === 'm-scope-full'));
  });

  // Minimum charge
  await record('Minimum charge: card shows "minimum applied" without replacing the total', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 20)] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 149, unit_rate: 1.35, minimum_applied: true }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { total: card.querySelector('.money').textContent, rateLine: card.querySelector('p').textContent };
    });
    assert.match(info.total, /\$149/);
    assert.match(info.rateLine, /minimum applied/);
  });

  // Review required preserves measurements
  await record('Review flag toggles review_required without touching quantity/section/label', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 42)] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false }]);
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

  // Duplicate: copies section/quantity/modifiers (incl. scope), not review/notes
  await record('Duplicate: copies section, footage, Oxidation AND Scope -- not review flag/reason/notes', async () => {
    const source = run('m1', 'sec-2', 'Rear', 55, ['m-ox-heavy', 'm-scope-full']);
    source.review_required = true;
    source.review_reason = 'Unsure of fascia material';
    source.notes = 'Tree clearance required before access';
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 104, unit_rate: 1.35, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate').click(); });
    await page.waitForTimeout(80);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.section_id, 'sec-2');
    assert.equal(created[0].m.quantity, 55);
    assert.match(created[0].m.label, /\(copy\)$/);
    assert.equal('review_required' in created[0].m, false);
    assert.equal('notes' in created[0].m, false);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-ox-heavy'));
    assert.ok(modCalls.some(c => c.newId === 'm-scope-full'));
  });

  // Add section: respects current job-level scope, not the group's own default
  await record('Add section: new row picks up the CURRENT visit-wide scope, not scope\'s own default', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 42, ['m-scope-full'])] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add section').click(); });
    await page.waitForTimeout(80);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-scope-full')); // not m-scope-front, the group's default
    assert.ok(modCalls.some(c => c.newId === 'm-ox-light')); // oxidation's own default, since no visit-wide equivalent exists
  });

  // No child-service behavior accidentally introduced
  await record('No child-service behavior: gutter brightening never spawns a second card or extra service rows', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 42)] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false }]);
    // .card also wraps the unrelated "Add a service" control -- only count
    // cards that have an h2 (an actual service card) to isolate this check.
    const serviceCardCount = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2')).length);
    assert.equal(serviceCardCount, 1);
  });

  // Multi-service: Gutter Brightening + Siding Washing
  await record('Multi-service: Gutter Brightening + Siding Washing coexist with correct independent totals', async () => {
    await freshPanel(page, { measurements: [
      run('m1', 'sec-1', 'Front', 42),
      { id: 'm-sd-1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] }
    ] });
    await renderPanel([
      { service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false },
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false }
    ]);
    const totals = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')];
      return cards.map(c => ({ title: c.querySelector('h2')?.textContent, total: c.querySelector('.money')?.textContent }));
    });
    const gutterCard = totals.find(t => t.title?.includes('Gutter'));
    const sidingCard = totals.find(t => t.title?.includes('Siding'));
    assert.match(gutterCard.total, /\$56\.70/);
    assert.match(sidingCard.total, /\$126/);
  });

  // Multi-service: Gutter Brightening + Heating Wire (incl. a child component)
  await record('Multi-service: Gutter Brightening + Heating Wire (with a valley child) coexist; child stays under its own parent', async () => {
    await freshPanel(page, { measurements: [
      run('m1', 'sec-1', 'Front', 42),
      { id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-v1', service_id: 'svc-v1', section_id: null, label: 'Valley — 1st floor', quantity: 2, unit: 'each', review_required: true, measurement_modifiers: [], job_measurement_addons: [] }
    ] });
    await renderPanel([
      { service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false },
      { service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true }
    ]);
    const info = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')];
      const hwCard = cards.find(c => c.querySelector('h2')?.textContent.includes('Heating Wire'));
      const gutterCard = cards.find(c => c.querySelector('h2')?.textContent.includes('Gutter'));
      const serviceCardCount = cards.filter(c => c.querySelector('h2')).length;
      return { serviceCardCount, valleyUnderHw: !!hwCard?.textContent.includes('Valley'), valleyUnderGutter: !!gutterCard?.textContent.includes('Valley') };
    });
    assert.equal(info.serviceCardCount, 2); // gutter + heating-wire, valley is not a third card
    assert.equal(info.valleyUnderHw, true);
    assert.equal(info.valleyUnderGutter, false);
  });

  // Distinct from both prior calculators (not "heating wire relabeled", not "siding with ft")
  await record('Interaction model is distinct: no steppers, no bracket authorization, no per-row surface/scope duplication', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 42)] });
    await renderPanel([{ service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const root = window.__panel.root;
      return {
        hasSteppers: !![...root.querySelectorAll('button')].find(b => b.textContent === '−' || b.textContent === '+'),
        hasBracketSection: !![...root.querySelectorAll('*')].find(el => /bracket/i.test(el.textContent || '')),
        hasSurfaceDropdown: !![...root.querySelectorAll('label')].find(l => l.textContent.includes('Surface'))
      };
    });
    assert.equal(info.hasSteppers, false);
    assert.equal(info.hasBracketSection, false);
    assert.equal(info.hasSurfaceDropdown, false);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
