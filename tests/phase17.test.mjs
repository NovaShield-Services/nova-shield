// Phase 17 -- production-readiness Batch 2 regressions.
//
// Covers the six workflow capabilities wired up in Batch 2, each of which
// uses a column that already existed in the schema and that no code path
// ever wrote: ns_jobs.scheduled_for, ns_jobs.completed_at, job_notes, and
// job_inspection_flags.note. Plus the requested-services join (read through
// the normalized quote_request_services relationship rather than copied),
// the next-step projection, and the client half of the empty-quote
// acceptance guard.

import assert from 'node:assert/strict';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
import { createRecorder, BASE, FAKE_CAPACITOR_CORE } from './test-harness.mjs';

const { chromium } = pkg;
const { results, record } = createRecorder();

const FAKE_SUPABASE_ADMIN = `
  export const supabase = { auth: { signOut: async () => {} } };
  export async function getSession() { return { session: { user: { id: 'admin-1' } }, isAdmin: true }; }
`;

/* Mirrors the real production shapes: a job created from a website request,
   with one measurement, one ticked inspection flag carrying no note, and no
   quotes yet. */
const JOB = {
  id: 'job-1', reference: 'NS-1001', status: 'reviewing', request_id: 'req-1',
  scheduled_for: null, completed_at: null,
  customers: { id: 'cust-1', name: 'Dana Whitfield', phone: '555-0100', email: 'dana@example.com' },
  properties: { id: 'prop-1', address_line1: '12 Example Street', city: 'Kelowna', postal_code: 'V1V 1V1' },
  quote_requests: {
    id: 'req-1', submitted_at: '2026-10-01T15:00:00Z',
    customer_message: 'Gutters overflowing at the back corner.',
    preferred_schedule: 'Weekday mornings',
    quote_request_services: [
      { other_label: null, services: { id: 'svc-gutter', name: 'Gutter Cleaning', key: 'gutter' } },
      { other_label: 'Shed roof moss', services: null }
    ]
  }
};

const SVC = { id: 'svc-gutter', key: 'gutter', name: 'Gutter Cleaning', unit: 'linear_ft',
              category: 'cleaning', quotable: true, active: true, parent_key: null };
const FLAG = { id: 'flag-1', key: 'difficult_access', name: 'Difficult access',
               warning: 'Allow extra time.', active: true, sort_order: 1 };

