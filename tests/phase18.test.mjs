// Phase 18 -- production-readiness Batch 3 regressions.
//
// Batch 3 moved three things server-side (admin_dashboard_summary,
// search_jobs, job_activity) and built two new screens on top of them. The
// defects worth locking shut are the honesty ones:
//
//   * a failed dashboard load used to be indistinguishable from an idle
//     business, because the counts defaulted to zero
//   * the jobs list used to fetch every row and filter nothing, so there
//     was no way to assert that a filter reached the server at all
//   * a timeline is the easiest place in the app to invent an event. These
//     tests pin down that an undated event is dropped, that an unknown kind
//     is passed through rather than relabelled, and that an actor uuid never
//     becomes a name
//
// The job-activity assertions run in plain node (the module is pure); the
// dashboard, jobs-list and job-page assertions drive a real browser, because
// link targets, filter plumbing and 390px layout can only be measured there.

import assert from 'node:assert/strict';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
import { createRecorder, BASE, FAKE_CAPACITOR_CORE } from './test-harness.mjs';
import { activityRows, groupByDay, SOURCE_LABELS }
  from '../admin/js/components/job-activity.js';

const { chromium } = pkg;
const { results, record } = createRecorder();

const FAKE_SUPABASE_ADMIN = `
  export const supabase = { auth: { signOut: async () => {} } };
  export async function getSession() { return { session: { user: { id: 'admin-1' } }, isAdmin: true }; }
`;

/* A realistic summary: five things waiting, two neutral, one good-news. */
const SUMMARY = {
  requests_new: 3,
  requests_reviewed_unconverted: 1,
  jobs_awaiting_customer: 4,
  jobs_accepted_unscheduled: 2,
  scheduled_today: 1,
  scheduled_next_7_days: 6,
  overdue_scheduled: 1,
  completed_last_14_days: 9,
  jobs_with_review_flags: 2,
  recent_activity: [
    { kind: 'quote_accepted', at: '2026-10-06T18:00:00Z', job_id: 'job-a',
      customer: 'Dana Whitfield', version: 2 },
    { kind: 'request_received', at: '2026-10-06T09:00:00Z', job_id: null,
      customer: 'Sam Oduya' }
  ],
  generated_at: '2026-10-07T12:00:00Z'
};

const ZERO_SUMMARY = Object.fromEntries(
  Object.keys(SUMMARY).map(k => [k, 0])
);
ZERO_SUMMARY.recent_activity = [];
ZERO_SUMMARY.generated_at = '2026-10-07T12:00:00Z';

const JOB_ROWS = [
  { id: 'job-a', reference: 'NS-1001', status: 'accepted',
    scheduled_for: null, completed_at: null, updated_at: '2026-10-06T10:00:00Z',
    customer: { id: 'c1', name: 'Dana Whitfield', email: 'dana@example.com', phone: '555-0100' },
    property: { id: 'p1', address_line1: '12 Example Street', city: 'Kelowna', postal_code: 'V1V 1V1' },
    measurement_count: 3,
    review_flags: { measurements: 2, sections: 1, total: 3 },
    requested_services: ['Gutter Cleaning', 'Roof Cleaning', 'Window Cleaning', 'Moss Removal'],
    latest_quote: { id: 'q1', version: 2, status: 'declined', total: 1840 },
    quote_count: 2, has_unapproved_pricing: true },
  { id: 'job-b', reference: 'NS-1002', status: 'scheduled',
    scheduled_for: '2020-01-02T15:00:00Z', completed_at: null,
    updated_at: '2026-10-05T10:00:00Z',
    customer: { id: 'c2', name: 'Sam Oduya', email: 'sam@example.com', phone: '555-0200' },
    property: { id: 'p2', address_line1: '7 Other Road', city: 'Vernon', postal_code: 'V1T 2T2' },
    measurement_count: 1, review_flags: { measurements: 0, sections: 0, total: 0 },
    requested_services: ['Gutter Cleaning'],
    latest_quote: { id: 'q2', version: 1, status: 'accepted', total: 620 },
    quote_count: 1, has_unapproved_pricing: false }
];

/* api.js stand-in for the whole SPA. Every call is recorded so a test can
   assert both WHAT was asked for and HOW MANY round trips it took. */
