// Visual QA for Batch 3: the dashboard, the jobs list and the job-page
// activity timeline, at 390px / 430px / 1200px.
//
// Run with the static server from run-regression.sh already up on :8743:
//   node tests/screenshot-batch3.mjs
// Writes PNGs into /tmp/ns-batch3/.

import { mkdirSync } from 'node:fs';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
import { BASE, FAKE_CAPACITOR_CORE } from './test-harness.mjs';

const { chromium } = pkg;
const OUT = '/tmp/ns-batch3';
mkdirSync(OUT, { recursive: true });

const FAKE_SUPABASE_ADMIN = `
  export const supabase = { auth: { signOut: async () => {} } };
  export async function getSession() { return { session: { user: { id: 'admin-1' } }, isAdmin: true }; }
`;

const SUMMARY = {
  requests_new: 3, requests_reviewed_unconverted: 1, jobs_awaiting_customer: 4,
  jobs_accepted_unscheduled: 2, scheduled_today: 1, scheduled_next_7_days: 6,
  overdue_scheduled: 1, completed_last_14_days: 9, jobs_with_review_flags: 2,
  recent_activity: [
    { kind: 'quote_accepted', at: '2026-10-06T18:00:00Z', job_id: 'job-a', customer: 'Dana Whitfield', version: 2 },
    { kind: 'quote_sent', at: '2026-10-06T14:00:00Z', job_id: 'job-b', customer: 'Sam Oduya', version: 1 },
    { kind: 'request_received', at: '2026-10-06T09:00:00Z', job_id: null, customer: 'Priya Raman' },
    { kind: 'note_added', at: '2026-10-05T16:00:00Z', job_id: 'job-a', customer: 'Dana Whitfield', visibility: 'customer' },
    { kind: 'job_completed', at: '2026-10-05T11:00:00Z', job_id: 'job-c', customer: 'Marc Levesque' }
  ],
  generated_at: '2026-10-07T12:00:00Z'
};

// Deliberately awkward content: a very long customer name, a long address,
// four requested services, every badge lit at once.
const JOB_ROWS = [
  { id: 'job-a', reference: 'NS-1001', status: 'estimate_drafted',
    scheduled_for: '2020-01-02T15:00:00Z', completed_at: null,
    customer: { name: 'Konstantinos Papadopoulos-Whitfield', email: 'absolutely.enormous.address@averylongdomainname.example.com', phone: '555-0100' },
    property: { address_line1: '1487 Northwest Kelowna Mountainview Crescent', city: 'Kelowna', postal_code: 'V1V 1V1' },
    measurement_count: 6, review_flags: { measurements: 2, sections: 1, total: 3 },
    requested_services: ['Gutter Cleaning', 'Roof Cleaning', 'Window Cleaning', 'Moss Removal'],
    latest_quote: { id: 'q1', version: 3, status: 'declined', total: 1840 },
    quote_count: 3, has_unapproved_pricing: true },
  { id: 'job-b', reference: 'NS-1002', status: 'accepted',
    scheduled_for: null, completed_at: null,
    customer: { name: 'Sam Oduya', email: 'sam@example.com', phone: '555-0200' },
    property: { address_line1: '7 Other Road', city: 'Vernon', postal_code: 'V1T 2T2' },
    measurement_count: 1, review_flags: { measurements: 0, sections: 0, total: 0 },
    requested_services: ['Gutter Cleaning'],
    latest_quote: { id: 'q2', version: 1, status: 'accepted', total: 620 },
    quote_count: 1, has_unapproved_pricing: false },
  { id: 'job-c', reference: 'NS-1003', status: 'completed',
    scheduled_for: '2026-10-05T09:00:00Z', completed_at: '2026-10-05T16:00:00Z',
    customer: { name: 'Marc Levesque', email: 'marc@example.com', phone: '555-0300' },
    property: { address_line1: '22 Hill Street', city: 'Kamloops', postal_code: 'V2C 3C3' },
    measurement_count: 4, review_flags: { measurements: 0, sections: 0, total: 0 },
    requested_services: [],
    latest_quote: null, quote_count: 0, has_unapproved_pricing: false }
];

