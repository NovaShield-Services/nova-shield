// Visual QA for Batch 4: customers list, customer detail and the Property
// Passport, at 390 / 430 / 1200.
//
//   node tests/screenshot-batch4.mjs      (static server must be on :8743)
//
// Writes PNGs into /tmp/ns-batch4/ and reports any element overhanging the
// viewport, which a screenshot alone hides below the fold.

import { mkdirSync } from 'node:fs';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
import { BASE, FAKE_CAPACITOR_CORE } from './test-harness.mjs';

const { chromium } = pkg;
const OUT = '/tmp/ns-batch4';
mkdirSync(OUT, { recursive: true });

const FAKE_SUPABASE_ADMIN = `
  export const supabase = { auth: { signOut: async () => {} } };
  export async function getSession() { return { session: { user: { id: 'admin-1' } }, isAdmin: true }; }
`;

const CUST_ID = '0000000c-0000-4000-8000-00000000000c';
const PROP_ID = '0000000d-0000-4000-8000-00000000000d';
const JOB_ID  = '0000000a-0000-4000-8000-00000000000a';

/* Deliberately awkward content: a very long name, a long address, a long
   free-text preference, every badge lit. */
const ROWS = [
  { id: CUST_ID, name: 'Konstantinos Papadopoulos-Whitfield',
    email: 'absolutely.enormous.address@averylongdomainname.example.com', phone: '555-0100',
    preferred_contact: 'either', created_at: '2026-01-05T10:00:00Z',
    property_count: 3, job_count: 7, last_job_at: '2026-10-01T10:00:00Z',
    properties: [
      { id: PROP_ID, address_line1: '1487 Northwest Kelowna Mountainview Crescent',
        city: 'Sault Ste. Marie', postal_code: 'P6A 1A1' },
      { id: 'p2', address_line1: '14 Example Street', city: 'Sault Ste. Marie', postal_code: 'P6A 1A1' }
    ] },
  { id: 'c2', name: 'Sam Oduya', email: 'sam@example.com', phone: '555-0200',
    preferred_contact: 'phone', created_at: '2026-02-05T10:00:00Z',
    property_count: 1, job_count: 2, last_job_at: '2026-09-20T10:00:00Z',
    properties: [{ id: 'p3', address_line1: '7 Other Road', city: 'Vernon', postal_code: 'V1T 2T2' }] },
  { id: 'c3', name: 'Priya Raman', email: null, phone: null,
    preferred_contact: null, created_at: '2026-03-05T10:00:00Z',
    property_count: 0, job_count: 0, last_job_at: null, properties: [] }
];

const PASSPORT = {
  siding: { material: 'Vinyl horizontal lap', color: 'Sage green',
            elevations_note: 'Front and left 1-storey, rear and right 2-storey',
            heavy_algae_sides: 'North and rear' },
  roof:   { shingle_type: 'Asphalt architectural', pitch: '6/12', moss_severity: 'Light' },
  access: { water_tap_location: 'Rear left beside the deck stairs',
            electrical_receptacle_location: 'Garage, inside left wall',
            gate_width: '900mm', ladder_access_restrictions: 'Flower bed along the whole east wall' },
  preferences: 'Avoid east flower beds entirely.\nRear gate code 1234.\nDog in the yard on weekdays.',
  checklist: { property_access_confirmed: true, hazards_identified: true }
};