function fakeApi({ summary = SUMMARY, rows = JOB_ROWS, failSummary = false,
                   failJobs = false } = {}) {
  return `
    globalThis.__calls = { dashboardSummary: 0, searchJobs: [], listRequests: [] };

    export async function dashboardSummary() {
      globalThis.__calls.dashboardSummary += 1;
      ${failSummary ? `throw new Error('network down');` : ''}
      return ${JSON.stringify(summary)};
    }

    export async function searchJobs(args) {
      globalThis.__calls.searchJobs.push(args);
      ${failJobs ? `throw new Error('network down');` : ''}
      const rows = ${JSON.stringify(rows)};
      return { total: rows.length, limit: 50, offset: 0,
               sort: args?.sort || 'updated_desc', rows };
    }

    export async function listRequests(status) {
      globalThis.__calls.listRequests.push(status);
      return [];
    }
    export async function getSettings() { return {}; }
  `;
}

async function openAdmin(browser, { hash = '/dashboard', width = 1200, api = fakeApi() } = {}) {
  const page = await browser.newPage();
  const mock = (urlPattern, body) =>
    page.route(urlPattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body }));
  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE_ADMIN);
  await mock(`${BASE}/admin/js/lib/api.js`, api);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/admin/index.html#${hash}`);
  await page.waitForTimeout(300);
  return page;
}

const viewText = (page) => page.evaluate(() => document.getElementById('view').textContent);
const overflow = (page) => page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  client: document.documentElement.clientWidth
}));

/* ------------------------------------------------- job detail fixtures -- */

/* Must match main.js's /^\/jobs\/([0-9a-f-]+)$/, and renderJob is driven
   directly (as phase17 does) so the detail page is not coupled to routing. */
const JOB_ID = '0000000a-0000-4000-8000-00000000000a';

const DETAIL_JOB = {
  id: JOB_ID, reference: 'NS-1001', status: 'quote_sent', request_id: 'req-1',
  scheduled_for: null, completed_at: null,
  customers: { id: 'c1', name: 'Dana Whitfield', phone: '555-0100', email: 'dana@example.com' },
  properties: { id: 'p1', address_line1: '12 Example Street', city: 'Kelowna', postal_code: 'V1V 1V1' },
  quote_requests: {
    id: 'req-1', submitted_at: '2026-10-01T15:00:00Z',
    customer_message: 'Gutters overflowing at the back corner.',
    preferred_schedule: 'Weekday mornings',
    quote_request_services: [
      { other_label: null, services: { id: 'svc-gutter', name: 'Gutter Cleaning', key: 'gutter' } }
    ]
  }
};

const SVC = { id: 'svc-gutter', key: 'gutter', name: 'Gutter Cleaning', unit: 'linear_ft',
              category: 'cleaning', quotable: true, active: true, parent_key: null };

/* Two flagged measurements and one flagged elevation -- the rollup's whole
   reason to exist is that these were previously invisible unless you
   scrolled to the row and expanded it. */
const FLAGGED_MEASUREMENTS = [
  { id: 'm-1', job_id: JOB_ID, service_id: 'svc-gutter', quantity: 40, unit: 'linear_ft',
    label: 'North run', review_required: true, review_reason: 'Rotten fascia under the gutter',
    measurement_modifiers: [], job_measurement_addons: [] },
  { id: 'm-2', job_id: JOB_ID, service_id: 'svc-gutter', quantity: 18, unit: 'linear_ft',
    label: null, review_required: true, review_reason: null,
    measurement_modifiers: [], job_measurement_addons: [] },
  { id: 'm-3', job_id: JOB_ID, service_id: 'svc-gutter', quantity: 10, unit: 'linear_ft',
    label: null, review_required: false, review_reason: null,
    measurement_modifiers: [], job_measurement_addons: [] }
];

const ACTIVITY = [
  { kind: 'request_received', at: '2026-10-01T15:00:00Z', source: 'quote_requests',
    actor_id: null, actor_name: null, detail: { channel: 'website', preferred_schedule: 'Weekday mornings' } },
  { kind: 'job_created', at: '2026-10-01T15:05:00Z', source: 'ns_jobs',
    actor_id: 'admin-1', actor_name: null, detail: { reference: 'NS-1001' } },
  { kind: 'note_added', at: '2026-10-02T09:00:00Z', source: 'job_notes',
    actor_id: 'admin-1', actor_name: null,
    detail: { visibility: 'internal', body: 'Access code is 4821 — do not send to customer.' } },
  { kind: 'note_added', at: '2026-10-02T09:30:00Z', source: 'job_notes',
    actor_id: 'someone-else', actor_name: null,
    detail: { visibility: 'customer', body: 'We will be on site Tuesday morning.' } },
  { kind: 'quote_sent', at: '2026-10-02T11:00:00Z', source: 'ns_quotes',
    actor_id: 'admin-1', actor_name: null, detail: { version: 1, total: 1840 } }
];