const SPA_API = `
  export async function dashboardSummary() { return ${JSON.stringify(SUMMARY)}; }
  export async function searchJobs(args) {
    const rows = ${JSON.stringify(JOB_ROWS)};
    return { total: rows.length, limit: 50, offset: 0, sort: args?.sort || 'updated_desc', rows };
  }
  export async function listRequests() { return []; }
  export async function getSettings() { return {}; }
`;

const JOB_ID = '0000000a-0000-4000-8000-00000000000a';
const SVC = { id: 'svc-gutter', key: 'gutter', name: 'Gutter Cleaning', unit: 'linear_ft',
              category: 'cleaning', quotable: true, active: true, parent_key: null };

const ACTIVITY = [
  { kind: 'request_received', at: '2026-10-01T15:00:00Z', source: 'quote_requests',
    detail: { channel: 'website', preferred_schedule: 'Weekday mornings' } },
  { kind: 'job_created', at: '2026-10-01T15:05:00Z', source: 'ns_jobs',
    actor_id: 'admin-1', detail: { reference: 'NS-1001' } },
  { kind: 'measurement_added', at: '2026-10-01T16:10:00Z', source: 'job_measurements',
    actor_id: 'admin-1', detail: { service: 'Gutter Cleaning', quantity: 40, review_required: true, review_reason: 'Rotten fascia under the gutter' } },
  { kind: 'photo_added', at: '2026-10-01T16:20:00Z', source: 'job_attachments',
    actor_id: 'someone-else', detail: { photo_kind: 'before', elevation_tag: 'Rear', caption: 'Moss build-up along the whole rear run of the gutter' } },
  { kind: 'note_added', at: '2026-10-02T09:00:00Z', source: 'job_notes', actor_id: 'admin-1',
    detail: { visibility: 'internal', body: 'Access code is 4821 — internal only, do not send to the customer.' } },
  { kind: 'note_added', at: '2026-10-02T09:30:00Z', source: 'job_notes', actor_id: 'someone-else',
    detail: { visibility: 'customer', body: 'We will be on site Tuesday morning between 8 and 10.' } },
  { kind: 'quote_created', at: '2026-10-02T10:00:00Z', source: 'ns_quotes', actor_id: 'admin-1',
    detail: { version: 1, total: 1840, current_status: 'superseded' } },
  { kind: 'quote_sent', at: '2026-10-02T11:00:00Z', source: 'ns_quotes', actor_id: 'admin-1',
    detail: { version: 1, total: 1840 } },
  { kind: 'notification_sent', at: '2026-10-02T11:01:00Z', source: 'notifications',
    detail: { subject: 'Your Nova Shield quote is ready', status: 'sent' } },
  { kind: 'quote_declined', at: '2026-10-03T08:00:00Z', source: 'ns_quotes',
    actor_name: 'Dana Whitfield', detail: { version: 1, total: 1840 } }
];

