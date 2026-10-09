import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const LIGHTING = { id: 'svc-lighting', key: 'permanent_lighting', name: 'Permanent Outdoor Lighting', unit: 'linear_ft', category: 'lighting', quotable: true, active: true, parent_key: null };
const JUMP = { id: 'svc-lighting-jump', key: 'permanent_lighting_jump', name: 'Permanent Lighting — Jump Wire', unit: 'linear_ft', category: 'lighting', quotable: true, active: true, parent_key: 'permanent_lighting' };
const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const GUTTER = { id: 'svc-gutter', key: 'gutter_brightening', name: 'Gutter Brightening', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const WINDOWS = { id: 'svc-windows', key: 'windows', name: 'Window Cleaning', unit: 'each', category: 'cleaning', quotable: true, active: true, parent_key: null };
const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const HW_VALLEY = { id: 'svc-hw-v1', key: 'winter_deicing_cables_valley_1st', name: 'Heating Wire — Valley (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const ALL_SERVICES = [LIGHTING, JUMP, SIDING, GUTTER, WINDOWS, HW, HW_VALLEY];

// Mirrors the real configured Permanent Lighting modifiers: ONLY height on
// the main service, ZERO modifiers at all on the jump-wire child.
const MODIFIERS = [
  { id: 'm-height-1', service_id: 'svc-lighting', group_key: 'height', group_label: 'Height', option_key: '1_storey', label: '1 storey', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-height-2', service_id: 'svc-lighting', group_key: 'height', group_label: 'Height', option_key: '2_storey', label: '2 storeys', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-height-3', service_id: 'svc-lighting', group_key: 'height', group_label: 'Height', option_key: '3_storey', label: '3 storeys', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-lighting', approval_status: 'approved', rate: 5, minimum: 0 },
  { service_id: 'svc-lighting-jump', approval_status: 'approved', rate: 2, minimum: 0 }
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

  const run = (id, section_id, label, quantity) => ({
    id, service_id: 'svc-lighting', section_id, label, quantity, unit: 'linear_ft',
    measurement_modifiers: [], job_measurement_addons: []
  });
  const jump = (id, quantity, extra = {}) => ({
    id, service_id: 'svc-lighting-jump', section_id: null, label: 'Jump wire', quantity, unit: 'linear_ft',
    measurement_modifiers: [], job_measurement_addons: [], ...extra
  });

  // 1. Simple main run, no jump wire
  await record('1. Simple main run (no jump wire): renders with correct total, "+ Add jump wire" shown', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80)] });
    await renderPanel([{ service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return {
        title: card.querySelector('h2').textContent, total: card.querySelector('.money').textContent,
        heading: [...card.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent,
        hasAddJumpWire: !![...card.querySelectorAll('button')].find(b => b.textContent === '+ Add jump wire'),
        cardCount: [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2')).length
      };
    });
    assert.match(info.title, /Permanent Outdoor Lighting/);
    assert.match(info.total, /\$400/);
    assert.match(info.heading, /80 linear ft total across 1 run/);
    assert.equal(info.hasAddJumpWire, true);
    assert.equal(info.cardCount, 1); // one card for the whole parent/child group, not two
  });

  // 2. Multiple main runs
  await record('2. Multiple main runs: total sums correctly', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80), run('m2', 'sec-2', 'Rear', 110), run('m3', 'sec-1', 'Garage', 35)] });
    await renderPanel([{ service_id: 'svc-lighting', amount: 1182.5, unit_rate: 5, minimum_applied: false }]);
    const heading = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent);
    assert.match(heading, /225 linear ft total across 3 runs/);
  });

  // 3. Mixed heights -- each run keeps its own elevation/height, no bleed
  await record('3. Mixed heights: Front (1 storey) and Rear (2 storeys) each show their own elevation hint', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80), run('m2', 'sec-2', 'Rear', 110)] });
    await renderPanel([{ service_id: 'svc-lighting', amount: 1032.5, unit_rate: 5, minimum_applied: false }]);
    const hints = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.section-box p.hint')].filter(p => /Height comes from/.test(p.textContent)).map(p => p.textContent));
    assert.match(hints[0], /Height comes from "Front" \(1 storey\)/);
    assert.match(hints[1], /Height comes from "Rear" \(2 storey\)/);
  });

  // 4. No per-row modifier dropdown on main runs (height is section-driven; no other group configured)
  // -- the ONE select that does exist is the Elevation picker itself, not a modifier control.
  await record('4. No per-row modifier dropdown exists on a main run (only the Elevation picker select)', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80)] });
    await renderPanel([{ service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const box = window.__panel.root.querySelector('.section-box');
      return {
        selectCount: box.querySelectorAll('select').length,
        hasModifierGrid: !!box.querySelector('.grid--2[style*="margin-top"]')
      };
    });
    assert.equal(info.selectCount, 1); // just Elevation
    assert.equal(info.hasModifierGrid, false);
  });

  // 5. Jump wire: add, then renders footage input + amount
  await record('5. Adding jump wire creates the single child row with quantity 0', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80)] });
    await renderPanel([{ service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false }]);
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add jump wire').click(); });
    await page.waitForTimeout(60);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.service_id, 'svc-lighting-jump');
    assert.equal(created[0].m.section_id, null);
    assert.equal(created[0].m.quantity, 0);
  });

  // 6. Jump wire footage edit persists and shows its own priced amount
  await record('6. Jump wire footage input persists via updateMeasurement and shows its own $ amount', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80), jump('mj', 40)] });
    await renderPanel([
      { service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false },
      { service_id: 'svc-lighting-jump', amount: 80, unit_rate: 2, minimum_applied: false }
    ]);
    const amountText = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.section-box')].find(b => b.textContent.includes('Jump wire'))?.querySelector('p')?.textContent);
    assert.match(amountText, /\$80/);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const input = window.__panel.root.querySelector('input[aria-label="Jump wire feet"]');
      input.value = '55';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => (globalThis.__updateMeasurementCalls || []).some(c => c.id === 'mj' && c.patch.quantity === 55));
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.ok(calls.some(c => c.id === 'mj' && c.patch.quantity === 55));
  });

  // 7. Jump wire does NOT auto-flag for review (unlike Heating Wire's unpriced children -- this one has a real approved rate)
  await record('7. Jump wire row is not auto-flagged for review (it has a real approved rate)', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80), jump('mj', 40)] });
    await renderPanel([
      { service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false },
      { service_id: 'svc-lighting-jump', amount: 80, unit_rate: 2, minimum_applied: false }
    ]);
    const checked = await page.evaluate(() => {
      const box = [...window.__panel.root.querySelectorAll('.section-box')].find(b => b.textContent.includes('Jump wire'));
      return box.querySelector('input[type=checkbox]').checked;
    });
    assert.equal(checked, false);
  });

  // 8. Jump wire deletion
  await record('8. Removing jump wire calls deleteMeasurement, offers "+ Add jump wire" again', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80), jump('mj', 40)] });
    await renderPanel([
      { service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false },
      { service_id: 'svc-lighting-jump', amount: 80, unit_rate: 2, minimum_applied: false }
    ]);
    await page.evaluate(() => { globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => {
      const box = [...window.__panel.root.querySelectorAll('.section-box')].find(b => b.textContent.includes('Jump wire'));
      [...box.querySelectorAll('button')].find(b => b.textContent === 'Remove').click();
    });
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.deepEqual(deleted, ['mj']);
  });

  // 9. Card total combines main run + jump wire into ONE number (the core parent/child rollup test)
  await record('9. Card-level total combines main runs AND jump wire into one SERVICE TOTAL', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80), run('m2', 'sec-2', 'Rear', 110), jump('mj', 40)] });
    await renderPanel([
      { service_id: 'svc-lighting', amount: 1032.5, unit_rate: 5, minimum_applied: false },
      { service_id: 'svc-lighting-jump', amount: 80, unit_rate: 2, minimum_applied: false }
    ]);
    const total = await page.evaluate(() => window.__panel.root.querySelector('.card .money').textContent);
    assert.match(total, /\$1,?112\.50|\$1112\.5/); // 1032.5 + 80 = 1112.5
  });

  // 10. Duplicate main run
  await record('10. Duplicate main run: copies section + footage -- not review/reason/notes', async () => {
    const source = run('m1', 'sec-2', 'Rear', 110);
    source.review_required = true;
    source.review_reason = 'Unusual roofline geometry, confirm routing on site';
    source.notes = 'Steep pitch on this section';
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-lighting', amount: 632.5, unit_rate: 5, minimum_applied: false }]);
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate').click(); });
    await page.waitForTimeout(60);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.section_id, 'sec-2');
    assert.equal(created[0].m.quantity, 110);
    assert.match(created[0].m.label, /\(copy\)$/);
    assert.equal('review_required' in created[0].m, false);
    assert.equal('notes' in created[0].m, false);
  });

  // 11. Remove / edit main run
  await record('11a. Remove main run: calls deleteMeasurement after confirm', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80)] });
    await renderPanel([{ service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Remove').click(); });
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.deepEqual(deleted, ['m1']);
  });

  await record('11b. Edit main run: rename and footage change both persist', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80)] });
    await renderPanel([{ service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const nameInput = window.__panel.root.querySelector('input[aria-label="Lighting run name"]');
      nameInput.value = 'Front roofline, east side';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      const qtyInput = window.__panel.root.querySelector('input[aria-label="Feet"]');
      qtyInput.value = '85';
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => (globalThis.__updateMeasurementCalls || []).some(c => c.patch.quantity === 85));
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.ok(calls.some(c => c.patch.label === 'Front roofline, east side'));
    assert.ok(calls.some(c => c.patch.quantity === 85));
  });

  // 12. Minimum: genuinely no minimum configured (rate x 0 = 0, no $0 minimum to clamp to)
  await record('12. No minimum-applied badge ever shows (real minimum is $0.00 for this service)', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Small run', 5)] });
    await renderPanel([{ service_id: 'svc-lighting', amount: 25, unit_rate: 5, minimum_applied: false }]);
    const rateLine = await page.evaluate(() => window.__panel.root.querySelector('.card p').textContent);
    assert.doesNotMatch(rateLine, /minimum applied/);
  });

  // 13. Review flag on main run
  await record('13. Review flag on a main run toggles review_required without touching quantity/section/label', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front', 80)] });
    await renderPanel([{ service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => { window.__panel.root.querySelector('input[type=checkbox]').click(); });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].patch.review_required, true);
    assert.equal('quantity' in calls[0].patch, false);
  });

  // 14. No bespoke RPC/quote-pathway reference
  await record('14. No bespoke RPC/quote-pathway reference anywhere in the component source', async () => {
    const src = await page.evaluate(async () => (await (await fetch('/admin/js/components/permanent-lighting-calculator.js')).text()));
    assert.doesNotMatch(src, /create_quote_from_calculation|createQuoteFromCalculation|recalculate_quote/);
  });

  // 15. Multi-service: Permanent Lighting (+jump) + Siding + Gutter + Windows + Heating Wire (+valley child)
  await record('15. Multi-service: Lighting+Jump, Siding, Gutter, Windows, Heating Wire+Valley all coexist -- each parent/child pair rolls up independently, no cross-contamination', async () => {
    await freshPanel(page, { measurements: [
      run('m-lt-1', 'sec-1', 'Front', 80),
      jump('m-jp-1', 40),
      { id: 'm-sd-1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-gt-1', service_id: 'svc-gutter', section_id: 'sec-1', label: 'Front', quantity: 42, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-w1', service_id: 'svc-windows', section_id: 'sec-1', label: 'Front', quantity: 6, unit: 'each', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-hwv-1', service_id: 'svc-hw-v1', section_id: null, label: 'Valley — 1st floor', quantity: 2, unit: 'each', measurement_modifiers: [], job_measurement_addons: [] }
    ] });
    await renderPanel([
      { service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false },
      { service_id: 'svc-lighting-jump', amount: 80, unit_rate: 2, minimum_applied: false },
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false },
      { service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false },
      { service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false },
      { service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true },
      { service_id: 'svc-hw-v1', amount: 0, unit_rate: 0, minimum_applied: false }
    ]);
    const totals = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2'));
      return cards.map(c => ({ title: c.querySelector('h2').textContent, total: c.querySelector('.money').textContent }));
    });
    assert.equal(totals.length, 5); // lighting(+jump), siding, gutter, windows, heating-wire(+valley) -- 5 cards, not 7
    assert.match(totals.find(t => t.title.includes('Permanent Outdoor Lighting')).total, /\$480/); // 400+80
    assert.match(totals.find(t => t.title.includes('Siding')).total, /\$126/);
    assert.match(totals.find(t => t.title.includes('Gutter')).total, /\$56\.70/);
    assert.match(totals.find(t => t.title.includes('Window')).total, /\$54/);
    assert.match(totals.find(t => t.title.includes('Heating Wire')).total, /\$420/);
  });

  // 16. Offline behavior
  await record('16. Offline add-run: createMeasurement returning null does not throw', async () => {
    await page.evaluate(async () => {
      if (window.__panel) window.__panel.root.remove();
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [{ id: 'svc-lighting', key: 'permanent_lighting', name: 'Permanent Outdoor Lighting', unit: 'linear_ft', quotable: true, active: true, parent_key: null }], modifiers: [], siteFactors: [], sections: [{ id: 'sec-1', name: 'Front' }], pricingRules: [] };
      const createMeasurementFn = async () => null;
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {}, createMeasurementFn });
      document.body.appendChild(panel.root);
      window.__panel = panel;
      window.__panelMeasurements = [{ id: 'm1', service_id: 'svc-lighting', section_id: 'sec-1', label: 'Front', quantity: 80, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }];
      panel.render({ measurements: window.__panelMeasurements, pricing: [{ service_id: 'svc-lighting', amount: 400, unit_rate: 5, minimum_applied: false }] });
    });
    let threw = false;
    try {
      await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add lighting run').click(); });
      await page.waitForTimeout(60);
    } catch { threw = true; }
    assert.equal(threw, false);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