function detailApi({ job = DETAIL_JOB, measurements = FLAGGED_MEASUREMENTS,
                     sections = [], activity = ACTIVITY, failActivity = false } = {}) {
  return `
    globalThis.__calls = { jobActivity: 0 };
    export async function getJob() { return ${JSON.stringify(job)}; }
    export async function listServices() { return [${JSON.stringify(SVC)}]; }
    export async function listModifiers() { return []; }
    export async function listSiteFactors() { return []; }
    export async function listInspectionFlags() { return []; }
    export async function listServiceFlagMap() { return []; }
    export async function listPricingRules() { return [{ service_id: 'svc-gutter', approval_status: 'approved', rate: 2, minimum: 150, services: ${JSON.stringify(SVC)} }]; }
    export async function currentUserId() { return 'admin-1'; }
    export async function listSections() { return ${JSON.stringify(sections)}; }
    export async function listMeasurements() { return ${JSON.stringify(measurements)}; }
    export async function listJobFlags() { return []; }
    export async function calculatePricing() { return []; }
    export async function listQuotes() { return []; }
    export async function listAttachments() { return []; }
    export async function listNotes() { return []; }
    export async function getSettings() { return {}; }
    export async function jobActivity() {
      globalThis.__calls.jobActivity += 1;
      ${failActivity ? `throw new Error('activity unavailable');` : ''}
      return ${JSON.stringify(activity)};
    }
    export async function scheduleJob() { return {}; }
    export async function completeJob() { return {}; }
    export async function addNote() { return {}; }
    export async function deleteNote() {}
    export async function setJobFlag() {}
    export async function setJobFlagNote() {}
    export async function updateJob() { return {}; }
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
    export async function searchJobs() { return { total: 0, rows: [] }; }
  `;
}