const DETAIL_API = `
  export async function getJob() { return ${JSON.stringify({
    id: JOB_ID, reference: 'NS-1001', status: 'quote_sent', request_id: 'req-1',
    scheduled_for: '2026-11-14T17:30:00Z', completed_at: null,
    customers: { id: 'c1', name: 'Konstantinos Papadopoulos-Whitfield', phone: '555-0100',
                 email: 'absolutely.enormous.address@averylongdomainname.example.com' },
    properties: { id: 'p1', address_line1: '1487 Northwest Kelowna Mountainview Crescent',
                  city: 'Kelowna', postal_code: 'V1V 1V1' },
    quote_requests: { id: 'req-1', submitted_at: '2026-10-01T15:00:00Z',
      customer_message: 'Gutters overflowing at the back corner.',
      preferred_schedule: 'Weekday mornings',
      quote_request_services: [{ other_label: null, services: { id: 'svc-gutter', name: 'Gutter Cleaning', key: 'gutter' } }] }
  })}; }
  export async function listServices() { return [${JSON.stringify(SVC)}]; }
  export async function listModifiers() { return []; }
  export async function listSiteFactors() { return []; }
  export async function listInspectionFlags() { return []; }
  export async function listServiceFlagMap() { return []; }
  export async function listPricingRules() { return [{ service_id: 'svc-gutter', approval_status: 'approved', rate: 2, minimum: 150, services: ${JSON.stringify(SVC)} }]; }
  export async function currentUserId() { return 'admin-1'; }
  export async function listSections() { return [{ id: 'sec-1', name: 'Rear elevation', storeys: '2', access: 'tight', review_required: true, review_reason: 'Needs a ladder stand-off' }]; }
  export async function listMeasurements() { return [
    { id: 'm-1', job_id: '${JOB_ID}', service_id: 'svc-gutter', quantity: 40, unit: 'linear_ft', label: 'North run', review_required: true, review_reason: 'Rotten fascia under the gutter', measurement_modifiers: [], job_measurement_addons: [] },
    { id: 'm-2', job_id: '${JOB_ID}', service_id: 'svc-gutter', quantity: 18, unit: 'linear_ft', label: null, review_required: true, review_reason: null, measurement_modifiers: [], job_measurement_addons: [] }
  ]; }
  export async function listJobFlags() { return []; }
  export async function calculatePricing() { return [{ service_id: 'svc-gutter', service_name: 'Gutter Cleaning', amount: 150, unit_rate: 2, minimum_applied: true }]; }
  export async function listQuotes() { return []; }
  export async function listAttachments() { return []; }
  export async function listNotes() { return []; }
  export async function getSettings() { return {}; }
  export async function jobActivity() { return ${JSON.stringify(ACTIVITY)}; }
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

async function shoot(browser, { name, width, api, hash, detail = false, cards = [] }) {
  const page = await browser.newPage();
  const mock = (urlPattern, body) =>
    page.route(urlPattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body }));
  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE_ADMIN);
  await mock(`${BASE}/admin/js/lib/api.js`, api);
  await page.setViewportSize({ width, height: 900 });

  if (detail) {
    await page.goto(`${BASE}/admin/field.html`);
    await page.evaluate(async (jobId) => {
      const mod = await import('/admin/js/views/job.js');
      await mod.renderJob({ mount: document.getElementById('view'), navigate: () => {} }, jobId);
    }, JOB_ID);
  } else {
    await page.goto(`${BASE}/admin/index.html#${hash}`);
  }
  await page.waitForTimeout(400);

  const o = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    // Any element that pokes out past the viewport, which is what a
    // screenshot alone can hide below the fold.
    overhang: [...document.querySelectorAll('#view *')]
      .map((n) => ({ tag: n.tagName, cls: n.className,
                     right: Math.round(n.getBoundingClientRect().right),
                     text: (n.textContent || '').slice(0, 40) }))
      .filter((n) => n.right > document.documentElement.clientWidth + 1)
      .slice(0, 6)
  }));
  console.log(`${name.padEnd(28)} ${width}px  scrollWidth=${o.doc} client=${o.client}` +
              (o.overhang.length ? `  OVERHANG: ${JSON.stringify(o.overhang)}` : '  clean'));

  await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });

  // The job page is ~7500px tall at 390px, so a full-page PNG is unreadable
  // when scaled down. Crop the cards this batch actually built.
  for (const heading of cards) {
    const handle = await page.evaluateHandle((h) => [...document.querySelectorAll('.card')]
      .find(c => c.querySelector('h2')?.textContent === h) || null, heading);
    const box = handle.asElement();
    if (box) {
      const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await box.screenshot({ path: `${OUT}/${name}-${slug}-${width}.png` });
    } else {
      console.log(`  (no card titled "${heading}" on ${name})`);
    }
  }
  await page.close();
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const width of [390, 430, 1200]) {
  await shoot(browser, { name: 'dashboard', width, api: SPA_API, hash: '/dashboard' });
  await shoot(browser, { name: 'jobs', width, api: SPA_API, hash: '/jobs' });
  await shoot(browser, { name: 'jobs-filtered', width, api: SPA_API,
                         hash: '/jobs?bucket=overdue&needs_review=1' });
  await shoot(browser, { name: 'job', width, api: DETAIL_API, detail: true,
                         cards: ['Activity', 'Needs review'] });
}
await browser.close();
console.log(`\nPNGs in ${OUT}`);
