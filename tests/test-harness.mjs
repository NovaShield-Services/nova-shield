// Shared scaffolding for the phase3-phase15 "panel" test files (Playwright
// against the real measurements.js component with a mocked api.js).
//
// Deliberately NOT used by phase2.test.mjs: that file drives a different
// surface (quote.js + the customer-facing site page + signature upload)
// with its own confirm-capturing shim and ~20-function FAKE_API, and is not
// equivalent to the panel-fixture pattern here. Forcing it onto this shared
// harness would risk silently breaking its confirm-message assertions --
// identified and deliberately left alone during the Phase 16 consolidation.
//
// phase10-5.test.mjs overrides deleteMeasurement with a no-op instead of
// the tracked version below -- a real, pre-existing discrepancy from that
// file, preserved here via override rather than silently normalized away.

import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

export const BASE = 'http://localhost:8743';

export const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
export const DEFAULT_FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

export function createRecorder() {
  const results = [];
  function record(name, fn) {
    return Promise.resolve().then(fn).then(
      () => results.push({ name, ok: true }),
      (err) => results.push({ name, ok: false, err: err.message || String(err) })
    );
  }
  return { results, record };
}

// The six api.js functions every panel fixture mocks identically. A file
// that needs to add more (none currently do) can concatenate its own
// template literal onto this one; a file that needs to override one (only
// phase10-5's deleteMeasurement) should mock api.js with its own full
// string rather than build on this constant.
export const BASE_FAKE_API_PANEL = `
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
  export async function deleteMeasurement(id) {
    globalThis.__deleteMeasurementCalls = globalThis.__deleteMeasurementCalls || [];
    globalThis.__deleteMeasurementCalls.push(id);
  }
  export async function setMeasurementModifier(measurementId, groupIds, newId) {
    globalThis.__setModifierCalls = globalThis.__setModifierCalls || [];
    globalThis.__setModifierCalls.push({ measurementId, groupIds, newId });
  }
  export async function deleteMeasurementAddon() {}
  export async function addMeasurementAddon() { return {}; }
`;

// Every panel file's dialog handler is one of exactly two shapes: accept
// confirm, dismiss everything else (phase3 only), or accept confirm, accept
// prompt with a fixed per-file string, dismiss anything else (every other
// phase file, each with its own prompt string -- e.g. 'Garage', 'Detached
// enclosure'). Omit promptValue to get phase3's dismiss-prompt behavior.
export function makeDialogHandler(promptValue) {
  return (d) => {
    if (d.type() === 'confirm') d.accept();
    else if (promptValue !== undefined && d.type() === 'prompt') d.accept(promptValue);
    else d.dismiss();
  };
}

// Launches the browser, mocks the three fixed modules + the caller's
// api.js body, wires the dialog handler, and navigates + settles -- the
// exact sequence every panel file ran inline.
export async function launchPanelPage({ fakeApi, promptValue, fakeSupabase = DEFAULT_FAKE_SUPABASE } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const mock = (urlPattern, body) => page.route(urlPattern, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body }));

  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, fakeSupabase);
  await mock(`${BASE}/admin/js/lib/api.js`, fakeApi);
  page.on('dialog', makeDialogHandler(promptValue));

  await page.goto(`${BASE}/admin/field.html`);
  await page.waitForTimeout(150);
  return { browser, page, mock };
}

// The closing block every panel file ran: print each result, the X/Y
// tally, and exit 1 if anything failed -- after closing the browser.
export async function finishAndReport(browser, results) {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}
