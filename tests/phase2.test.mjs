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

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
