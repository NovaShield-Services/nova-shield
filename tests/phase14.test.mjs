import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const XMAS = { id: 'svc-xmas', key: 'christmas_lighting', name: 'Seasonal Christmas Lighting', unit: 'linear_ft', category: 'lighting', quotable: true, active: true, parent_key: null };
const XMAS_JUMP = { id: 'svc-xmas-jump', key: 'christmas_lighting_jump', name: 'Christmas Lighting — Jump Wire', unit: 'linear_ft', category: 'lighting', quotable: true, active: true, parent_key: 'christmas_lighting' };
const PERM = { id: 'svc-perm', key: 'permanent_lighting', name: 'Permanent Outdoor Lighting', unit: 'linear_ft', category: 'lighting', quotable: true, active: true, parent_key: null };
const PERM_JUMP = { id: 'svc-perm-jump', key: 'permanent_lighting_jump', name: 'Permanent Lighting — Jump Wire', unit: 'linear_ft', category: 'lighting', quotable: true, active: true, parent_key: 'permanent_lighting' };
const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const GUTTER = { id: 'svc-gutter', key: 'gutter_brightening', name: 'Gutter Brightening', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const WINDOWS = { id: 'svc-windows', key: 'windows', name: 'Window Cleaning', unit: 'each', category: 'cleaning', quotable: true, active: true, parent_key: null };
const ALL_SERVICES = [XMAS, XMAS_JUMP, PERM, PERM_JUMP, SIDING, GUTTER, WINDOWS];

// Mirrors the real configured Christmas Lighting modifiers: ONLY height on
// the main service, ZERO modifiers at all on the jump-wire child --
// verified independently against the live database, not assumed from
// Permanent Lighting's (identical-looking) configuration.
const MODIFIERS = [
  { id: 'm-height-1', service_id: 'svc-xmas', group_key: 'height', group_label: 'Height', option_key: '1_storey', label: '1 storey', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-height-2', service_id: 'svc-xmas', group_key: 'height', group_label: 'Height', option_key: '2_storey', label: '2 storeys', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-height-3', service_id: 'svc-xmas', group_key: 'height', group_label: 'Height', option_key: '3_storey', label: '3 storeys', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-xmas', approval_status: 'approved', rate: 5, minimum: 0 },
  { service_id: 'svc-xmas-jump', approval_status: 'approved', rate: 2, minimum: 0 }
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
    id, service_id: 'svc-xmas', section_id, label, quantity, unit: 'linear_ft',
    measurement_modifiers: [], job_measurement_addons: []
  });
  const jump = (id, quantity) => ({
    id, service_id: 'svc-xmas-jump', section_id: null, label: 'Jump wire', quantity, unit: 'linear_ft',
    measurement_modifiers: [], job_measurement_addons: []
  });

  // 1. Basic Christmas Lighting
  await record('1. Basic Christmas Lighting: one run renders with correct total, correct service name', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front roofline', 75)] });
    await renderPanel([{ service_id: 'svc-xmas', amount: 375, unit_rate: 5, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { title: card.querySelector('h2').textContent, total: card.querySelector('.money').textContent };
    });
    assert.match(info.title, /Seasonal Christmas Lighting/);
    assert.match(info.total, /\$375/);
  });

  // 2. Multiple main runs
  await record('2. Multiple main runs: total sums correctly, pure measurement summary (no pricing in it)', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front roofline', 75), run('m2', 'sec-2', 'Rear roofline', 105), run('m3', 'sec-1', 'Garage', 32)] });
    await renderPanel([{ service_id: 'svc-xmas', amount: 1112, unit_rate: 5, minimum_applied: false }]);
    const heading = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent);
    assert.match(heading, /212 linear ft total across 3 runs/);
    assert.doesNotMatch(heading, /\$/);
  });

  // 3. Mixed heights
  await record('3. Mixed heights: Front (1 storey) and Rear (2 storeys) each show their own elevation hint, no bleed', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front roofline', 75), run('m2', 'sec-2', 'Rear roofline', 105)] });
    await renderPanel([{ service_id: 'svc-xmas', amount: 980.25, unit_rate: 5, minimum_applied: false }]);
    const hints = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.section-box p.hint')].filter(p => /Height comes from/.test(p.textContent)).map(p => p.textContent));
    assert.match(hints[0], /Height comes from "Front" \(1 storey\)/);
    assert.match(hints[1], /Height comes from "Rear" \(2 storey\)/);
  });

  // 4. Jump-wire child
  await record('4. Adding jump wire creates the single child row (section_id=null, quantity 0)', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front roofline', 75)] });
    await renderPanel([{ service_id: 'svc-xmas', amount: 375, unit_rate: 5, minimum_applied: false }]);
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add jump wire').click(); });
    await page.waitForTimeout(60);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.service_id, 'svc-xmas-jump');
    assert.equal(created[0].m.section_id, null);
    assert.equal(created[0].m.quantity, 0);
  });

  // 5. Multiple/combined jump-wire footage -- single row carries a larger
  // combined footage, same as the real production model supports (no
  // per-instance dimension exists in the schema)
  await record('5. Jump wire footage input accepts a combined/larger total and persists it', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front roofline', 75), jump('mj', 35)] });
    await renderPanel([
      { service_id: 'svc-xmas', amount: 375, unit_rate: 5, minimum_applied: false },
      { service_id: 'svc-xmas-jump', amount: 70, unit_rate: 2, minimum_applied: false }
    ]);
    const amountText = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.section-box')].find(b => b.textContent.includes('Jump wire'))?.querySelector('p')?.textContent);
    assert.match(amountText, /\$70/);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const input = window.__panel.root.querySelector('input[aria-label="Jump wire feet"]');
      input.value = '60';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.ok(calls.some(c => c.id === 'mj' && c.patch.quantity === 60));
  });

  // 6. Minimum: genuinely $0.00 configured for this service too
  await record('6. No minimum-applied badge ever shows (real minimum is $0.00 for Christmas Lighting)', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Small run', 5)] });
    await renderPanel([{ service_id: 'svc-xmas', amount: 25, unit_rate: 5, minimum_applied: false }]);
    const rateLine = await page.evaluate(() => window.__panel.root.querySelector('.card p').textContent);
    assert.doesNotMatch(rateLine, /minimum applied/);
  });

  // 7. Review-required
  await record('7. Review flag on a main run toggles review_required without touching quantity/section/label', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front roofline', 75)] });
    await renderPanel([{ service_id: 'svc-xmas', amount: 375, unit_rate: 5, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => { window.__panel.root.querySelector('input[type=checkbox]').click(); });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].patch.review_required, true);
    assert.equal('quantity' in calls[0].patch, false);
  });

  // 8. Duplicate main run
  await record('8. Duplicate main run: copies section + footage -- not review/reason/notes', async () => {
    const source = run('m1', 'sec-2', 'Rear roofline', 105);
    source.review_required = true;
    source.review_reason = 'Unusual roofline geometry, confirm routing on site';
    source.notes = 'Icy access, confirm takedown route in January';
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-xmas', amount: 603.75, unit_rate: 5, minimum_applied: false }]);
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate').click(); });
    await page.waitForTimeout(60);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.section_id, 'sec-2');
    assert.equal(created[0].m.quantity, 105);
    assert.equal('review_required' in created[0].m, false);
    assert.equal('notes' in created[0].m, false);
  });

  // 9. Remove / edit main run
  await record('9a. Remove main run: calls deleteMeasurement after confirm', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front roofline', 75)] });
    await renderPanel([{ service_id: 'svc-xmas', amount: 375, unit_rate: 5, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Remove').click(); });
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.deepEqual(deleted, ['m1']);
  });

  await record('9b. Edit main run: rename and footage change both persist', async () => {
    await freshPanel(page, { measurements: [run('m1', 'sec-1', 'Front roofline', 75)] });
    await renderPanel([{ service_id: 'svc-xmas', amount: 375, unit_rate: 5, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const nameInput = window.__panel.root.querySelector('input[aria-label="Lighting run name"]');
      nameInput.value = 'Front roofline, east side';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      const qtyInput = window.__panel.root.querySelector('input[aria-label="Feet"]');
      qtyInput.value = '80';
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.ok(calls.some(c => c.patch.label === 'Front roofline, east side'));
    assert.ok(calls.some(c => c.patch.quantity === 80));
  });

  // 10. No bespoke RPC/quote-pathway reference, and no seasonal/lifecycle
  // fields invented (no takedown/install-date/recurring controls)
  await record('10. No bespoke RPC reference and no invented seasonal/takedown/recurring controls in the component source', async () => {
    const src = await page.evaluate(async () => (await (await fetch('/admin/js/components/christmas-lighting-calculator.js')).text()));
    assert.doesNotMatch(src, /create_quote_from_calculation|createQuoteFromCalculation|recalculate_quote/);
    const hasInventedControls = await page.evaluate(() => {
      const root = window.__panel?.root;
      if (!root) return false;
      return !![...root.querySelectorAll('label,button')].find(el => /takedown date|install date|recurring|renew/i.test(el.textContent));
    });
    assert.equal(hasInventedControls, false);
  });

  // 11. Multi-service (Case K): Christmas Lighting + Permanent Lighting + Siding + Gutter + Windows, each independent
  await record('11. Multi-service: Christmas Lighting(+jump) + Permanent Lighting(+jump) + Siding + Gutter + Windows all coexist independently', async () => {
    await freshPanel(page, { measurements: [
      run('m-xl-1', 'sec-1', 'Front roofline', 75),
      jump('m-xj-1', 35),
      { id: 'm-pl-1', service_id: 'svc-perm', section_id: 'sec-1', label: 'Front roofline', quantity: 80, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-pj-1', service_id: 'svc-perm-jump', section_id: null, label: 'Jump wire', quantity: 40, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-sd-1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-gt-1', service_id: 'svc-gutter', section_id: 'sec-1', label: 'Front', quantity: 42, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-w1', service_id: 'svc-windows', section_id: 'sec-1', label: 'Front', quantity: 6, unit: 'each', measurement_modifiers: [], job_measurement_addons: [] }
    ] });
    await renderPanel([
      { service_id: 'svc-xmas', amount: 375, unit_rate: 5, minimum_applied: false },
      { service_id: 'svc-xmas-jump', amount: 70, unit_rate: 2, minimum_applied: false },
      { service_id: 'svc-perm', amount: 400, unit_rate: 5, minimum_applied: false },
      { service_id: 'svc-perm-jump', amount: 80, unit_rate: 2, minimum_applied: false },
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false },
      { service_id: 'svc-gutter', amount: 56.7, unit_rate: 1.35, minimum_applied: false },
      { service_id: 'svc-windows', amount: 54, unit_rate: 9, minimum_applied: false }
    ]);
    const totals = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2'));
      return cards.map(c => ({ title: c.querySelector('h2').textContent, total: c.querySelector('.money').textContent }));
    });
    assert.equal(totals.length, 5); // xmas(+jump), permanent(+jump), siding, gutter, windows -- 5 cards, not 7
    assert.match(totals.find(t => t.title.includes('Seasonal Christmas Lighting')).total, /\$445/); // 375+70
    assert.match(totals.find(t => t.title.includes('Permanent Outdoor Lighting')).total, /\$480/); // 400+80
    assert.match(totals.find(t => t.title.includes('Siding')).total, /\$126/);
    assert.match(totals.find(t => t.title.includes('Gutter')).total, /\$56\.70/);
    assert.match(totals.find(t => t.title.includes('Window')).total, /\$54/);
  });

  // 12. Offline behavior
  await record('12. Offline add-run: createMeasurement returning null does not throw', async () => {
    await page.evaluate(async () => {
      if (window.__panel) window.__panel.root.remove();
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [{ id: 'svc-xmas', key: 'christmas_lighting', name: 'Seasonal Christmas Lighting', unit: 'linear_ft', quotable: true, active: true, parent_key: null }], modifiers: [], siteFactors: [], sections: [{ id: 'sec-1', name: 'Front' }], pricingRules: [] };
      const createMeasurementFn = async () => null;
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {}, createMeasurementFn });
      document.body.appendChild(panel.root);
      window.__panel = panel;
      window.__panelMeasurements = [{ id: 'm1', service_id: 'svc-xmas', section_id: 'sec-1', label: 'Front roofline', quantity: 75, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }];
      panel.render({ measurements: window.__panelMeasurements, pricing: [{ service_id: 'svc-xmas', amount: 375, unit_rate: 5, minimum_applied: false }] });
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