const HISTORY = {
  property: {
    id: PROP_ID, customer_id: CUST_ID,
    address_line1: '1487 Northwest Kelowna Mountainview Crescent', address_line2: 'Rear coach house',
    city: 'Sault Ste. Marie', province: 'ON', postal_code: 'P6A 1A1',
    property_type: 'residential', storeys_note: 'Front 1, rear 2',
    access_note: 'Gate code 1234. Park on the street, driveway is too steep for the trailer.',
    notes: 'Dog on site weekdays. Owner works from home.',
    latitude: 46.5, longitude: -84.3, passport: PASSPORT,
    customer: { id: CUST_ID, name: 'Konstantinos Papadopoulos-Whitfield',
                email: 'absolutely.enormous.address@averylongdomainname.example.com',
                phone: '555-0100', preferred_contact: 'either' }
  },
  jobs: [
    { id: JOB_ID, reference: 'NS-1001', title: 'Gutters', status: 'completed',
      created_at: '2026-09-01T10:00:00Z', scheduled_for: '2026-09-05T15:00:00Z',
      completed_at: '2026-09-05T18:00:00Z',
      services: ['Gutter Cleaning', 'Roof Cleaning', 'Window Cleaning'] },
    { id: 'j2', reference: 'NS-0902', title: 'Siding', status: 'paid',
      created_at: '2026-05-01T10:00:00Z', scheduled_for: null, completed_at: '2026-05-04T18:00:00Z',
      services: ['Siding / Soft Wash'] }
  ],
  quotes: [
    { id: 'q1', job_id: JOB_ID, job_reference: 'NS-1001', version: 2, status: 'declined',
      total: 1840, option_label: null, created_at: '2026-09-02T10:00:00Z',
      sent_at: '2026-09-02T11:00:00Z', responded_at: '2026-09-03T09:00:00Z' },
    { id: 'q2', job_id: JOB_ID, job_reference: 'NS-1001', version: 1, status: 'accepted',
      total: 1200, option_label: 'Essential', created_at: '2026-09-01T10:00:00Z',
      sent_at: null, responded_at: null },
    { id: 'q3', job_id: 'j2', job_reference: 'NS-0902', version: 1, status: 'superseded',
      total: 940, option_label: null, created_at: '2026-05-01T10:00:00Z',
      sent_at: null, responded_at: null }
  ],
  measurements: [
    { id: 'm1', job_id: JOB_ID, job_reference: 'NS-1001', service: 'Gutter Cleaning',
      service_key: 'gutter', label: 'North run', quantity: '40.00', unit: 'linear_ft',
      section: 'Front', review_required: true,
      review_reason: 'Rotten fascia under the gutter on the whole north run',
      created_at: '2026-09-04T10:00:00Z', updated_at: '2026-09-04T10:00:00Z' },
    { id: 'm2', job_id: 'j2', job_reference: 'NS-0902', service: 'Siding / Soft Wash',
      service_key: 'siding', label: null, quantity: '1850.00', unit: 'sq_ft',
      section: 'Rear', review_required: false, review_reason: null,
      created_at: '2026-05-02T10:00:00Z', updated_at: '2026-05-02T10:00:00Z' }
  ],
  inspections: [
    { job_id: JOB_ID, job_reference: 'NS-1001', flag: 'Difficult access',
      warning: 'Allow extra time.', note: 'Ladder will not clear the flower bed on the east wall',
      noted_at: '2026-09-04T11:00:00Z' },
    { job_id: 'j2', job_reference: 'NS-0902', flag: 'Fragile surface',
      warning: null, note: null, noted_at: '2026-05-02T11:00:00Z' }
  ],
  photos: Array.from({ length: 5 }, (_, i) => ({
    id: `ph${i}`, job_id: JOB_ID, job_reference: 'NS-1001',
    request_id: i === 0 ? 'req-1' : null,
    storage_path: `job/${i}.jpg`, kind: i % 2 ? 'before' : 'after',
    caption: i === 1 ? 'Moss build-up along the whole rear run of the gutter' : null,
    elevation_tag: 'Rear', customer_visible: false, created_at: '2026-09-04T12:00:00Z'
  })),
  generated_at: '2026-10-07T12:00:00Z'
};