function fakeApi({ job = JOB, jobFlags = [{ flag_id: 'flag-1', note: null }], notes = [], quotes = [] } = {}) {
  return `
    globalThis.__calls = { scheduleJob: [], completeJob: [], addNote: [], setJobFlagNote: [], deleteNote: [] };
    let JOB = ${JSON.stringify(job)};
    let NOTES = ${JSON.stringify(notes)};

    export async function getJob() { return JSON.parse(JSON.stringify(JOB)); }
    export async function listServices() { return [${JSON.stringify(SVC)}]; }
    export async function listModifiers() { return []; }
    export async function listSiteFactors() { return []; }
    export async function listInspectionFlags() { return [${JSON.stringify(FLAG)}]; }
    export async function listServiceFlagMap() { return [{ service_id: 'svc-gutter', flag_id: 'flag-1' }]; }
    export async function listPricingRules() { return [{ service_id: 'svc-gutter', approval_status: 'approved', rate: 2, minimum: 150, services: ${JSON.stringify(SVC)} }]; }
    export async function currentUserId() { return 'admin-1'; }
    export async function listSections() { return [{ id: 'sec-1', name: 'Front', storeys: '1', access: 'clear', review_required: false }]; }
    export async function listMeasurements() { return [{ id: 'm-1', job_id: 'job-1', service_id: 'svc-gutter', quantity: 40, unit: 'linear_ft', review_required: false, measurement_modifiers: [], job_measurement_addons: [] }]; }
    export async function listJobFlags() { return ${JSON.stringify(jobFlags)}; }
    export async function calculatePricing() { return [{ service_id: 'svc-gutter', service_name: 'Gutter Cleaning', amount: 150, unit_rate: 2, minimum_applied: true }]; }
    export async function listQuotes() { return ${JSON.stringify(quotes)}; }
    export async function listAttachments() { return []; }
    export async function listNotes() { return JSON.parse(JSON.stringify(NOTES)); }
    export async function getSettings() { return {}; }

    export async function scheduleJob(id, iso) {
      globalThis.__calls.scheduleJob.push({ id, iso });
      JOB = { ...JOB, scheduled_for: iso };
      return { ...JOB };
    }
    export async function completeJob(id) {
      globalThis.__calls.completeJob.push(id);
      // Mirrors the real \`is null\` guard: a second call matches no row.
      if (JOB.completed_at) return null;
      JOB = { ...JOB, completed_at: '2026-10-07T18:00:00Z', status: 'completed' };
      return { ...JOB };
    }
    export async function addNote(jobId, body, visibility) {
      globalThis.__calls.addNote.push({ jobId, body, visibility });
      NOTES = [{ id: 'n-' + NOTES.length, job_id: jobId, body, visibility,
                 author_id: 'admin-1', created_at: new Date().toISOString() }, ...NOTES];
      return NOTES[0];
    }
    export async function deleteNote(id) { globalThis.__calls.deleteNote.push(id); NOTES = NOTES.filter(n => n.id !== id); }
    export async function setJobFlagNote(jobId, flagId, note) {
      globalThis.__calls.setJobFlagNote.push({ jobId, flagId, note });
    }
    export async function setJobFlag() {}
    export async function updateJob() { return { ...JOB }; }
    export async function updateSection() {}
    export async function deleteSection() {}
    export async function createSection() { return {}; }
    export async function createMeasurement() { return {}; }
    export async function updateMeasurement() { return {}; }
    export async function deleteMeasurement() {}
    export async function setMeasurementModifier() {}
    export async function addMeasurementAddon() { return {}; }
    export async function deleteMeasurementAddon() {}
    export async function signedPhotoUrl() { return 'about:blank'; }
    export function attachmentBucket() { return 'job-photos'; }
    export async function createQuoteFromCalculation() { return {}; }
    export async function createOptionQuote() { return {}; }
    export async function duplicateQuote() { return {}; }
    export async function sendQuote() { return {}; }
    export async function sendOptionGroup() { return {}; }
    export async function updateQuote() { return {}; }
    export async function addAdjustment() { return {}; }
    export async function deleteAdjustment() {}
    export async function deleteLine() {}
    export async function uploadSignature() { return 'p'; }
    export async function saveQuoteSignature() { return {}; }
    export async function addChangeOrder() { return {}; }
    export async function setChangeOrderStatus() {}
    export async function listJobs() { return []; }
  `;
}

async function openJob(browser, apiBody) {
  const page = await browser.newPage();
  const mock = (urlPattern, body) =>
    page.route(urlPattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body }));
  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE_ADMIN);
  await mock(`${BASE}/admin/js/lib/api.js`, apiBody);
  page.on('dialog', (d) => d.accept());
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`${BASE}/admin/field.html`);
  await page.evaluate(async () => {
    const mod = await import('/admin/js/views/job.js');
    const mount = document.getElementById('view');
    await mod.renderJob({ mount, navigate: () => {} }, 'job-1');
  });
  await page.waitForTimeout(150);
  return page;
}

