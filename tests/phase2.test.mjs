import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;
import assert from 'node:assert/strict';

const BASE = 'http://localhost:8743';
const results = [];
function record(name, fn) {
  return Promise.resolve().then(fn).then(
    () => results.push({ name, ok: true }),
    (err) => results.push({ name, ok: false, err: err.message || String(err) })
  );
}

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `
  export const supabase = { auth: { signOut: async () => {} }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'https://example.invalid/sig.png' } }) }) }, rpc: async () => ({ data: null, error: { message: 'not used' } }) };
  export async function getSession() { return { session: null, isAdmin: false }; }
`;

// Deliberately a fake, non-production key with no specialized calculator ever
// registered for it (unlike real service keys, which can and do gain one --
// e.g. this fixture used 'winter_property_care' until Phase 15 legitimately
// wired up a real calculator for that key, which silently broke this test's
// assumption that the generic fallback review-flag UI would render).
const service = { id: 'svc-generic-test-1', key: 'generic_test_service', name: 'Generic Test Service', unit: 'each', category: 'test', quotable: true, active: true };
const pricingRuleProvisional = { service_id: 'svc-generic-test-1', approval_status: 'provisional', rate: 55, minimum: 45 };

const FAKE_API = `
  export async function getSettings() { return { company: { website: 'https://novashieldmaintenance.com' } }; }
  export async function uploadJobPhoto() { return {}; }
  export async function signedPhotoUrl() { return 'https://example.invalid/signed.jpg'; }
  export async function listAttachments() { return []; }
  export async function deleteAttachment() {}
  export async function listTodaysVisits() { return []; }
  export async function updateMeasurement(id, patch) {
    globalThis.__updateMeasurementCalls = globalThis.__updateMeasurementCalls || [];
    globalThis.__updateMeasurementCalls.push({ id, patch });
    return { id, ...patch };
  }
  export async function updateSection(id, patch) {
    globalThis.__updateSectionCalls = globalThis.__updateSectionCalls || [];
    globalThis.__updateSectionCalls.push({ id, patch });
    return { id, ...patch };
  }
  export async function deleteMeasurement() {}
  export async function deleteMeasurementAddon() {}
  export async function addMeasurementAddon() { return {}; }
  export async function setMeasurementModifier() {}
  export async function createMeasurement() { return {}; }
  export async function updateQuote() { return {}; }
  export async function deleteLine() {}
  export async function deleteAdjustment() {}
  export async function addAdjustment() { return {}; }
  export async function sendQuote() {
    globalThis.__sendQuoteCalled = true;
    return {};
  }
  export async function duplicateQuote() { return {}; }
  export async function uploadSignature() { return ''; }
  export async function saveQuoteSignature() { return {}; }
  export async function createOptionQuote(jobId, groupId, label, sortOrder, measurementIds) {
    globalThis.__createOptionQuoteCalls = globalThis.__createOptionQuoteCalls || [];
    globalThis.__createOptionQuoteCalls.push({ jobId, groupId, label, sortOrder, measurementIds });
    return 'new-option-id';
  }
  export async function sendOptionGroup(groupId) {
    globalThis.__sendOptionGroupCalls = globalThis.__sendOptionGroupCalls || [];
    globalThis.__sendOptionGroupCalls.push({ groupId });
  }
`;

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const mock = (urlPattern, body) => page.route(urlPattern, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body }));

  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE);
  await mock(`${BASE}/admin/js/lib/api.js`, FAKE_API);

  // confirm() always "OK" so the Send Email flow and review-flag confirms
  // (none here, but kept for parity with other tests in this project) run
  // without blocking on a native dialog Playwright can't see.
  page.on('dialog', (d) => d.accept());
  const confirmMessages = [];
  await page.goto(`${BASE}/admin/field.html`);
  await page.exposeFunction('__captureConfirm', (msg) => confirmMessages.push(msg));
  await page.evaluate(() => {
    const real = window.confirm;
    window.confirm = (msg) => { window.__captureConfirm(msg); return true; };
  });
  await page.waitForTimeout(150);

  await record('measurements.js: provisional-pricing badge shows for an unapproved service', async () => {
    const info = await page.evaluate(async ({ service, pricingRule }) => {
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [service], modifiers: [], siteFactors: [], sections: [], pricingRules: [pricingRule] };
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {} });
      document.body.appendChild(panel.root);
      const measurement = {
        id: 'm-1', service_id: service.id, service, quantity: 1, section_id: null,
        measurement_modifiers: [], job_measurement_addons: []
      };
      panel.render({ measurements: [measurement], pricing: [{ service_id: service.id, amount: 55, unit_rate: 55, minimum_applied: false }] });
      const badgeText = panel.root.querySelector('.badge--warn')?.textContent;
      const hintText = [...panel.root.querySelectorAll('.hint')].map(e => e.textContent).find(t => t.includes('not yet commercially approved'));
      panel.root.remove();
      return { badgeText, hasHint: !!hintText };
    }, { service, pricingRule: pricingRuleProvisional });
    assert.equal(info.badgeText, 'Pricing not yet approved');
    assert.equal(info.hasHint, true);
  });

  await record('measurements.js: no badge for an approved service', async () => {
    const info = await page.evaluate(async ({ service, pricingRule }) => {
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [service], modifiers: [], siteFactors: [], sections: [], pricingRules: [{ ...pricingRule, approval_status: 'approved' }] };
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {} });
      document.body.appendChild(panel.root);
      const measurement = { id: 'm-1', service_id: service.id, service, quantity: 1, section_id: null, measurement_modifiers: [], job_measurement_addons: [] };
      panel.render({ measurements: [measurement], pricing: [{ service_id: service.id, amount: 55, unit_rate: 55, minimum_applied: false }] });
      const badge = panel.root.querySelector('.badge--warn');
      panel.root.remove();
      return { hasBadge: !!badge };
    }, { service, pricingRule: pricingRuleProvisional });
    assert.equal(info.hasBadge, false);
  });

  await record('measurements.js: review-flag toggle calls updateMeasurement with review_required + reason', async () => {
    const info = await page.evaluate(async ({ service }) => {
      globalThis.__updateMeasurementCalls = [];
      const mod = await import('/admin/js/views/measurements.js');
      const refs = { services: [service], modifiers: [], siteFactors: [], sections: [], pricingRules: [] };
      const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {} });
      document.body.appendChild(panel.root);
      const measurement = { id: 'm-1', service_id: service.id, service, quantity: 1, section_id: null, measurement_modifiers: [], job_measurement_addons: [] };
      panel.render({ measurements: [measurement], pricing: [{ service_id: service.id, amount: 55, unit_rate: 55, minimum_applied: false }] });
      const checkbox = [...panel.root.querySelectorAll('input[type=checkbox]')].find(c => c.closest('.check')?.textContent.includes('Flag this area for review'));
      checkbox.click();
      await new Promise(r => setTimeout(r, 50));
      const reasonInput = checkbox.closest('div').parentElement.querySelector('input[placeholder*="Why"]');
      reasonInput.value = 'Unclear substrate from the ground';
      reasonInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
      panel.root.remove();
      return { calls: globalThis.__updateMeasurementCalls, reasonVisible: reasonInput.style.display !== 'none' };
    }, { service });
    assert.equal(info.calls.length, 2);
    assert.deepEqual(info.calls[0].patch, { review_required: true, review_reason: null });
    assert.equal(info.calls[1].patch.review_reason, 'Unclear substrate from the ground');
    assert.equal(info.reasonVisible, true);
  });

  await record('review-flag.js: unchecking clears the reason and hides the input', async () => {
    const info = await page.evaluate(async () => {
      const mod = await import('/admin/js/components/review-flag.js');
      let saved = null;
      const node = mod.reviewFlag({ required: true, reason: 'Old reason', save: async (p) => { saved = p; } });
      document.body.appendChild(node);
      const box = node.querySelector('input[type=checkbox]');
      const reasonInput = node.querySelector('input[type=text], input:not([type=checkbox])');
      const initiallyVisible = reasonInput.style.display !== 'none';
      box.click();
      await new Promise(r => setTimeout(r, 30));
      const result = { initiallyVisible, saved, nowHidden: reasonInput.style.display === 'none' };
      node.remove();
      return result;
    });
    assert.equal(info.initiallyVisible, true);
    assert.deepEqual(info.saved, { review_required: false, review_reason: null });
    assert.equal(info.nowHidden, true);
  });

  await record('quote.js: unapproved line shows a badge, quote-level warning, and strengthens the send confirm', async () => {
    const info = await page.evaluate(async () => {
      globalThis.__sendQuoteCalled = false;
      const mod = await import('/admin/js/views/quote.js');
      const job = { id: 'job-1', customers: { name: 'Jane Doe', email: 'jane@example.com', phone: '+16045550123' }, properties: { address_line1: '1 Test St' } };
      const quote = {
        id: 'quote-1', version: 1, kind: 'final', status: 'draft', total: 55, subtotal: 55, tax_total: 0,
        valid_until: new Date().toISOString(),
        quote_line_items: [{ id: 'li-1', description: 'Walkway, Step & Deck Snow Removal', amount: 55, quantity: 1, unit: 'each', unit_rate: 55, modifier_factor: 1, addons_amount: 0, minimum_applied: false, source: 'calculated', sort_order: 1, pricing_approved: false }],
        quote_adjustments: []
      };
      const panel = mod.createQuotePanel({ job, onChange: () => {} });
      document.body.appendChild(panel.root);
      panel.render({ quotes: [quote] });
      await new Promise(r => setTimeout(r, 60));
      panel.render({ quotes: [quote] });
      const lineBadge = panel.root.querySelector('.qline .badge--warn')?.textContent;
      const quoteWarn = panel.root.querySelector('.warn strong')?.textContent;
      const sendBtn = [...panel.root.querySelectorAll('button')].find(b => b.textContent === 'Send Email');
      sendBtn.click();
      await new Promise(r => setTimeout(r, 60));
      panel.root.remove();
      return { lineBadge, quoteWarn, sent: globalThis.__sendQuoteCalled };
    });
    assert.equal(info.lineBadge, 'Not yet approved');
    assert.match(info.quoteWarn || '', /not yet commercially approved/);
    assert.equal(info.sent, true, 'confirm() was stubbed to accept, so the send should have gone through');
    assert.ok(confirmMessages.some(m => m.includes('hasn’t commercially approved')), `expected a strengthened confirm message, got: ${JSON.stringify(confirmMessages)}`);
  });

  // These two signature-pad tests must run here -- still on admin/field.html,
  // before the first page.goto() to the customer site below. A navigation
  // loads a fresh document with a fresh window.confirm, silently discarding
  // the page.evaluate override installed near the top of this file (a real,
  // unpatched confirm() dialog still gets auto-accepted by the page-level
  // page.on('dialog', ...) handler, which is why onSave still fires -- it's
  // only confirmMessages, captured solely through the override, that goes
  // missing if these run after a navigation).
  await record('signature-pad.js: unapproved-pricing override strengthens the admin accept confirm', async () => {
    const info = await page.evaluate(async () => {
      const mod = await import('/admin/js/components/signature-pad.js');
      let saved = null;
      const pad = mod.createSignaturePad({
        onSave: async (blob, name) => { saved = name; },
        unapprovedServices: ['Permanent Outdoor Lighting']
      });
      document.body.appendChild(pad.root);
      pad.root.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
      pad.root.querySelector('input').value = 'Jane Doe';
      const saveBtn = [...pad.root.querySelectorAll('button')].find((b) => b.textContent.includes('Approve'));
      saveBtn.click();
      await new Promise((r) => setTimeout(r, 60));
      pad.root.remove();
      return { saved };
    });
    assert.equal(info.saved, 'Jane Doe');
    assert.ok(confirmMessages.some((m) => m.includes('hasn’t commercially approved yet') && m.includes('Permanent Outdoor Lighting')),
      `expected the signature confirm to mention unapproved pricing, got: ${JSON.stringify(confirmMessages)}`);
  });

  await record('signature-pad.js: no override clause when every service is approved (default)', async () => {
    confirmMessages.length = 0;
    await page.evaluate(async () => {
      const mod = await import('/admin/js/components/signature-pad.js');
      const pad = mod.createSignaturePad({ onSave: async () => {} });
      document.body.appendChild(pad.root);
      pad.root.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
      pad.root.querySelector('input').value = 'Jane Doe';
      const saveBtn = [...pad.root.querySelectorAll('button')].find((b) => b.textContent.includes('Approve'));
      saveBtn.click();
      await new Promise((r) => setTimeout(r, 60));
      pad.root.remove();
    });
    assert.ok(confirmMessages.length > 0);
    assert.ok(!confirmMessages.some((m) => m.includes('commercially approved')),
      `expected no unapproved-pricing clause, got: ${JSON.stringify(confirmMessages)}`);
  });

  await record('site/js/pages/quote.js: unapproved line shows the customer-facing estimate note', async () => {
    await mock(`${BASE}/shared/supabase.js`, `
      export const supabase = {
        storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
        rpc: async (name) => {
          if (name !== 'get_customer_quote') return { data: null, error: { message: 'unexpected rpc' } };
          return { data: {
            reference: 'NS-1', version: 1, status: 'sent', issued_on: new Date().toISOString(),
            valid_until: null, currency: 'CAD', customer_name: 'Jane Doe', property: '1 Test St',
            customer_notes: null, terms: null, subtotal: 55, tax_total: 0, total: 55,
            company: { phone: '', email: '' },
            lines: [{ description: 'Walkway, Step & Deck Snow Removal', amount: 55, pricing_approved: false }],
            adjustments: [], change_orders: []
          }, error: null };
        }
      };
    `);
    await page.goto(`${BASE}/site/quote.html?id=test-quote-id`);
    await page.waitForTimeout(150);
    const note = await page.evaluate(() => {
      const p = [...document.querySelectorAll('p')].find(el => el.textContent.includes('Estimate'));
      return p ? p.textContent : null;
    });
    assert.equal(note, 'Estimate — final pricing pending confirmation');
  });

  await record('site/js/pages/quote.js: Accept is withheld (not just a failed click) when any line is unapproved; Decline still works', async () => {
    await mock(`${BASE}/shared/supabase.js`, `
      export const supabase = {
        storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
        rpc: async (name) => {
          if (name !== 'get_customer_quote') return { data: null, error: { message: 'unexpected rpc' } };
          return { data: {
            reference: 'NS-2', version: 1, status: 'sent', issued_on: new Date().toISOString(),
            valid_until: null, currency: 'CAD', customer_name: 'Jane Doe', property: '1 Test St',
            customer_notes: null, terms: null, subtotal: 55, tax_total: 0, total: 55,
            company: { phone: '', email: '' },
            lines: [{ description: 'Permanent Outdoor Lighting', amount: 55, pricing_approved: false }],
            adjustments: [], change_orders: []
          }, error: null };
        }
      };
    `);
    await page.goto(`${BASE}/site/quote.html?id=test-quote-unapproved`);
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent);
      // Distinct from the existing per-line "Estimate — final pricing
      // pending confirmation" note, which also renders on this same page
      // for this same provisional line -- matched on text unique to the
      // new per-quote action-area message instead of the shared phrase.
      const pending = [...document.querySelectorAll('p')].find((p) => p.textContent.includes('We will confirm your pricing'));
      return { buttons, pendingText: pending?.textContent || null };
    });
    assert.ok(!info.buttons.includes('Accept this quote'), `Accept should not render; got buttons: ${JSON.stringify(info.buttons)}`);
    assert.ok(info.buttons.includes('Decline'), 'Decline must still be offered on a provisional quote');
    assert.equal(info.pendingText, 'Final pricing is still pending confirmation. We will confirm your pricing before accepting this quote.');
  });

  await record('site/js/pages/quote.js: Accept renders normally once every line is approved', async () => {
    await mock(`${BASE}/shared/supabase.js`, `
      export const supabase = {
        storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
        rpc: async (name) => {
          if (name !== 'get_customer_quote') return { data: null, error: { message: 'unexpected rpc' } };
          return { data: {
            reference: 'NS-3', version: 1, status: 'sent', issued_on: new Date().toISOString(),
            valid_until: null, currency: 'CAD', customer_name: 'Jane Doe', property: '1 Test St',
            customer_notes: null, terms: null, subtotal: 55, tax_total: 0, total: 55,
            company: { phone: '', email: '' },
            lines: [{ description: 'Permanent Outdoor Lighting', amount: 55, pricing_approved: true }],
            adjustments: [], change_orders: []
          }, error: null };
        }
      };
    `);
    await page.goto(`${BASE}/site/quote.html?id=test-quote-approved`);
    await page.waitForTimeout(150);
    const buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent));
    assert.ok(buttons.includes('Accept this quote'));
    assert.ok(buttons.includes('Decline'));
  });

  // -- Phase C: option-group architecture ------------------------------

  const optionA = { id: 'opt-a', version: 1, kind: 'final', status: 'draft', total: 440, subtotal: 440, tax_total: 0,
    valid_until: new Date().toISOString(), option_group_id: 'grp-1', option_label: 'Essential', option_sort_order: 1,
    quote_line_items: [{ id: 'li-a', description: 'Permanent Outdoor Lighting', amount: 440, quantity: 1, unit: 'each', unit_rate: 440, modifier_factor: 1, addons_amount: 0, minimum_applied: false, source: 'calculated', sort_order: 1, pricing_approved: true }],
    quote_adjustments: [] };
  const optionB = { ...optionA, id: 'opt-b', version: 2, option_label: 'Complete', option_sort_order: 2, total: 770 };
  const optionC = { ...optionA, id: 'opt-c', version: 3, option_label: 'Full Home', option_sort_order: 3, total: 330 };
  const testJob = { id: 'job-1', customers: { name: 'Jane Doe', email: 'jane@example.com', phone: '+16045550123' }, properties: { address_line1: '1 Test St' } };

  await record('admin quote.js: option-group siblings render grouped under one heading, with a Send Option Group button and no per-option Send Email button', async () => {
    const info = await page.evaluate(async ({ optionA, optionB, optionC, job }) => {
      const mod = await import('/admin/js/views/quote.js');
      const panel = mod.createQuotePanel({ job, onChange: () => {} });
      document.body.appendChild(panel.root);
      // Deliberately passed in version-desc order (what listQuotes would
      // give), not label order -- the grouping/sort-order logic must do
      // its own re-ordering by option_sort_order regardless of input order.
      panel.render({ quotes: [optionC, optionB, optionA] });
      await new Promise((r) => setTimeout(r, 30));
      const groupHeading = [...panel.root.querySelectorAll('h3')].find((h) => h.textContent.includes('Option group'))?.textContent;
      const sendGroupBtn = [...panel.root.querySelectorAll('button')].find((b) => b.textContent === 'Send Option Group');
      const sendEmailBtns = [...panel.root.querySelectorAll('button')].filter((b) => b.textContent === 'Send Email');
      // renderQuote's own per-card heading is uniquely "<kind> · v<N>" --
      // signatureSection/the page's own "Quotes" h2 don't match that shape.
      const cardHeadings = [...panel.root.querySelectorAll('h2')].filter((h) => /· v\d+$/.test(h.textContent));
      panel.root.remove();
      return { groupHeading, hasSendGroupBtn: !!sendGroupBtn, sendEmailCount: sendEmailBtns.length, cardHeadingCount: cardHeadings.length };
    }, { optionA, optionB, optionC, job: testJob });
    assert.ok(info.groupHeading?.includes('3 options'), `expected a 3-option group heading, got ${JSON.stringify(info.groupHeading)}`);
    assert.equal(info.hasSendGroupBtn, true);
    assert.equal(info.sendEmailCount, 0, 'no option-group member should offer its own Send Email button');
    assert.equal(info.cardHeadingCount, 3, 'all 3 option version-cards should still render (reusing renderQuote unchanged)');
  });

  await record('admin quote.js: an ordinary (non-grouped) job with no measurements/services passed renders exactly as before, with no option-group builder', async () => {
    const info = await page.evaluate(async ({ job }) => {
      const mod = await import('/admin/js/views/quote.js');
      const ordinaryQuote = { id: 'q-ord', version: 1, kind: 'final', status: 'draft', total: 100, subtotal: 100, tax_total: 0,
        valid_until: new Date().toISOString(), option_group_id: null, option_label: null, option_sort_order: null,
        quote_line_items: [], quote_adjustments: [] };
      const panel = mod.createQuotePanel({ job, onChange: () => {} });
      document.body.appendChild(panel.root);
      panel.render({ quotes: [ordinaryQuote] }); // field-workspace.js's exact call shape -- no measurements/services
      await new Promise((r) => setTimeout(r, 30));
      const hasBuilder = !!panel.root.querySelector('h3') && [...panel.root.querySelectorAll('h3')].some((h) => h.textContent.includes('Create option group'));
      const hasGroupHeading = [...panel.root.querySelectorAll('h3')].some((h) => h.textContent.includes('Option group'));
      panel.root.remove();
      return { hasBuilder, hasGroupHeading };
    }, { job: testJob });
    assert.equal(info.hasBuilder, false, 'the creation builder must not render without measurements/services (e.g. the field console)');
    assert.equal(info.hasGroupHeading, false, 'an ordinary quote must never render inside an option-group wrapper');
  });

  await record('admin quote.js: the option-group builder creates one create_option_quote call per checked column, skips empty columns', async () => {
    const info = await page.evaluate(async ({ job }) => {
      globalThis.__createOptionQuoteCalls = [];
      const mod = await import('/admin/js/views/quote.js');
      const services = [{ id: 'svc-perm', name: 'Permanent Outdoor Lighting' }, { id: 'svc-xmas', name: 'Seasonal Christmas Lighting' }];
      const measurements = [
        { id: 'm-1', service_id: 'svc-perm', label: 'Front', quantity: 80, unit: 'linear_ft' },
        { id: 'm-2', service_id: 'svc-xmas', label: 'Front', quantity: 60, unit: 'linear_ft' }
      ];
      const panel = mod.createQuotePanel({ job, onChange: () => { globalThis.__onChangeFired = true; } });
      document.body.appendChild(panel.root);
      panel.render({ quotes: [], measurements, services });
      await new Promise((r) => setTimeout(r, 30));
      const checkboxes = [...panel.root.querySelectorAll('input[type=checkbox]')];
      // 2 measurements x 3 columns = 6 checkboxes, in column-major DOM order.
      checkboxes[0].click(); // column 1 ("Essential" by default) x measurement 1
      checkboxes[3].click(); // column 2 ("Complete" by default) x measurement 2
      const createBtn = [...panel.root.querySelectorAll('button')].find((b) => b.textContent === 'Create Option Group');
      createBtn.click();
      await new Promise((r) => setTimeout(r, 60));
      panel.root.remove();
      return { calls: globalThis.__createOptionQuoteCalls, onChangeFired: !!globalThis.__onChangeFired, checkboxCount: checkboxes.length };
    }, { job: testJob });
    assert.equal(info.checkboxCount, 6);
    assert.equal(info.calls.length, 2, `expected exactly 2 create_option_quote calls (the untouched 3rd column skipped), got: ${JSON.stringify(info.calls)}`);
    assert.equal(info.calls[0].label, 'Essential');
    assert.deepEqual(info.calls[0].measurementIds, ['m-1']);
    assert.equal(info.calls[1].label, 'Complete');
    assert.deepEqual(info.calls[1].measurementIds, ['m-2']);
    assert.equal(info.calls[0].groupId, info.calls[1].groupId, 'both options must share one client-generated group id');
    assert.equal(info.onChangeFired, true);
  });

  await record('admin quote.js: the option-group builder refuses to create a group from only 1 checked column', async () => {
    const info = await page.evaluate(async ({ job }) => {
      globalThis.__createOptionQuoteCalls = [];
      const mod = await import('/admin/js/views/quote.js');
      const services = [{ id: 'svc-perm', name: 'Permanent Outdoor Lighting' }];
      const measurements = [{ id: 'm-1', service_id: 'svc-perm', label: 'Front', quantity: 80, unit: 'linear_ft' }];
      const panel = mod.createQuotePanel({ job, onChange: () => {} });
      document.body.appendChild(panel.root);
      panel.render({ quotes: [], measurements, services });
      await new Promise((r) => setTimeout(r, 30));
      panel.root.querySelector('input[type=checkbox]').click(); // only column 1
      const createBtn = [...panel.root.querySelectorAll('button')].find((b) => b.textContent === 'Create Option Group');
      createBtn.click();
      await new Promise((r) => setTimeout(r, 60));
      panel.root.remove();
      return { calls: globalThis.__createOptionQuoteCalls };
    }, { job: testJob });
    assert.equal(info.calls.length, 0, 'a single-option "group" must be rejected client-side, not sent to the RPC');
  });

  /** A small, stateful get_customer_quote/respond_to_quote mock -- tracks
   *  which option (if any) has been accepted across calls within one test,
   *  so the accept flow can be verified end to end against the real
   *  site/js/pages/quote.js, not just a single static fixture. */
  async function mockOptionGroupBackend() {
    await mock(`${BASE}/shared/supabase.js`, `
      let acceptedId = null;
      function optionsNow() {
        return [
          { id: 'opt-a', option_label: 'Essential', option_sort_order: 1, total: 440, pricing_approved: true,
            status: acceptedId ? (acceptedId === 'opt-a' ? 'accepted' : 'superseded') : 'sent' },
          { id: 'opt-b', option_label: 'Complete', option_sort_order: 2, total: 770, pricing_approved: true,
            status: acceptedId ? (acceptedId === 'opt-b' ? 'accepted' : 'superseded') : 'sent' },
          { id: 'opt-c', option_label: 'Full Home', option_sort_order: 3, total: 330, pricing_approved: false,
            status: acceptedId ? (acceptedId === 'opt-c' ? 'accepted' : 'superseded') : 'sent' }
        ];
      }
      export const supabase = {
        storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
        rpc: async (name, args) => {
          if (name === 'get_customer_quote') {
            const opt = optionsNow().find(o => o.id === args.p_quote_id);
            return { data: {
              reference: 'NS-OPT', version: 1, status: opt.status === 'sent' ? 'sent' : opt.status,
              issued_on: new Date().toISOString(), valid_until: null, currency: 'CAD',
              customer_name: 'Jane Doe', property: '1 Test St', customer_notes: null, terms: null,
              subtotal: opt.total, tax_total: 0, total: opt.total, company: { phone: '', email: '' },
              lines: [{ description: 'Permanent Outdoor Lighting', amount: opt.total, pricing_approved: opt.pricing_approved }],
              adjustments: [], change_orders: [],
              option_group: { group_id: 'grp-1', options: optionsNow() }
            }, error: null };
          }
          if (name === 'respond_to_quote') {
            globalThis.__respondCalls = globalThis.__respondCalls || [];
            globalThis.__respondCalls.push(args);
            if (args.p_response === 'accepted') acceptedId = args.p_quote_id;
            return { data: args.p_response, error: null };
          }
          return { data: null, error: { message: 'unexpected rpc: ' + name } };
        }
      };
    `);
  }

  await record('site/js/pages/quote.js: an option-group link shows the sibling list, not the single-quote view', async () => {
    await mockOptionGroupBackend();
    await page.goto(`${BASE}/site/quote.html?id=opt-a`);
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => ({
      heading: document.querySelector('h1')?.textContent,
      viewDetailsCount: [...document.querySelectorAll('button')].filter((b) => b.textContent === 'View details').length,
      // .meta strong is the "Quote <reference>" header from sheetHead --
      // excluded here since it isn't one of the option-list labels.
      labels: [...document.querySelectorAll('strong')].filter((s) => !s.closest('.meta')).map((s) => s.textContent),
      hasAccept: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Accept'))
    }));
    assert.equal(info.heading, 'Choose your option');
    assert.equal(info.viewDetailsCount, 3);
    assert.deepEqual(info.labels, ['Essential', 'Complete', 'Full Home'], 'options must render in deterministic option_sort_order');
    assert.equal(info.hasAccept, false, 'the list view itself never shows an Accept button -- only a drilled-in option does');
  });

  await record('site/js/pages/quote.js: viewing one option shows its full detail with a back link; accepting it updates the group and is reflected on return', async () => {
    await mockOptionGroupBackend();
    await page.goto(`${BASE}/site/quote.html?id=opt-a`);
    await page.waitForTimeout(150);

    const detail = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'View details');
      btn.click();
      return new Promise((resolve) => setTimeout(() => {
        resolve({
          hasBack: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Back to all options')),
          hasAccept: [...document.querySelectorAll('button')].some((b) => b.textContent === 'Accept this option'),
          labelTag: [...document.querySelectorAll('p')].find((p) => p.textContent === 'Essential')?.textContent
        });
      }, 150));
    });
    assert.equal(detail.hasBack, true);
    assert.equal(detail.hasAccept, true);
    assert.equal(detail.labelTag, 'Essential');

    const afterAccept = await page.evaluate(() => {
      globalThis.__respondCalls = [];
      const accept = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Accept this option');
      accept.click();
      return new Promise((resolve) => setTimeout(() => {
        resolve({
          respondCalls: globalThis.__respondCalls,
          statusBanner: document.querySelector('.state--ok')?.textContent
        });
      }, 200));
    });
    assert.equal(afterAccept.respondCalls.length, 1);
    assert.equal(afterAccept.respondCalls[0].p_quote_id, 'opt-a');
    assert.equal(afterAccept.respondCalls[0].p_response, 'accepted');
    assert.ok(afterAccept.statusBanner?.includes('You accepted this option'),
      `expected option-specific wording, got: ${JSON.stringify(afterAccept.statusBanner)}`);

    const backToList = await page.evaluate(() => {
      const back = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Back to all options'));
      back.click();
      const notes = [...document.querySelectorAll('p')].map((p) => p.textContent);
      return { hasAccepted: notes.includes('Accepted'), hasUnavailable: notes.filter((t) => t === 'No longer available').length };
    });
    assert.equal(backToList.hasAccepted, true, 'the list must reflect the just-completed accept without a stale re-render');
    assert.equal(backToList.hasUnavailable, 2, 'both other siblings must show as no longer available');
  });

  await record('site/js/pages/quote.js: an option with unapproved pricing withholds Accept, same as an ordinary provisional quote', async () => {
    await mockOptionGroupBackend();
    await page.goto(`${BASE}/site/quote.html?id=opt-c`);
    await page.waitForTimeout(150);
    // Drill into Option C (the unapproved one) specifically.
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('strong')];
      const row = rows.find((s) => s.textContent === 'Full Home');
      row.closest('div').parentElement.querySelector('button').click();
    });
    await page.waitForTimeout(150);
    const detail = await page.evaluate(() => ({
      hasAccept: [...document.querySelectorAll('button')].some((b) => b.textContent === 'Accept this option'),
      pendingText: [...document.querySelectorAll('p')].find((p) => p.textContent.includes('We will confirm your pricing'))?.textContent
    }));
    assert.equal(detail.hasAccept, false, 'Accept must be withheld for an option with any unapproved line');
    assert.ok(detail.pendingText);
  });

  await record('site/js/pages/quote.js: an ordinary (non-grouped) quote still renders the single-quote view exactly as before -- no option-list regression', async () => {
    await mock(`${BASE}/shared/supabase.js`, `
      export const supabase = {
        storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
        rpc: async (name) => {
          if (name !== 'get_customer_quote') return { data: null, error: { message: 'unexpected rpc' } };
          return { data: {
            reference: 'NS-PLAIN', version: 1, status: 'sent', issued_on: new Date().toISOString(),
            valid_until: null, currency: 'CAD', customer_name: 'Jane Doe', property: '1 Test St',
            customer_notes: null, terms: null, subtotal: 100, tax_total: 0, total: 100,
            company: { phone: '', email: '' },
            lines: [{ description: 'Siding / Soft Wash', amount: 100, pricing_approved: true }],
            adjustments: [], change_orders: [],
            option_group: null
          }, error: null };
        }
      };
    `);
    await page.goto(`${BASE}/site/quote.html?id=plain-quote`);
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => ({
      hasChooseHeading: !!document.querySelector('h1') && document.querySelector('h1').textContent === 'Choose your option',
      hasAccept: [...document.querySelectorAll('button')].some((b) => b.textContent === 'Accept this quote'),
      hasBack: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Back to all options'))
    }));
    assert.equal(info.hasChooseHeading, false, 'option_group: null must render the plain single-quote view, never the chooser');
    assert.equal(info.hasAccept, true);
    assert.equal(info.hasBack, false);
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