const API = `
  export async function searchCustomers() {
    const rows = ${JSON.stringify(ROWS)};
    return { total: rows.length, limit: 50, offset: 0, sort: 'name_asc', rows };
  }
  export async function getCustomer(id) {
    return { id, name: 'Konstantinos Papadopoulos-Whitfield',
      email: 'absolutely.enormous.address@averylongdomainname.example.com',
      phone: '555-0100', preferred_contact: 'either',
      notes: 'Prefers weekday mornings. Do not call before 9.',
      properties: [
        { id: '${PROP_ID}', address_line1: '1487 Northwest Kelowna Mountainview Crescent',
          address_line2: 'Rear coach house', city: 'Sault Ste. Marie', province: 'ON',
          postal_code: 'P6A 1A1', property_type: 'residential',
          access_note: 'Gate code 1234. Park on the street.', created_at: '2026-01-05T10:00:00Z' },
        { id: 'p2', address_line1: '14 Example Street', address_line2: null,
          city: 'Sault Ste. Marie', province: 'ON', postal_code: 'P6A 1A1',
          property_type: 'commercial', access_note: null, created_at: '2026-02-05T10:00:00Z' }
      ] };
  }
  export async function listCustomerJobs() {
    return [
      { id: '${JOB_ID}', reference: 'NS-1001', title: 'Gutters', status: 'completed',
        created_at: '2026-09-01T10:00:00Z',
        properties: { id: '${PROP_ID}', address_line1: '1487 Northwest Kelowna Mountainview Crescent', city: 'Sault Ste. Marie' },
        ns_quotes: [{ id: 'q1', version: 2, status: 'declined', total: 1840 }] },
      { id: 'j2', reference: 'NS-0902', title: 'Siding', status: 'paid',
        created_at: '2026-05-01T10:00:00Z',
        properties: { id: 'p2', address_line1: '14 Example Street', city: 'Sault Ste. Marie' },
        ns_quotes: [{ id: 'q3', version: 1, status: 'accepted', total: 940 }] }
    ];
  }
  export async function listCustomerRequests() {
    return [{ id: 'r1', status: 'converted', submitted_at: '2026-08-30T10:00:00Z',
      customer_message: 'Gutters overflowing at the back corner, and the siding has gone green on the north side.',
      preferred_schedule: 'Weekday mornings',
      properties: { id: '${PROP_ID}', address_line1: '1487 Northwest Kelowna Mountainview Crescent', city: 'Sault Ste. Marie' } }];
  }
  export async function updateCustomer(id, patch) { return { id, ...patch }; }
  export async function propertyHistory() { return ${JSON.stringify(HISTORY)}; }
  export async function updateProperty(id, patch) { return { id, ...patch }; }
  export async function signedPhotoUrl() {
    // A real 2x1 grey PNG, so the photo grid lays out like the real thing.
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAE0lEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
  }
  export function attachmentBucket(a) { return a?.request_id ? 'request-photos' : 'job-photos'; }
  export async function dashboardSummary() {
    return { requests_new: 0, requests_reviewed_unconverted: 0, jobs_awaiting_customer: 0,
             jobs_accepted_unscheduled: 0, scheduled_today: 0, scheduled_next_7_days: 0,
             overdue_scheduled: 0, completed_last_14_days: 0, jobs_with_review_flags: 0,
             recent_activity: [], generated_at: '2026-10-07T12:00:00Z' };
  }
  export async function searchJobs() { return { total: 0, rows: [] }; }
  export async function listRequests() { return []; }
  export async function getSettings() { return {}; }
`;

async function shoot(browser, { name, width, hash, cards = [] }) {
  const page = await browser.newPage();
  const mock = (urlPattern, body) =>
    page.route(urlPattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body }));
  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE_ADMIN);
  await mock(`${BASE}/admin/js/lib/api.js`, API);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/admin/index.html#${hash}`);
  await page.waitForTimeout(500);

  const o = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    overhang: [...document.querySelectorAll('#view *')]
      .map((n) => ({ tag: n.tagName, cls: String(n.className).slice(0, 30),
                     right: Math.round(n.getBoundingClientRect().right),
                     text: (n.textContent || '').slice(0, 40) }))
      .filter((n) => n.right > document.documentElement.clientWidth + 1)
      .slice(0, 5),
    // Tap targets that are too small to hit reliably on a phone.
    smallTaps: [...document.querySelectorAll('#view a.btn, #view button')]
      .map((n) => ({ text: (n.textContent || '').slice(0, 24),
                     h: Math.round(n.getBoundingClientRect().height) }))
      .filter((n) => n.h > 0 && n.h < 40)
  }));

  console.log(`${name.padEnd(20)} ${String(width).padStart(4)}px  ` +
    `scrollWidth=${o.doc} client=${o.client}` +
    (o.overhang.length ? `  OVERHANG ${JSON.stringify(o.overhang)}` : '  clean') +
    (o.smallTaps.length ? `  SMALL-TAPS ${JSON.stringify(o.smallTaps)}` : ''));

  await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });

  for (const heading of cards) {
    const handle = await page.evaluateHandle((h) => [...document.querySelectorAll('.card')]
      .find(c => c.querySelector('h2')?.textContent === h) || null, heading);
    const box = handle.asElement();
    if (box) {
      const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await box.screenshot({ path: `${OUT}/${name}-${slug}-${width}.png` });
    }
  }
  await page.close();
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const width of [390, 430, 1200]) {
  await shoot(browser, { name: 'customers', width, hash: '/customers' });
  await shoot(browser, { name: 'customer', width, hash: `/customers/${CUST_ID}` });
  await shoot(browser, { name: 'passport', width, hash: `/properties/${PROP_ID}`,
                         cards: ['Property Passport', 'Measurements', 'Photos'] });
}
await browser.close();
console.log(`\nPNGs in ${OUT}`);
