import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const WPC = { id: 'svc-wpc', key: 'winter_property_care', name: 'Walkway, Step & Deck Snow Removal', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: null };
const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const PERM = { id: 'svc-perm', key: 'permanent_lighting', name: 'Permanent Outdoor Lighting', unit: 'linear_ft', category: 'lighting', quotable: true, active: true, parent_key: null };
const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const CONCRETE = { id: 'svc-concrete', key: 'concrete', name: 'Concrete / Pressure Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const ALL_SERVICES = [WPC, HW, PERM, SIDING, CONCRETE];

// Mirrors the real configured Winter Property Care modifiers exactly:
// Access + Height section-driven (Height has only one real option, always
// default), Scope ("What is cleared"), Surface, and Salting (flat) all
// per-row. No job-wide control exists for this service.
const MODIFIERS = [
  { id: 'm-acc-easy', service_id: 'svc-wpc', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 20 },
  { id: 'm-acc-normal', service_id: 'svc-wpc', group_key: 'access', group_label: 'Access', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 21 },
  { id: 'm-acc-difficult', service_id: 'svc-wpc', group_key: 'access', group_label: 'Access', option_key: 'difficult', label: 'Difficult - tight or terraced', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 22 },
  { id: 'm-acc-vdifficult', service_id: 'svc-wpc', group_key: 'access', group_label: 'Access', option_key: 'very_difficult', label: 'Very difficult', kind: 'multiplier', value: 1.45, is_default: false, sort_order: 23 },
  { id: 'm-height-ground', service_id: 'svc-wpc', group_key: 'height', group_label: 'Height', option_key: '1_storey', label: 'Ground level', kind: 'multiplier', value: 1, is_default: true, sort_order: 10 },
  { id: 'm-scope-walkway', service_id: 'svc-wpc', group_key: 'scope', group_label: 'What is cleared', option_key: 'walkway', label: 'Walkway only', kind: 'multiplier', value: 1, is_default: true, sort_order: 30 },
  { id: 'm-scope-steps', service_id: 'svc-wpc', group_key: 'scope', group_label: 'What is cleared', option_key: 'walk_steps', label: 'Walkway + steps', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 31 },
  { id: 'm-scope-deck', service_id: 'svc-wpc', group_key: 'scope', group_label: 'What is cleared', option_key: 'walk_steps_deck', label: 'Walkway + steps + deck', kind: 'multiplier', value: 1.55, is_default: false, sort_order: 32 },
  { id: 'm-scope-all', service_id: 'svc-wpc', group_key: 'scope', group_label: 'What is cleared', option_key: 'all_paths', label: 'All paths + deck', kind: 'multiplier', value: 1.8, is_default: false, sort_order: 33 },
  { id: 'm-surf-concrete', service_id: 'svc-wpc', group_key: 'surface', group_label: 'Surface', option_key: 'concrete', label: 'Concrete / pavers', kind: 'multiplier', value: 1, is_default: true, sort_order: 40 },
  { id: 'm-surf-wood', service_id: 'svc-wpc', group_key: 'surface', group_label: 'Surface', option_key: 'wood_deck', label: 'Wood deck - gentle clearing', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 41 },
  { id: 'm-surf-mixed', service_id: 'svc-wpc', group_key: 'surface', group_label: 'Surface', option_key: 'mixed', label: 'Mixed / uneven', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 42 },
  { id: 'm-salt-none', service_id: 'svc-wpc', group_key: 'salting', group_label: 'Salting', option_key: 'none', label: 'No salting', kind: 'flat', value: 0, is_default: true, sort_order: 50 },
  { id: 'm-salt-asneeded', service_id: 'svc-wpc', group_key: 'salting', group_label: 'Salting', option_key: 'as_needed', label: 'Salt as needed', kind: 'flat', value: 18, is_default: false, sort_order: 51 },
  { id: 'm-salt-every', service_id: 'svc-wpc', group_key: 'salting', group_label: 'Salting', option_key: 'every_visit', label: 'Salt every visit', kind: 'flat', value: 30, is_default: false, sort_order: 52 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front entrance', storeys: '1_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Garage path', storeys: '1_storey', access: 'difficult', ground: 'flat', ladder: 'normal', distance: 'close' }
];

// approval_status: 'provisional' -- must stay provisional, never promoted.
const PRICING_RULES = [
  { service_id: 'svc-wpc', approval_status: 'provisional', rate: 55, minimum: 45 }
];

const FAKE_API = BASE_FAKE_API_PANEL;

async function main() {
  const { browser, page } = await launchPanelPage({ fakeApi: FAKE_API, promptValue: 'Garage path' });

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

  const area = (id, section_id, label, quantity, mods = []) => ({
    id, service_id: 'svc-wpc', section_id, label, quantity, unit: 'each',
    measurement_modifiers: mods.map(modifier_id => ({ modifier_id })), job_measurement_addons: []
  });

  // 1. Simplest quote
  await record('1. Simplest quote: one service area, 4 visits, renders with correct total', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 4)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 242, unit_rate: 55, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { title: card.querySelector('h2').textContent, total: card.querySelector('.money').textContent,
        heading: [...card.querySelectorAll('span.hint')].find(s => s.textContent.includes('total across'))?.textContent };
    });
    assert.match(info.title, /Walkway, Step & Deck Snow Removal/);
    assert.match(info.total, /\$242/);
    assert.match(info.heading, /4 each total across 1 service area/);
  });

  // 2. Every real scope option
  await record('2. Every real Scope option is offered with the real labels', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 1)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 55, unit_rate: 55, minimum_applied: false }]);
    const options = await page.evaluate(() => {
      const sel = [...window.__panel.root.querySelectorAll('label')].find(l => l.textContent.includes('What is cleared')).querySelector('select');
      return [...sel.options].map(o => o.textContent);
    });
    assert.deepEqual(options, ['Walkway only', 'Walkway + steps', 'Walkway + steps + deck', 'All paths + deck']);
  });

  // 3. Mixed scope/access across two areas -- no bleed
  await record('3. Mixed Scope/Access: two service areas keep independent selections', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 4, ['m-scope-walkway']), area('m2', 'sec-2', 'Garage path', 2, ['m-scope-all'])] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 500, unit_rate: 55, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => [...box.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('What is cleared'))?.selectedOptions[0]?.textContent);
    });
    assert.equal(picked[0], 'Walkway only');
    assert.equal(picked[1], 'All paths + deck');
  });

  // 4. Salting renders as a flat-dollar option with the $ suffix (Concrete pattern)
  await record('4. Salting options show the flat-dollar suffix, same convention as Concrete\'s flat options', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 1)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 55, unit_rate: 55, minimum_applied: false }]);
    const options = await page.evaluate(() => {
      const sel = [...window.__panel.root.querySelectorAll('label')].find(l => l.textContent.includes('Salting')).querySelector('select');
      return [...sel.options].map(o => o.textContent);
    });
    assert.deepEqual(options, ['No salting', 'Salt as needed (+$18.00)', 'Salt every visit (+$30.00)']);
  });

  // 5. Access is section-driven; Height has only the one real option and is never a row control
  await record('5. Access/Height have no per-row dropdown (section-driven); combined hint names both', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-2', 'Garage path', 2)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 137.5, unit_rate: 55, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const root = window.__panel.root;
      return {
        hasAccessDropdown: !![...root.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Access')),
        hasHeightDropdown: !![...root.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Height')),
        hint: [...root.querySelectorAll('p.hint')].find(p => /Height\/access come from/.test(p.textContent))?.textContent
      };
    });
    assert.equal(info.hasAccessDropdown, false);
    assert.equal(info.hasHeightDropdown, false);
    assert.match(info.hint, /Height\/access come from "Garage path" \(1 storey, difficult access\)/);
  });

  // 6. Visit count stepper
  await record('6. Visit-count stepper: + increases via updateMeasurement, never creates/deletes the row', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 4)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 242, unit_rate: 55, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; globalThis.__createCalls = []; globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { window.__panel.root.querySelector('button[aria-label="More visits"]').click(); });
    await page.waitForTimeout(60);
    const info = await page.evaluate(() => ({
      updates: globalThis.__updateMeasurementCalls, created: globalThis.__createCalls.length, deleted: globalThis.__deleteMeasurementCalls.length
    }));
    assert.equal(info.created, 0);
    assert.equal(info.deleted, 0);
    assert.ok(info.updates.some(c => c.id === 'm1' && c.patch.quantity === 5));
  });

  // 7. Provisional pricing: badge + hint show, pricing is not silently promoted
  await record('7. Provisional-pricing badge and hint show for this service (approval_status=provisional)', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 4)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 242, unit_rate: 55, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return {
        badge: card.querySelector('h2')?.textContent,
        hint: [...card.querySelectorAll('p')].find(p => /not yet commercially approved/i.test(p.textContent))?.textContent
      };
    });
    assert.match(info.badge, /Pricing not yet approved/);
    assert.match(info.hint, /not yet commercially approved/i);
  });

  // 8. Minimum charge
  await record('8. Minimum charge: card shows "minimum applied" without replacing the total', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 1)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 45, unit_rate: 55, minimum_applied: true }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { total: card.querySelector('.money').textContent, rateLine: card.querySelector('p').textContent };
    });
    assert.match(info.total, /\$45/);
    assert.match(info.rateLine, /minimum applied/);
  });

  // 9. Review-required
  await record('9. Review flag toggles review_required without touching quantity/section/label', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 4)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 242, unit_rate: 55, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => { window.__panel.root.querySelector('input[type=checkbox]').click(); });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].patch.review_required, true);
    assert.equal('quantity' in calls[0].patch, false);
  });

  // 10. Duplicate
  await record('10. Duplicate: copies section, visit count, Scope + Surface + Salting -- not review/reason/notes', async () => {
    const source = area('m1', 'sec-2', 'Garage path', 3, ['m-scope-deck', 'm-surf-wood', 'm-salt-every']);
    source.review_required = true;
    source.review_reason = 'Unusual deck configuration, confirm clearing path on site';
    source.notes = 'Steep steps near side door';
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 271.95, unit_rate: 55, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate').click(); });
    await page.waitForTimeout(60);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.section_id, 'sec-2');
    assert.equal(created[0].m.quantity, 3);
    assert.equal('review_required' in created[0].m, false);
    assert.equal('notes' in created[0].m, false);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-scope-deck'));
    assert.ok(modCalls.some(c => c.newId === 'm-surf-wood'));
    assert.ok(modCalls.some(c => c.newId === 'm-salt-every'));
  });

  // 11. No manual-adjustment UI, no bespoke RPC reference, no snow-event/recurring references anywhere in the source
  await record('11. No manual-adjustment UI; no bespoke RPC; no snow-event/recurring references in the component source', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 4)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 242, unit_rate: 55, minimum_applied: false }]);
    const hasAdjustmentUi = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('button,label')].find(el => /adjustment/i.test(el.textContent)));
    assert.equal(hasAdjustmentUi, false);
    const src = await page.evaluate(async () => (await (await fetch('/admin/js/components/winter-property-care-calculator.js')).text()));
    assert.doesNotMatch(src, /create_quote_from_calculation|createQuoteFromCalculation|recalculate_quote|snow_event|ns_snow_events|property_clear|recurring|subscription/i);
  });

  // 12. Remove / edit
  await record('12a. Remove service area: calls deleteMeasurement after confirm', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 4)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 242, unit_rate: 55, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Remove').click(); });
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.deepEqual(deleted, ['m1']);
  });

  await record('12b. Edit service area: rename persists', async () => {
    await freshPanel(page, { measurements: [area('m1', 'sec-1', 'Front entrance', 4)] });
    await renderPanel([{ service_id: 'svc-wpc', amount: 242, unit_rate: 55, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const nameInput = window.__panel.root.querySelector('input[aria-label="Service area name"]');
      nameInput.value = 'Front entrance, main approach';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.ok(calls.some(c => c.patch.label === 'Front entrance, main approach'));
  });

  // 13. Multi-service: Winter Property Care + Heating Wire + Permanent Lighting + Siding + Concrete
  await record('13. Multi-service: Winter Property Care + Heating Wire + Permanent Lighting + Siding + Concrete all coexist independently', async () => {
    await freshPanel(page, { measurements: [
      area('m-wpc-1', 'sec-1', 'Front entrance', 4),
      { id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-pl-1', service_id: 'svc-perm', section_id: 'sec-1', label: 'Front roofline', quantity: 80, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-sd-1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] },
      { id: 'm-cn-1', service_id: 'svc-concrete', section_id: 'sec-1', label: 'Driveway', quantity: 1200, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] }
    ] });
    await renderPanel([
      { service_id: 'svc-wpc', amount: 242, unit_rate: 55, minimum_applied: false },
      { service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true },
      { service_id: 'svc-perm', amount: 400, unit_rate: 5, minimum_applied: false },
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false },
      { service_id: 'svc-concrete', amount: 300, unit_rate: 0.25, minimum_applied: false }
    ]);
    const totals = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')].filter(c => c.querySelector('h2'));
      return cards.map(c => ({ title: c.querySelector('h2').textContent, total: c.querySelector('.money').textContent }));
    });
    assert.equal(totals.length, 5);
    assert.match(totals.find(t => t.title.includes('Walkway')).total, /\$242/);
    assert.match(totals.find(t => t.title.includes('Heating Wire')).total, /\$420/);
    assert.match(totals.find(t => t.title.includes('Permanent Outdoor Lighting')).total, /\$400/);
    assert.match(totals.find(t => t.title.includes('Siding')).total, /\$126/);
    assert.match(totals.find(t => t.title.includes('Concrete')).total, /\$300/);
  });

  // 14. Offline behavior
  await record('14. Offline add-area: createMeasurement returning null does not throw', async () => {
    await page.evaluate(async () => {
      if (window.__panel) window.__panel.root.remove();
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [{ id: 'svc-wpc', key: 'winter_property_care', name: 'Walkway, Step & Deck Snow Removal', unit: 'each', quotable: true, active: true, parent_key: null }], modifiers: [], siteFactors: [], sections: [{ id: 'sec-1', name: 'Front entrance' }], pricingRules: [{ service_id: 'svc-wpc', approval_status: 'provisional', rate: 55, minimum: 45 }] };
      const createMeasurementFn = async () => null;
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {}, createMeasurementFn });
      document.body.appendChild(panel.root);
      window.__panel = panel;
      window.__panelMeasurements = [{ id: 'm1', service_id: 'svc-wpc', section_id: 'sec-1', label: 'Front entrance', quantity: 4, unit: 'each', measurement_modifiers: [], job_measurement_addons: [] }];
      panel.render({ measurements: window.__panelMeasurements, pricing: [{ service_id: 'svc-wpc', amount: 242, unit_rate: 55, minimum_applied: false }] });
    });
    let threw = false;
    try {
      await page.evaluate(() => { [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add service area').click(); });
      await page.waitForTimeout(60);
    } catch { threw = true; }
    assert.equal(threw, false);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
