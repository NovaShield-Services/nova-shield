import assert from 'node:assert/strict';
import { createRecorder, BASE_FAKE_API_PANEL, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();

const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };
const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const VALLEY1 = { id: 'svc-v1', key: 'winter_deicing_cables_valley_1st', name: 'Heating Wire — Valley (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const ALL_SERVICES = [SIDING, HW, VALLEY1];

// Mirrors the real configured siding modifiers (access/height excluded --
// section-driven -- condition + surface are the two real groups).
const MODIFIERS = [
  { id: 'm-acc-easy', service_id: 'svc-siding', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-light', service_id: 'svc-siding', group_key: 'condition', group_label: 'Condition', option_key: 'light', label: 'Light dirt', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-normal', service_id: 'svc-siding', group_key: 'condition', group_label: 'Condition', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-cond-heavy', service_id: 'svc-siding', group_key: 'condition', group_label: 'Condition', option_key: 'heavy', label: 'Heavy buildup', kind: 'multiplier', value: 1.35, is_default: false, sort_order: 4 },
  { id: 'm-surf-vinyl', service_id: 'svc-siding', group_key: 'surface', group_label: 'Surface', option_key: 'vinyl', label: 'Vinyl / standard', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-surf-painted', service_id: 'svc-siding', group_key: 'surface', group_label: 'Surface', option_key: 'painted', label: 'Painted / delicate', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-siding', approval_status: 'approved', rate: 0.3, minimum: 199 }
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

  const wall = (id, section_id, label, quantity, mods = []) => ({
    id, service_id: 'svc-siding', section_id, label, quantity, unit: 'sq_ft',
    measurement_modifiers: mods.map(modifier_id => ({ modifier_id })), job_measurement_addons: []
  });

  // 1. One 1-storey elevation
  await record('1. One 1-storey elevation renders with correct total', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 420)] });
    await renderPanel([{ service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { title: card.querySelector('h2').textContent, total: card.querySelector('.money').textContent,
        heading: card.querySelector('h3')?.textContent };
    });
    assert.match(info.title, /Siding/);
    assert.match(info.total, /\$126/);
    assert.match(info.heading, /Wall sections/);
  });

  // 2. Front 1 storey + rear 2 storey
  await record('2. Front 1-storey + rear 2-storey: both render with their own elevation hint and a combined total', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 420), wall('m2', 'sec-2', 'Rear', 680)] });
    await renderPanel([{ service_id: 'svc-siding', amount: 460, unit_rate: 0.3, minimum_applied: false }]);
    const info = await page.evaluate(() => {
      const hints = [...window.__panel.root.querySelectorAll('.hint')].map(h => h.textContent);
      return {
        total: window.__panel.root.querySelector('.hint')
          ? [...window.__panel.root.querySelectorAll('span.hint')].find(s => s.textContent.includes('sq ft total'))?.textContent
          : null,
        front1storey: hints.some(h => h.includes('Front') && h.includes('1 storey')),
        rear2storey: hints.some(h => h.includes('Rear') && h.includes('2 storey'))
      };
    });
    assert.match(info.total, /1,100 sq ft total across 2 sections/);
    assert.equal(info.front1storey, true);
    assert.equal(info.rear2storey, true);
  });

  // 3. Three mixed-height areas
  await record('3. Three mixed areas (Front/Rear/Garage) all render as independent sections', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 420), wall('m2', 'sec-2', 'Rear', 680), wall('m3', 'sec-1', 'Garage', 160)] });
    await renderPanel([{ service_id: 'svc-siding', amount: 420, unit_rate: 0.3, minimum_applied: false }]);
    const names = await page.evaluate(() =>
      [...window.__panel.root.querySelectorAll('.section-box__head input')].map(i => i.value));
    assert.deepEqual(names, ['Front', 'Rear', 'Garage']);
  });

  // 4. Different conditions on different areas (multi-area conditions)
  await record('4. Front=light/vinyl, Rear=heavy/painted -- each row keeps its own independent modifier selection', async () => {
    await freshPanel(page, { measurements: [
      wall('m1', 'sec-1', 'Front', 420, ['m-cond-light', 'm-surf-vinyl']),
      wall('m2', 'sec-2', 'Rear', 680, ['m-cond-heavy', 'm-surf-painted'])
    ] });
    await renderPanel([{ service_id: 'svc-siding', amount: 500, unit_rate: 0.3, minimum_applied: false }]);
    const picked = await page.evaluate(() => {
      const boxes = [...window.__panel.root.querySelectorAll('.section-box')];
      return boxes.map(box => {
        const selects = [...box.querySelectorAll('select')];
        const condition = selects.find(s => s.closest('label')?.textContent.includes('Condition'));
        const surface = selects.find(s => s.closest('label')?.textContent.includes('Surface'));
        return { condition: condition?.selectedOptions[0]?.textContent, surface: surface?.selectedOptions[0]?.textContent };
      });
    });
    assert.equal(picked[0].condition, 'Light dirt');
    assert.equal(picked[0].surface, 'Vinyl / standard');
    assert.equal(picked[1].condition, 'Heavy buildup');
    assert.equal(picked[1].surface, 'Painted / delicate');
  });

  // 5. Minimum charge
  await record('5. Minimum charge: card shows "minimum applied" without replacing the visible total', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 100)] });
    await renderPanel([{ service_id: 'svc-siding', amount: 199, unit_rate: 0.3, minimum_applied: true }]);
    const info = await page.evaluate(() => {
      const card = window.__panel.root.querySelector('.card');
      return { total: card.querySelector('.money').textContent, rateLine: card.querySelector('p').textContent };
    });
    assert.match(info.total, /\$199/);
    assert.match(info.rateLine, /minimum applied/);
  });

  // 6. Manual adjustment -- siding participates in the same quote-level
  // adjustment mechanism as every other service; not a per-component
  // concept, so nothing siding-specific to add. Confirmed structurally:
  // the calculator never touches quote_adjustments, which stays quote.js's
  // job regardless of which service produced the line.
  await record('6. No manual-adjustment UI inside the calculator (that stays quote-level, per architecture)', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 420)] });
    await renderPanel([{ service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false }]);
    const hasAdjustmentUi = await page.evaluate(() =>
      !![...window.__panel.root.querySelectorAll('button,label')].find(el => /adjustment/i.test(el.textContent)));
    assert.equal(hasAdjustmentUi, false);
  });

  // 7. Review-required area, preserving measurements
  await record('7. Review flag toggles review_required without touching quantity/section', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 420)] });
    await renderPanel([{ service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__updateMeasurementCalls = []; });
    await page.evaluate(() => {
      const box = window.__panel.root.querySelector('input[type=checkbox]');
      box.click();
    });
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => globalThis.__updateMeasurementCalls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'm1');
    assert.equal(calls[0].patch.review_required, true);
    assert.equal('quantity' in calls[0].patch, false);
    assert.equal('section_id' in calls[0].patch, false);
  });

  // 8. Add/remove/duplicate section
  await record('8a. Add section: creates a measurement and applies default modifiers', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 420)] });
    await renderPanel([{ service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => {
      const btn = [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add section');
      btn.click();
    });
    await page.waitForTimeout(80);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.service_id, 'svc-siding');
    assert.equal(created[0].m.section_id, 'sec-1'); // defaults to the last-used elevation
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-cond-light'));
    assert.ok(modCalls.some(c => c.newId === 'm-surf-vinyl'));
  });

  await record('8b. Remove section: calls deleteMeasurement after confirm', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 420)] });
    await renderPanel([{ service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__deleteMeasurementCalls = []; });
    await page.evaluate(() => {
      const btn = [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Remove');
      btn.click();
    });
    await page.waitForTimeout(60);
    const deleted = await page.evaluate(() => globalThis.__deleteMeasurementCalls);
    assert.deepEqual(deleted, ['m1']);
  });

  await record('8c. Duplicate section: copies section + quantity + modifier selections, not label/review/notes', async () => {
    const source = wall('m1', 'sec-2', 'Rear', 680, ['m-cond-heavy', 'm-surf-painted']);
    source.review_required = true;
    source.review_reason = 'Unsure of substrate behind the downspout';
    source.notes = 'Check for loose panel, upper-left corner';
    await freshPanel(page, { measurements: [source] });
    await renderPanel([{ service_id: 'svc-siding', amount: 320, unit_rate: 0.3, minimum_applied: false }]);
    await page.evaluate(() => { globalThis.__setModifierCalls = []; });
    await page.evaluate(() => {
      const btn = [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Duplicate');
      btn.click();
    });
    await page.waitForTimeout(80);
    const created = await page.evaluate(() => globalThis.__createCalls);
    assert.equal(created.length, 1);
    assert.equal(created[0].m.section_id, 'sec-2');
    assert.equal(created[0].m.quantity, 680);
    assert.match(created[0].m.label, /\(copy\)$/);
    assert.equal('review_required' in created[0].m, false);
    assert.equal('notes' in created[0].m, false);
    const modCalls = await page.evaluate(() => globalThis.__setModifierCalls);
    assert.ok(modCalls.some(c => c.newId === 'm-cond-heavy'));
    assert.ok(modCalls.some(c => c.newId === 'm-surf-painted'));
  });

  // 9. Save and reopen -- a fresh render from the same stored measurement
  // shape must reproduce identical UI state (no client-only state hides
  // anywhere outside what's persisted).
  await record('9. Save and reopen: re-rendering from the same stored data reproduces identical state', async () => {
    const stored = wall('m1', 'sec-2', 'Rear', 680, ['m-cond-heavy']);
    await freshPanel(page, { measurements: [stored] });
    await renderPanel([{ service_id: 'svc-siding', amount: 320, unit_rate: 0.3, minimum_applied: false }]);
    const before = await page.evaluate(() => ({
      qty: window.__panel.root.querySelector('input[aria-label="Square feet"]').value,
      cond: [...window.__panel.root.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Condition'))?.selectedOptions[0]?.textContent
    }));
    // simulate "reopen": fresh panel instance, same server-side data
    await freshPanel(page, { measurements: [stored] });
    await renderPanel([{ service_id: 'svc-siding', amount: 320, unit_rate: 0.3, minimum_applied: false }]);
    const after = await page.evaluate(() => ({
      qty: window.__panel.root.querySelector('input[aria-label="Square feet"]').value,
      cond: [...window.__panel.root.querySelectorAll('select')].find(s => s.closest('label')?.textContent.includes('Condition'))?.selectedOptions[0]?.textContent
    }));
    assert.deepEqual(after, before);
  });

  // 10. Quote version creation -- structural: the calculator issues the same
  // createMeasurement/updateMeasurement calls as any other service; quote
  // creation itself is covered end-to-end against the real DB separately
  // (this suite mocks api.js, so it cannot exercise create_quote_from_calculation).
  await record('10. Nothing siding-specific is called for quote creation (no bespoke RPC reference anywhere)', async () => {
    const src = await page.evaluate(async () => (await (await fetch('/admin/js/components/siding-calculator.js')).text()));
    assert.doesNotMatch(src, /create_quote_from_calculation|createQuoteFromCalculation|recalculate_quote/);
  });

  // 11. Add siding + another service, without losing anything
  await record('11. Siding and heating-wire coexist as two independent cards, each keeps its own data', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 420), { id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }] });
    await renderPanel([
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false },
      { service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true }
    ]);
    const titles = await page.evaluate(() => [...window.__panel.root.querySelectorAll('.card h2')].map(h => h.textContent));
    assert.ok(titles.some(t => t.includes('Siding')));
    assert.ok(titles.some(t => t.includes('Heating Wire')));
  });

  // 12. Customer quote rendering -- structural check here (no $ math, no
  // per-row breakdown invented); the real rollup is verified end-to-end
  // against get_customer_quote separately, same as Phase 3.
  await record('12. No per-row dollar figure is invented in the DOM (only the card-level total, from pricedRows)', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 420), wall('m2', 'sec-2', 'Rear', 680)] });
    await renderPanel([{ service_id: 'svc-siding', amount: 460, unit_rate: 0.3, minimum_applied: false }]);
    const moneyEls = await page.evaluate(() => [...window.__panel.root.querySelectorAll('.money')].map(e => e.textContent));
    assert.equal(moneyEls.length, 1); // exactly the one card-level total, nothing per-row
  });

  // 13. Offline persistence -- createMeasurement returns null when queued
  // offline; the component must not crash and must still let onChange() run.
  await record('13. Offline add-section: createMeasurement returning null does not throw', async () => {
    await freshPanel(page, { measurements: [] });
    await renderPanel([]);
    await page.evaluate(() => {
      const btn = [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === 'Choose a service…');
    });
    // Route an offline-aware createMeasurementFn that returns null, same contract field-workspace.js uses.
    await page.evaluate(async () => {
      if (window.__panel) window.__panel.root.remove();
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [{ id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', quotable: true, active: true, parent_key: null }], modifiers: [], siteFactors: [], sections: [{ id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy' }], pricingRules: [] };
      const createMeasurementFn = async () => null; // simulates offline queueing
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {}, createMeasurementFn });
      document.body.appendChild(panel.root);
      window.__panel = panel;
      window.__panelMeasurements = [{ id: 'm1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', measurement_modifiers: [], job_measurement_addons: [] }];
      panel.render({ measurements: window.__panelMeasurements, pricing: [{ service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false }] });
    });
    let threw = false;
    try {
      await page.evaluate(() => {
        const btn = [...window.__panel.root.querySelectorAll('button')].find(b => b.textContent === '+ Add section');
        btn.click();
      });
      await page.waitForTimeout(60);
    } catch { threw = true; }
    assert.equal(threw, false);
  });

  // 14. Regression against Heating Wire Installation (full re-run, recorded separately below in phase3.test.mjs,
  // but also spot-checked here within the same page/session to confirm no cross-talk between the two calculators).
  await record('14. Heating-wire calculator still renders correctly in the same session as siding', async () => {
    await freshPanel(page, { measurements: [{ id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }] });
    await renderPanel([{ service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true }]);
    const hasEaveHeading = await page.evaluate(() => !![...window.__panel.root.querySelectorAll('h3')].find(h => h.textContent.includes('Eave')));
    assert.equal(hasEaveHeading, true);
  });

  // 15. Existing child-service/customer rollup regression -- confirmed via
  // the add-service dropdown still excluding children and the valley child
  // still grouping under heating wire, not under siding or standalone.
  await record('15. Child services still exclude from "Add a service" and group under their own parent, unaffected by siding', async () => {
    await freshPanel(page, { measurements: [wall('m1', 'sec-1', 'Front', 420), { id: 'm-v1', service_id: 'svc-v1', section_id: null, label: 'Valley — 1st floor', quantity: 2, unit: 'each', review_required: true, measurement_modifiers: [], job_measurement_addons: [] }, { id: 'm-hw-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Eave run', quantity: 30, unit: 'linear_ft', measurement_modifiers: [], job_measurement_addons: [] }] });
    await renderPanel([
      { service_id: 'svc-siding', amount: 126, unit_rate: 0.3, minimum_applied: false },
      { service_id: 'svc-hw', amount: 420, unit_rate: 14, minimum_applied: true }
    ]);
    const info = await page.evaluate(() => {
      const cards = [...window.__panel.root.querySelectorAll('.card')];
      const hwCard = cards.find(c => c.querySelector('h2')?.textContent.includes('Heating Wire'));
      const sidingCard = cards.find(c => c.querySelector('h2')?.textContent.includes('Siding'));
      const options = [...document.querySelectorAll('select')].flatMap(s => [...s.options].map(o => o.textContent));
      return {
        cardCount: cards.length,
        valleyUnderHw: !!hwCard?.textContent.includes('Valley'),
        valleyUnderSiding: !!sidingCard?.textContent.includes('Valley'),
        addServiceHasValley: options.some(o => o.includes('Valley'))
      };
    });
    assert.equal(info.cardCount, 2); // siding + heating-wire, valley is NOT a third card
    assert.equal(info.valleyUnderHw, true);
    assert.equal(info.valleyUnderSiding, false);
    assert.equal(info.addServiceHasValley, false);
  });

  await finishAndReport(browser, results);
}

main().catch((err) => { console.error(err); process.exit(1); });