const textOf = (page) => page.evaluate(() => document.getElementById('view').textContent);

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ------------------------------------------------------------ scheduling -- */

  await record('1. Setting a date persists it as an ISO timestamp via scheduleJob', async () => {
    const page = await openJob(browser, fakeApi());
    const call = await page.evaluate(async () => {
      const input = document.querySelector('input[aria-label="Scheduled for"]');
      input.value = '2026-11-14T09:30';
      [...document.querySelectorAll('button')].find(b => b.textContent === 'Save date').click();
      await new Promise(r => setTimeout(r, 200));
      return globalThis.__calls.scheduleJob[0];
    });
    assert.equal(call.id, 'job-1');
    // Local datetime-local value -> UTC ISO. Compare against the same
    // conversion rather than a hardcoded string, so the test does not
    // depend on the container's timezone.
    const expected = new Date('2026-11-14T09:30').toISOString();
    assert.equal(call.iso, expected);
    await page.close();
  });

  await record('2. An invalid or empty date is rejected before any write', async () => {
    const page = await openJob(browser, fakeApi());
    const got = await page.evaluate(async () => {
      const input = document.querySelector('input[aria-label="Scheduled for"]');
      input.value = '';
      [...document.querySelectorAll('button')].find(b => b.textContent === 'Save date').click();
      await new Promise(r => setTimeout(r, 150));
      return { calls: globalThis.__calls.scheduleJob.length,
               toast: document.getElementById('toast').textContent };
    });
    assert.equal(got.calls, 0, 'must not write without a date');
    assert.match(got.toast, /Pick a date and time/);
    await page.close();
  });

  await record('3. Double-clicking Save date fires exactly one write', async () => {
    const page = await openJob(browser, fakeApi());
    const count = await page.evaluate(async () => {
      const input = document.querySelector('input[aria-label="Scheduled for"]');
      input.value = '2026-11-14T09:30';
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent === 'Save date');
      btn.click(); btn.click(); btn.click();
      await new Promise(r => setTimeout(r, 250));
      return globalThis.__calls.scheduleJob.length;
    });
    assert.equal(count, 1, `double submit produced ${count} writes`);
    await page.close();
  });

  await record('4. A scheduled job states when it is booked for', async () => {
    const page = await openJob(browser, fakeApi({
      job: { ...JOB, scheduled_for: '2026-11-14T17:30:00Z' }
    }));
    assert.match(await textOf(page), /Booked for/);
    await page.close();
  });

  /* ------------------------------------------------------------ completion -- */

  await record('5. Mark job complete persists completed_at', async () => {
    const page = await openJob(browser, fakeApi());
    const got = await page.evaluate(async () => {
      [...document.querySelectorAll('button')].find(b => b.textContent === 'Mark job complete').click();
      await new Promise(r => setTimeout(r, 250));
      return { calls: globalThis.__calls.completeJob.length,
               text: document.getElementById('view').textContent };
    });
    assert.equal(got.calls, 1);
    assert.match(got.text, /Completed/);
    await page.close();
  });

  await record('6. An already-complete job cannot be completed again', async () => {
    const page = await openJob(browser, fakeApi({
      job: { ...JOB, completed_at: '2026-10-05T12:00:00Z', status: 'completed' }
    }));
    const got = await page.evaluate(async () => {
      const btn = [...document.querySelectorAll('button')].find(b => /complete/i.test(b.textContent));
      const disabled = btn.disabled;
      btn.click();
      await new Promise(r => setTimeout(r, 150));
      return { disabled, calls: globalThis.__calls.completeJob.length };
    });
    assert.equal(got.disabled, true, 'the button must be disabled once complete');
    assert.equal(got.calls, 0, 'no second completion write');
    await page.close();
  });

  /* ----------------------------------------------------------------- notes -- */

  await record('7. Adding a note persists body and visibility', async () => {
    const page = await openJob(browser, fakeApi());
    const call = await page.evaluate(async () => {
      const ta = document.querySelector('textarea[aria-label="Note"]');
      ta.value = 'Downspout is crushed at the base.';
      const vis = [...document.querySelectorAll('select')]
        .find(s => [...s.options].some(o => o.value === 'customer'));
      vis.value = 'customer';
      [...document.querySelectorAll('button')].find(b => b.textContent === 'Add note').click();
      await new Promise(r => setTimeout(r, 250));
      return globalThis.__calls.addNote[0];
    });
    assert.equal(call.jobId, 'job-1');
    assert.equal(call.body, 'Downspout is crushed at the base.');
    assert.equal(call.visibility, 'customer', 'visibility must be the selected value, not a default');
    await page.close();
  });

  await record('8. An empty note is refused without a write', async () => {
    const page = await openJob(browser, fakeApi());
    const got = await page.evaluate(async () => {
      [...document.querySelectorAll('button')].find(b => b.textContent === 'Add note').click();
      await new Promise(r => setTimeout(r, 150));
      return { calls: globalThis.__calls.addNote.length,
               toast: document.getElementById('toast').textContent };
    });
    assert.equal(got.calls, 0);
    assert.match(got.toast, /Write something first/);
    await page.close();
  });

  await record('9. Notes render newest-first with their visibility and attribution', async () => {
    const page = await openJob(browser, fakeApi({
      notes: [
        { id: 'n-2', body: 'Second note', visibility: 'customer', author_id: 'admin-1', created_at: '2026-10-06T12:00:00Z' },
        { id: 'n-1', body: 'First note', visibility: 'internal', author_id: 'other-admin', created_at: '2026-10-01T12:00:00Z' }
      ]
    }));
    const got = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.section-box')]
        .filter(b => /First note|Second note/.test(b.textContent));
      return { order: boxes.map(b => (/Second note/.test(b.textContent) ? 'second' : 'first')),
               text: document.getElementById('view').textContent };
    });
    assert.deepEqual(got.order, ['second', 'first'], 'listNotes order must be preserved (newest first)');
    assert.match(got.text, /Customer-visible/);
    assert.match(got.text, /Internal/);
    // author_id is stored but auth.users is unreadable from the browser, so
    // "you" vs "another admin" is the honest limit -- never a fabricated name.
    assert.match(got.text, /you/);
    assert.match(got.text, /another admin/);
    await page.close();
  });

  /* ------------------------------------------------------- inspection note -- */

  await record('10. A note typed against a ticked inspection flag is persisted', async () => {
    const page = await openJob(browser, fakeApi());
    const call = await page.evaluate(async () => {
      const input = document.querySelector('input[aria-label="Note for Difficult access"]');
      input.value = 'Soffit rotted above the bay window.';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      return globalThis.__calls.setJobFlagNote[0];
    });
    assert.equal(call.jobId, 'job-1');
    assert.equal(call.flagId, 'flag-1');
    assert.equal(call.note, 'Soffit rotted above the bay window.');
    await page.close();
  });

  await record('11. No note input is offered for a flag that is not ticked', async () => {
    const page = await openJob(browser, fakeApi({ jobFlags: [] }));
    const present = await page.evaluate(() =>
      !!document.querySelector('input[aria-label="Note for Difficult access"]'));
    assert.equal(present, false, 'a note field only belongs to a ticked check');
    await page.close();
  });

  /* ---------------------------------------------------- requested services -- */

  await record('12. The job shows what the customer originally requested', async () => {
    const page = await openJob(browser, fakeApi());
    const text = await textOf(page);
    assert.match(text, /Originally requested/);
    assert.match(text, /Gutter Cleaning/);
    assert.match(text, /Shed roof moss/, 'an "other" free-text request must still show');
    assert.match(text, /Gutters overflowing/, 'the customer message belongs with the request');
    await page.close();
  });

  await record('13. A job with no originating request shows no requested-services card', async () => {
    const page = await openJob(browser, fakeApi({
      job: { ...JOB, request_id: null, quote_requests: null }
    }));
    const text = await textOf(page);
    assert.ok(!/Originally requested/.test(text),
      'a manually created job has no request history to show');
    await page.close();
  });

  /* ------------------------------------------------------- next-step ladder -- */

  await record('14. Next-step guidance is derived only from real job data', async () => {
    const page = await openJob(browser, fakeApi());
    const got = await page.evaluate(async () => {
      const { jobSteps, currentStep } = await import('/admin/js/components/next-step.js');

      const base = { job: { id: 'j', status: 'reviewing', request_id: 'r' },
                     measurements: [], sections: [], quotes: [], jobFlags: [] };

      const reviewing = currentStep(base);
      const measuring = currentStep({ ...base, job: { id: 'j', status: 'assessed' } });
      const flagged = currentStep({
        ...base, job: { id: 'j', status: 'assessed' },
        measurements: [{ id: 'm', review_required: true }]
      });
      const needsNote = currentStep({
        ...base, job: { id: 'j', status: 'assessed' },
        measurements: [{ id: 'm' }], jobFlags: [{ flag_id: 'f', note: '  ' }]
      });
      const buildQuote = currentStep({
        ...base, job: { id: 'j', status: 'assessed' }, measurements: [{ id: 'm' }]
      });
      const sendDraft = currentStep({
        ...base, job: { id: 'j', status: 'assessed' }, measurements: [{ id: 'm' }],
        quotes: [{ id: 'q', version: 1, status: 'draft', quote_line_items: [{ pricing_approved: true }] }]
      });
      const provisional = currentStep({
        ...base, job: { id: 'j', status: 'assessed' }, measurements: [{ id: 'm' }],
        quotes: [{ id: 'q', version: 1, status: 'draft', quote_line_items: [{ pricing_approved: false }] }]
      });
      const awaiting = currentStep({
        ...base, job: { id: 'j', status: 'quote_sent' }, measurements: [{ id: 'm' }],
        quotes: [{ id: 'q', version: 1, status: 'sent', quote_line_items: [{ pricing_approved: true }] }]
      });
      const schedule = currentStep({
        ...base, job: { id: 'j', status: 'accepted', scheduled_for: null }, measurements: [{ id: 'm' }],
        quotes: [{ id: 'q', version: 1, status: 'accepted', quote_line_items: [{ pricing_approved: true }] }]
      });
      const done = jobSteps({
        ...base,
        job: { id: 'j', status: 'completed', scheduled_for: '2026-01-01T00:00:00Z',
               completed_at: '2026-01-02T00:00:00Z' },
        measurements: [{ id: 'm' }],
        quotes: [{ id: 'q', version: 1, status: 'accepted', quote_line_items: [{ pricing_approved: true }] }]
      });

      return {
        reviewing: reviewing?.key, measuring: measuring?.key, flagged: flagged?.key,
        needsNote: needsNote?.key, buildQuote: buildQuote?.key, sendDraft: sendDraft?.key,
        provisional: provisional?.key, awaiting: awaiting?.key, schedule: schedule?.key,
        doneHasNoNow: done.every(s => s.state !== 'now'),
        noStepsWithoutJob: (await import('/admin/js/components/next-step.js')).jobSteps({}).length
      };
    });

    assert.equal(got.reviewing, 'review-request');
    assert.equal(got.measuring, 'measure');
    assert.equal(got.flagged, 'review-flags');
    assert.equal(got.needsNote, 'flag-notes', 'a ticked flag with a blank note is outstanding');
    assert.equal(got.buildQuote, 'build-quote');
    assert.equal(got.sendDraft, 'send-quote');
    assert.equal(got.provisional, 'approve-pricing', 'provisional pricing outranks sending');
    assert.equal(got.awaiting, 'await-customer');
    assert.equal(got.schedule, 'schedule');
    assert.equal(got.doneHasNoNow, true, 'a finished job has nothing outstanding');
    assert.equal(got.noStepsWithoutJob, 0);
    await page.close();
  });

  await record('15. The job page renders the current step as an action prompt', async () => {
    const page = await openJob(browser, fakeApi());
    const text = await textOf(page);
    assert.match(text, /Next:/);
    assert.match(text, /Action needed/);
    await page.close();
  });

  /* ------------------------------------------- empty-quote acceptance guard -- */

  await record('16. The customer page withholds Accept on a quote with no lines', async () => {
    const page = await browser.newPage();
    const doc = {
      __id: 'q-empty', status: 'sent', reference: 'NS-1001', version: 1,
      currency: 'CAD', subtotal: 0, tax_total: 0, total: 0,
      customer: { name: 'Dana Whitfield' }, property: { address_line1: '12 Example Street' },
      lines: [], adjustments: []
    };
    await page.route('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_CAPACITOR_CORE }));
    await page.route(`${BASE}/shared/supabase.js`, (r) =>
      r.fulfill({
        status: 200, contentType: 'application/javascript',
        body: `
          export const supabase = {
            rpc: async (name) => {
              globalThis.__rpc = (globalThis.__rpc || []).concat(name);
              return { data: ${JSON.stringify(doc)}, error: null };
            },
            storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'about:blank' } }) }) }
          };
          export async function getSession() { return { session: null, isAdmin: false }; }
        `
      }));
    await page.goto(`${BASE}/site/quote.html?id=q-empty`);
    await page.waitForTimeout(300);

    const got = await page.evaluate(() => ({
      text: document.body.textContent,
      buttons: [...document.querySelectorAll('button')].map(b => b.textContent)
    }));

    assert.ok(!got.buttons.some(b => /Accept this/.test(b)),
      `Accept must not be offered for an empty quote; saw ${JSON.stringify(got.buttons)}`);
    assert.match(got.text, /does not list any work yet/);
    assert.ok(got.buttons.some(b => /Decline/.test(b)),
      'declining an empty quote stays available');
    await page.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
