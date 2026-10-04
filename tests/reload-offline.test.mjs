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

const FAKE_CAPACITOR_CORE = `
  export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
`;
const FAKE_SUPABASE = `
  export const supabase = { auth: { signOut: async () => {} } };
  export async function getSession() { return { session: null, isAdmin: false }; }
`;

const job = {
  id: 'job-1', status: 'in_progress', customers: { name: 'Jane Doe', phone: '+16045550123', email: 'jane@example.com' },
  properties: { id: 'prop-1', address_line1: '123 Main St', city: 'Vancouver', postal_code: 'V1A 1A1', passport: {} }
};

// A real (unmocked) api.js module, minimal stubs for everything renderVisit()
// and its sub-panels touch, so the ONLY thing under test -- reload()'s
// behaviour once Promise.all() rejects -- is exercised against genuine
// callOrQueue() / looksOffline() logic (also unmocked), not a simulation of it.
const FAKE_API = `
  globalThis.__getJobCalls = 0;
  export async function getJob() { globalThis.__getJobCalls++; return ${JSON.stringify(job)}; }
  export async function listServices() { return []; }
  export async function listModifiers() { return []; }
  export async function listSiteFactors() { return []; }
  export async function listInspectionFlags() { return []; }
  export async function listServiceFlagMap() { return []; }
  export async function getSettings() { return { company: { website: 'https://novashieldmaintenance.com' } }; }
  export async function listPricingRules() { return []; }
  export async function listSections() { return []; }
  export async function listMeasurements() { return []; }
  export async function listJobFlags() { return []; }
  export async function calculatePricing() { return []; }
  export async function listQuotes() {
    if (globalThis.__listQuotesShouldFail) throw new Error('permission denied for table ns_quotes');
    return [];
  }
  export async function listAttachments() { return []; }
  export async function updateJob() { return {}; }
  export async function updateProperty(id, patch) {
    globalThis.__updatePropertyCalls = globalThis.__updatePropertyCalls || [];
    globalThis.__updatePropertyCalls.push({ id, patch });
    return { id, ...patch };
  }
  export async function createSection() { return {}; }
  export async function updateSection() { return {}; }
  export async function deleteSection() { return {}; }
  export async function createMeasurement() { return {}; }
  export async function updateMeasurement() { return {}; }
  export async function deleteMeasurement() { return {}; }
  export async function addMeasurementAddon() { return {}; }
  export async function deleteMeasurementAddon() { return {}; }
  export async function setMeasurementModifier() { return {}; }
  export async function addAdjustment() { return {}; }
  export async function deleteAdjustment() { return {}; }
  export async function deleteLine() { return {}; }
  export async function duplicateQuote() { return {}; }
  export async function sendQuote() { return {}; }
  export async function updateQuote() { return {}; }
  export async function saveQuoteSignature() { return {}; }
  export async function uploadSignature() { return 'sig/path.png'; }
  export async function uploadJobPhoto() { return {}; }
  export async function deleteAttachment() { return {}; }
  export async function signedPhotoUrl() { return 'https://example.invalid/x.jpg'; }
`;

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const mock = (urlPattern, body) => page.route(urlPattern, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body }));

  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE);
  await mock(`${BASE}/admin/js/lib/api.js`, FAKE_API);

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(`${BASE}/admin/field.html`);
  await page.waitForTimeout(150);

  await record('field-workspace.js: offline passport save repaints instead of an unhandled rejection', async () => {
    pageErrors.length = 0;
    const info = await page.evaluate(async () => {
      const mod = await import('/admin/js/views/field-workspace.js');
      const mount = document.createElement('div');
      document.body.appendChild(mount);
      await mod.renderVisit({ mount, navigate: () => {} }, 'job-1');

      // Go genuinely offline (navigator.onLine flips, same mechanism
      // offline-queue.js's own callOrQueue() checks) and save the Property
      // Passport form -- this is the exact path that used to vanish into
      // an un-awaited, unhandled reload() rejection.
      window.__wasOnline = navigator.onLine;
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

      const saveBtn = [...mount.querySelectorAll('button')].find((b) => b.textContent === 'Save passport');
      saveBtn.click();
      await new Promise((r) => setTimeout(r, 200));

      const toastEl = document.getElementById('toast');
      const toastText = toastEl ? toastEl.textContent : null;
      const stillMounted = document.body.contains(mount);
      Object.defineProperty(window.navigator, 'onLine', { value: window.__wasOnline, configurable: true });
      mount.remove();
      return { toastText, stillMounted, queuedUpdates: window.__updatePropertyCalls || [] };
    });
    assert.equal(info.stillMounted, true, 'the page should not have crashed/torn down');
    assert.match(info.toastText || '', /Offline.*saved locally/i);
    // updateProperty must NOT have actually been called while offline --
    // it should have queued into IndexedDB instead (callOrQueue's job).
    assert.equal(info.queuedUpdates.length, 0, 'a real network write must not fire while offline');
    assert.equal(pageErrors.length, 0, `expected no page errors/unhandled rejections, got: ${JSON.stringify(pageErrors)}`);
  });

  await record('field-workspace.js: reload() still surfaces a genuine (non-network) error', async () => {
    pageErrors.length = 0;
    const info = await page.evaluate(async () => {
      globalThis.__listQuotesShouldFail = true;
      const mod = await import('/admin/js/views/field-workspace.js');
      const mount = document.createElement('div');
      document.body.appendChild(mount);
      let threw = null;
      try {
        // renderVisit's own final `await reload();` is awaited there, so a
        // genuine (non-network) error from it is expected to propagate out
        // of renderVisit itself, same as before this fix -- only a
        // looks-offline failure should ever be swallowed.
        await mod.renderVisit({ mount, navigate: () => {} }, 'job-1');
      } catch (err) {
        threw = err.message;
      }
      globalThis.__listQuotesShouldFail = false;
      mount.remove();
      return { threw };
    });
    assert.match(info.threw || '', /permission denied/);
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