async function openJob(browser, apiBody, width = 1200) {
  const page = await browser.newPage();
  const mock = (urlPattern, body) =>
    page.route(urlPattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body }));
  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE_ADMIN);
  await mock(`${BASE}/admin/js/lib/api.js`, apiBody);
  page.on('dialog', (d) => d.accept());
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/admin/field.html`);
  await page.evaluate(async (jobId) => {
    const mod = await import('/admin/js/views/job.js');
    await mod.renderJob({ mount: document.getElementById('view'), navigate: () => {} }, jobId);
  }, JOB_ID);
  await page.waitForTimeout(250);
  return page;
}

async function main() {
  /* ================================================ timeline event mapping ==
     Pure-function assertions: no DOM needed, and these are the ones that
     guard against invention. */

  await record('1. Activity rows are ordered newest-first regardless of input order', async () => {
    const rows = activityRows([
      { kind: 'job_created',      at: '2026-10-01T15:05:00Z' },
      { kind: 'quote_sent',       at: '2026-10-02T11:00:00Z' },
      { kind: 'request_received', at: '2026-10-01T15:00:00Z' }
    ]);
    assert.deepEqual(rows.map(r => r.kind), ['quote_sent', 'job_created', 'request_received']);
  });

  await record('2. An event with no timestamp is dropped rather than placed arbitrarily', async () => {
    const rows = activityRows([
      { kind: 'quote_sent', at: '2026-10-02T11:00:00Z' },
      { kind: 'quote_superseded', at: null },
      { kind: 'quote_viewed' }
    ]);
    assert.equal(rows.length, 1, 'only the dated event should survive');
    assert.equal(rows[0].kind, 'quote_sent');
    // Nothing in the module can manufacture a 'viewed' event: there is no
    // viewed_at column anywhere in the schema.
    assert.equal(activityRows([]).length, 0);
  });

  await record('3. Known kinds get their real label and tone; a loss never reads as a win', async () => {
    const [accepted] = activityRows([{ kind: 'quote_accepted', at: '2026-10-05T10:00:00Z' }]);
    const [declined] = activityRows([{ kind: 'quote_declined', at: '2026-10-05T10:00:00Z' }]);
    assert.equal(accepted.label, 'Quote accepted');
    assert.equal(accepted.tone, 'ok');
    assert.equal(declined.label, 'Quote declined');
    assert.notEqual(declined.tone, 'ok', 'a declined quote must not be styled as good news');
  });

  await record('4. An unrecognised kind is passed through, not relabelled or dropped', async () => {
    const [row] = activityRows([{ kind: 'some_future_event', at: '2026-10-05T10:00:00Z' }]);
    assert.equal(row.known, false);
    assert.equal(row.label, 'some future event');
    assert.equal(row.tone, 'muted');
  });

  await record('5. scheduled_for is marked as a target date, not as "when it was booked"', async () => {
    const [row] = activityRows([{ kind: 'scheduled_for', at: '2026-11-14T17:30:00Z' }]);
    assert.equal(row.isTargetDate, true);
    assert.match(row.detail, /does not record when it was booked/);
  });

  await record('6. Supersession appears as context on the quote, not as a dated event', async () => {
    const [row] = activityRows([{
      kind: 'quote_created', at: '2026-10-02T10:00:00Z',
      detail: { version: 1, total: 1840, current_status: 'superseded' }
    }]);
    assert.equal(row.label, 'Quote created');
    assert.match(row.detail, /later superseded/);
  });

  await record('7. An actor uuid never becomes a name', async () => {
    const rows = activityRows([
      { kind: 'note_added',   at: '2026-10-03T10:00:00Z', actor_id: 'admin-1' },
      { kind: 'note_added',   at: '2026-10-03T09:00:00Z', actor_id: '9f2c-not-a-name' },
      { kind: 'note_added',   at: '2026-10-03T08:00:00Z', actor_id: null },
      { kind: 'quote_signed', at: '2026-10-03T07:00:00Z', actor_id: null, actor_name: 'Dana Whitfield' }
    ], { currentUserId: 'admin-1' });
    assert.equal(rows[0].actor, 'you');
    assert.equal(rows[1].actor, 'a staff member');
    assert.equal(rows[2].actor, null, 'an unknown actor must stay unknown');
    assert.equal(rows[3].actor, 'Dana Whitfield', 'signed_by_name is the one real name in the schema');
  });

  await record('8. Note visibility and body are carried through verbatim', async () => {
    const rows = activityRows([
      { kind: 'note_added', at: '2026-10-03T10:00:00Z',
        detail: { visibility: 'internal', body: 'Access code 4821' } },
      { kind: 'note_added', at: '2026-10-03T09:00:00Z',
        detail: { visibility: 'customer', body: 'On site Tuesday' } },
      { kind: 'note_added', at: '2026-10-03T08:00:00Z', detail: { body: 'No visibility given' } }
    ]);
    assert.equal(rows[0].visibility, 'internal');
    assert.equal(rows[0].body, 'Access code 4821');
    assert.equal(rows[1].visibility, 'customer');
    // An unspecified visibility must default to the safe side.
    assert.equal(rows[2].visibility, 'internal');
    // Only notes carry a visibility; nothing else should claim an audience.
    const [quote] = activityRows([{ kind: 'quote_sent', at: '2026-10-03T10:00:00Z' }]);
    assert.equal(quote.visibility, null);
  });

  await record('9. Rows group by calendar day and keep the newest-first order', async () => {
    const rows = activityRows([
      { kind: 'quote_sent',  at: '2026-10-02T11:00:00Z' },
      { kind: 'note_added',  at: '2026-10-02T09:00:00Z' },
      { kind: 'job_created', at: '2026-10-01T15:05:00Z' }
    ]);
    const days = groupByDay(rows);
    assert.equal(days.length, 2, 'two calendar days');
    assert.equal(days[0].rows.length, 2);
    assert.equal(days[1].rows.length, 1);
    assert.equal(days[0].rows[0].kind, 'quote_sent');
    assert.equal(SOURCE_LABELS.job_notes, 'Note');
  });

  /* ============================================================== browser == */

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ----------------------------------------------------------- dashboard -- */

  await record('10. Dashboard loads in exactly one round trip', async () => {
    const page = await openAdmin(browser);
    const n = await page.evaluate(() => globalThis.__calls.dashboardSummary);
    assert.equal(n, 1, `dashboard made ${n} calls; it must make exactly one`);
    await page.close();
  });

  await record('11. Every dashboard count comes from the summary and links to its records', async () => {
    const page = await openAdmin(browser);
    const tiles = await page.evaluate(() =>
      [...document.querySelectorAll('.stat-grid a.stat')].map(a => ({
        href: a.getAttribute('href'),
        n: a.querySelector('.stat__n').textContent,
        label: a.querySelector('.stat__l').textContent
      })));

    assert.equal(tiles.length, 9, 'nine tiles, one per summary field');
    const byLabel = Object.fromEntries(tiles.map(t => [t.label, t]));

    assert.equal(byLabel['New requests'].n, '3');
    assert.equal(byLabel['New requests'].href, '#/requests?status=new');
    assert.equal(byLabel['Overdue on site'].n, '1');
    assert.equal(byLabel['Overdue on site'].href, '#/jobs?bucket=overdue');
    assert.equal(byLabel['Flagged for review'].n, '2');
    assert.equal(byLabel['Flagged for review'].href, '#/jobs?needs_review=1');
    assert.equal(byLabel['Accepted, needs booking'].href, '#/jobs?bucket=unscheduled&status=accepted');
    assert.equal(byLabel['Completed (14 days)'].n, '9');

    // Nothing may link nowhere: a count the operator cannot act on is the
    // decorative analytics this batch was told not to build.
    for (const t of tiles) assert.ok(t.href && t.href.startsWith('#/'), `${t.label} has no target`);
    await page.close();
  });

  await record('12. Actionable non-zero tiles sort ahead of neutral ones', async () => {
    const page = await openAdmin(browser);
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.stat-grid a.stat .stat__l')].map(n => n.textContent));
    const urgent = ['New requests', 'Reviewed, not converted', 'Overdue on site',
                    'Accepted, needs booking', 'Flagged for review'];
    for (const u of urgent) {
      assert.ok(labels.indexOf(u) < labels.indexOf('Awaiting customer'),
                `${u} should sort ahead of the neutral tiles`);
    }
    await page.close();
  });

  await record('13. A failed dashboard load shows the error and NO counts', async () => {
    const page = await openAdmin(browser, { api: fakeApi({ failSummary: true }) });
    const seen = await page.evaluate(() => ({
      tiles: document.querySelectorAll('.stat-grid a.stat').length,
      text: document.getElementById('view').textContent,
      retry: [...document.querySelectorAll('button')].some(b => b.textContent === 'Retry')
    }));
    assert.equal(seen.tiles, 0, 'a failed load must not render zeroed tiles');
    assert.match(seen.text, /Could not load the dashboard/);
    assert.match(seen.text, /network down/);
    assert.equal(seen.retry, true, 'the operator needs a way to try again');
    await page.close();
  });

  await record('14. A genuinely idle business reads as idle, not as an error', async () => {
    const page = await openAdmin(browser, { api: fakeApi({ summary: ZERO_SUMMARY }) });
    const text = await viewText(page);
    assert.match(text, /Nothing is waiting on you/);
    assert.match(text, /No recent activity recorded yet/);
    assert.ok(!/Could not load/.test(text), 'zero is not a failure');
    await page.close();
  });

  await record('15. Recent activity lists only recorded events, each openable', async () => {
    const page = await openAdmin(browser);
    const seen = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.card')]
        .find(c => c.querySelector('h2')?.textContent === 'Recent activity');
      return {
        text: card.textContent,
        openHrefs: [...card.querySelectorAll('a.btn')].map(a => a.getAttribute('href'))
      };
    });
    assert.match(seen.text, /Quote accepted/);
    assert.match(seen.text, /Request received/);
    assert.ok(seen.openHrefs.includes('#/jobs/job-a'),
              'an activity row with a job must link to that job');
    // The second row has no job_id, so it must not fabricate a link.
    assert.equal(seen.openHrefs.filter(h => h.startsWith('#/jobs/')).length, 1);
    await page.close();
  });

  /* ----------------------------------------------------------- jobs list -- */

  await record('16. Searching sends the text to the server, debounced to one request', async () => {
    const page = await openAdmin(browser, { hash: '/jobs' });
    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="Search jobs"]');
      for (const text of ['Dan', 'Dana', 'Dana W']) {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.waitForTimeout(450);
    const calls = await page.evaluate(() => globalThis.__calls.searchJobs);
    assert.equal(calls.length, 2, `expected the initial load plus one debounced search, got ${calls.length}`);
    assert.equal(calls[1].query, 'Dana W');
    await page.close();
  });

  await record('17. Status, schedule-bucket and review filters are all evaluated server-side', async () => {
    const page = await openAdmin(browser, { hash: '/jobs' });

    const statusCall = await page.evaluate(async () => {
      const sel = [...document.querySelectorAll('select')]
        .find(s => [...s.options].some(o => o.value === 'quote_sent'));
      sel.value = 'quote_sent';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      return globalThis.__calls.searchJobs.at(-1);
    });
    assert.deepEqual(statusCall.statuses, ['quote_sent']);

    const bucketCall = await page.evaluate(async () => {
      const sel = [...document.querySelectorAll('select')]
        .find(s => [...s.options].some(o => o.value === 'overdue'));
      sel.value = 'overdue';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      return globalThis.__calls.searchJobs.at(-1);
    });
    assert.equal(bucketCall.scheduleBucket, 'overdue');
    assert.deepEqual(bucketCall.statuses, ['quote_sent'], 'filters must combine, not replace');

    const reviewCall = await page.evaluate(async () => {
      const box = document.querySelector('.check input[type="checkbox"]');
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      return globalThis.__calls.searchJobs.at(-1);
    });
    assert.equal(reviewCall.needsReview, true);
    await page.close();
  });

  await record('18. Sorting is a server-side parameter, not a client-side re-shuffle', async () => {
    const page = await openAdmin(browser, { hash: '/jobs' });
    const call = await page.evaluate(async () => {
      const sel = [...document.querySelectorAll('select')]
        .find(s => [...s.options].some(o => o.value === 'scheduled_asc'));
      sel.value = 'scheduled_asc';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      return globalThis.__calls.searchJobs.at(-1);
    });
    assert.equal(call.sort, 'scheduled_asc');
    await page.close();
  });

  await record('19. A dashboard deep link pre-applies its filters on the first request', async () => {
    const page = await openAdmin(browser,
      { hash: '/jobs?bucket=overdue&status=accepted&needs_review=1&sort=scheduled_asc' });
    const seen = await page.evaluate(() => ({
      first: globalThis.__calls.searchJobs[0],
      count: globalThis.__calls.searchJobs.length,
      controls: {
        bucket: [...document.querySelectorAll('select')]
          .find(s => [...s.options].some(o => o.value === 'overdue'))?.value,
        review: document.querySelector('.check input[type="checkbox"]')?.checked
      }
    }));
    assert.equal(seen.count, 1, 'a deep link must not load twice');
    assert.equal(seen.first.scheduleBucket, 'overdue');
    assert.deepEqual(seen.first.statuses, ['accepted']);
    assert.equal(seen.first.needsReview, true);
    assert.equal(seen.first.sort, 'scheduled_asc');
    // The controls must agree with what was actually requested, or the
    // operator cannot tell which filter is in force.
    assert.equal(seen.controls.bucket, 'overdue');
    assert.equal(seen.controls.review, true);
    await page.close();
  });

  await record('20. A job row shows its review rollup, and a declined quote is not styled as a win', async () => {
    const page = await openAdmin(browser, { hash: '/jobs' });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('.row-item')].map(r => ({
        text: r.textContent,
        okBadges: [...r.querySelectorAll('.badge--ok')].map(b => b.textContent),
        warnBadges: [...r.querySelectorAll('.badge--warn')].map(b => b.textContent),
        href: r.querySelector('a.btn')?.getAttribute('href')
      })));

    assert.equal(rows.length, 2);
    const dana = rows.find(r => r.text.includes('Dana Whitfield'));
    assert.match(dana.text, /3 flagged for review/);
    assert.match(dana.text, /Quote v2 Declined/);
    assert.equal(dana.okBadges.length, 0, 'a declined quote must not render as badge--ok');
    assert.ok(dana.warnBadges.some(b => /Pricing not approved/.test(b)));
    assert.equal(dana.href, '#/jobs/job-a');
    // Requested services are truncated rather than wrapped forever.
    assert.match(dana.text, /Requested: Gutter Cleaning, Roof Cleaning, Window Cleaning \+1/);

    const sam = rows.find(r => r.text.includes('Sam Oduya'));
    assert.ok(sam.okBadges.some(b => /Accepted/.test(b)), 'accepted is the one ok tone');
    assert.match(sam.text, /Overdue/, 'a past date with no completion is overdue');
    await page.close();
  });

  await record('21. Jobs list distinguishes "no matches" from "no jobs at all"', async () => {
    const filtered = await openAdmin(browser,
      { hash: '/jobs?q=nobody', api: fakeApi({ rows: [] }) });
    const fText = await viewText(filtered);
    assert.match(fText, /No jobs match these filters/);
    assert.ok(await filtered.evaluate(() =>
      [...document.querySelectorAll('button')].some(b => b.textContent === 'Clear filters')));
    await filtered.close();

    const empty = await openAdmin(browser, { hash: '/jobs', api: fakeApi({ rows: [] }) });
    const eText = await viewText(empty);
    assert.match(eText, /No jobs yet\. Convert a request to get started\./);
    assert.ok(!/No jobs match these filters/.test(eText));
    await empty.close();
  });

  await record('22. A failed jobs query shows the reason and a retry, never an empty list', async () => {
    const page = await openAdmin(browser, { hash: '/jobs', api: fakeApi({ failJobs: true }) });
    const seen = await page.evaluate(() => ({
      text: document.getElementById('view').textContent,
      rows: document.querySelectorAll('.row-item').length,
      retry: [...document.querySelectorAll('button')].some(b => b.textContent === 'Retry')
    }));
    assert.match(seen.text, /Could not load jobs/);
    assert.match(seen.text, /network down/);
    assert.equal(seen.rows, 0);
    assert.equal(seen.retry, true);
    // A failure must not masquerade as an empty result set.
    assert.ok(!/No jobs yet/.test(seen.text) && !/No jobs match/.test(seen.text));
    await page.close();
  });

  /* ------------------------------------------------- job page: timeline -- */

  await record('23. The job timeline renders recorded events newest-first, grouped by day', async () => {
    const page = await openJob(browser, detailApi());
    const seen = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.card')]
        .find(c => c.querySelector('h2')?.textContent === 'Activity');
      return {
        badge: card.querySelector('.badge')?.textContent,
        labels: [...card.querySelectorAll('.row-item strong')].map(n => n.textContent),
        calls: globalThis.__calls.jobActivity
      };
    });
    assert.equal(seen.calls, 1, 'the timeline is one query, not nine');
    assert.equal(seen.badge, '5 events');
    assert.deepEqual(seen.labels,
      ['Quote sent to customer', 'Note added', 'Note added', 'Job created', 'Request received']);
    await page.close();
  });

  await record('24. Internal and customer-visible notes are unmistakably different on screen', async () => {
    const page = await openJob(browser, detailApi());
    const notes = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.card')]
        .find(c => c.querySelector('h2')?.textContent === 'Activity');
      return [...card.querySelectorAll('.row-item')]
        .filter(r => r.querySelector('strong')?.textContent === 'Note added')
        .map(r => ({
          text: r.textContent,
          badge: r.querySelector('.badge--warn, .badge--muted')?.textContent,
          border: [...r.querySelectorAll('span[style*="border-left"]')]
            .map(s => getComputedStyle(s).borderLeftColor)[0]
        }));
    });
    assert.equal(notes.length, 2);
    const customer = notes.find(n => /Customer-visible/.test(n.badge));
    const internal = notes.find(n => /Internal/.test(n.badge));
    assert.ok(customer && internal, 'both audiences must be labelled in words, not colour alone');
    assert.match(internal.text, /Access code is 4821/);
    assert.notEqual(customer.border, internal.border,
                    'the two audiences must also differ visually');
    await page.close();
  });

  await record('25. A failed activity query degrades to an error inside the card, not a blank one', async () => {
    const page = await openJob(browser, detailApi({ failActivity: true }));
    const seen = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.card')]
        .find(c => c.querySelector('h2')?.textContent === 'Activity');
      return {
        text: card.textContent,
        retry: [...card.querySelectorAll('button')].some(b => b.textContent === 'Retry')
      };
    });
    assert.match(seen.text, /Could not load activity: activity unavailable/);
    assert.equal(seen.retry, true);
    assert.ok(!/Nothing recorded for this job yet/.test(seen.text),
              'a failure must not read as "nothing happened"');
    await page.close();
  });

  await record('26. An empty timeline says so plainly', async () => {
    const page = await openJob(browser, detailApi({ activity: [] }));
    const text = await page.evaluate(() => [...document.querySelectorAll('.card')]
      .find(c => c.querySelector('h2')?.textContent === 'Activity').textContent);
    assert.match(text, /Nothing recorded for this job yet/);
    assert.match(text, /0 events/);
    await page.close();
  });

  /* -------------------------------------------- job page: review rollup -- */

  await record('27. The review rollup lists every flagged item with its actual reason', async () => {
    const page = await openJob(browser, detailApi({
      sections: [{ id: 'sec-1', name: 'Rear elevation', storeys: '2', access: 'tight',
                   review_required: true, review_reason: 'Needs a ladder stand-off' }]
    }));
    const seen = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.card')]
        .find(c => c.querySelector('h2')?.textContent === 'Needs review');
      return {
        badge: card.querySelector('.badge--warn')?.textContent,
        rows: [...card.querySelectorAll('.row-item')].map(r => r.textContent)
      };
    });
    assert.equal(seen.badge, '3 items', 'two measurements plus one elevation');
    assert.ok(seen.rows.some(r => /Rotten fascia under the gutter/.test(r)));
    assert.ok(seen.rows.some(r => /Needs a ladder stand-off/.test(r)));
    // A flag with no typed reason must say so rather than look unflagged.
    assert.ok(seen.rows.some(r => /No reason given/.test(r)));
    await page.close();
  });

  await record('28. No review card appears when nothing is flagged, and quoting is never blocked', async () => {
    const page = await openJob(browser, detailApi({
      measurements: FLAGGED_MEASUREMENTS.map(m => ({ ...m, review_required: false, review_reason: null }))
    }));
    const seen = await page.evaluate(() => ({
      card: [...document.querySelectorAll('.card')]
        .some(c => c.querySelector('h2')?.textContent === 'Needs review'),
      // The rollup is a visibility feature: the quote card must still be
      // there and usable with flags present or absent.
      quoteCard: [...document.querySelectorAll('.card')]
        .some(c => /Quote/.test(c.querySelector('h2')?.textContent || ''))
    }));
    assert.equal(seen.card, false);
    assert.equal(seen.quoteCard, true);

    const flagged = await openJob(browser, detailApi());
    const stillQuotable = await flagged.evaluate(() => [...document.querySelectorAll('.card')]
      .some(c => /Quote/.test(c.querySelector('h2')?.textContent || '')));
    assert.equal(stillQuotable, true, 'a review flag must not block quoting');
    await flagged.close();
    await page.close();
  });

  /* --------------------------------------------------------------- mobile -- */

  for (const width of [390, 430]) {
    await record(`29. Dashboard has no horizontal overflow at ${width}px`, async () => {
      const page = await openAdmin(browser, { width });
      const o = await overflow(page);
      assert.ok(o.doc <= o.client, `dashboard scrolls horizontally: ${o.doc} > ${o.client}`);
      await page.close();
    });

    await record(`30. Jobs list has no horizontal overflow at ${width}px`, async () => {
      const page = await openAdmin(browser, { hash: '/jobs', width });
      const o = await overflow(page);
      assert.ok(o.doc <= o.client, `jobs list scrolls horizontally: ${o.doc} > ${o.client}`);
      // The jobs list must stay a stack of cards, not a wide table.
      const tables = await page.evaluate(() => document.querySelectorAll('#view table').length);
      assert.equal(tables, 0, 'no desktop table forced onto a phone');
      await page.close();
    });

    await record(`31. Job timeline has no horizontal overflow at ${width}px`, async () => {
      const page = await openJob(browser, detailApi(), width);
      const o = await overflow(page);
      assert.ok(o.doc <= o.client, `job page scrolls horizontally: ${o.doc} > ${o.client}`);
      await page.close();
    });
  }

  await record('32. Desktop dashboard lays its tiles out in more than one column', async () => {
    const page = await openAdmin(browser, { width: 1200 });
    const columns = await page.evaluate(() => {
      const tops = [...document.querySelectorAll('.stat-grid a.stat')]
        .map(a => Math.round(a.getBoundingClientRect().top));
      const first = tops[0];
      return tops.filter(t => t === first).length;
    });
    assert.ok(columns > 1, `tiles stacked into one column at 1200px (${columns})`);
    await page.close();
  });

  await browser.close();
  const failed = results.filter(r => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main();
