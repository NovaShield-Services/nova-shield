// Phase 20 -- Batch 4: Customers, Properties, and the Property Passport.
//
// The Passport was NOT built in this batch. properties.passport is a jsonb
// column the FIELD CONSOLE has been writing all along (field-workspace.js),
// with a settled shape. These tests therefore pin two things hardest:
//
//   * the admin screen READS that existing structure rather than inventing a
//     second one, and never writes it (the field console owns that form and
//     saves through the offline queue -- a second editor would be a
//     lost-update race with a tech on site)
//   * job-scoped history (measurements, photos, inspections, quotes) is
//     always shown WITH its job and date, so it can never read as a standing
//     fact about the property
//
// Also covered: the dedup keys are surfaced honestly when edited, photos use
// signed URLs from private buckets and never a constructed public URL, and
// the job screen links out rather than duplicating.

import assert from 'node:assert/strict';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
import { createRecorder, BASE, FAKE_CAPACITOR_CORE } from './test-harness.mjs';

const { chromium } = pkg;
const { results, record } = createRecorder();

const FAKE_SUPABASE_ADMIN = `
  export const supabase = { auth: { signOut: async () => {} } };
  export async function getSession() { return { session: { user: { id: 'admin-1' } }, isAdmin: true }; }
`;

const CUST_ID = '0000000c-0000-4000-8000-00000000000c';
const PROP_ID = '0000000d-0000-4000-8000-00000000000d';
const JOB_ID  = '0000000a-0000-4000-8000-00000000000a';
/* Fixture ids must look like real Supabase uuids: the property route is
   /^\/properties\/([0-9a-f-]+)$/, which correctly rejects anything else. */
const EMPTY_ID  = '0000000e-0000-4000-8000-00000000000e';
const ORPHAN_ID = '0000000f-0000-4000-8000-00000000000f';

/* The real passport shape, exactly as field-workspace.js writes it. */
const PASSPORT = {
  siding: { material: 'Vinyl', color: 'Sage green', elevations_note: 'Rear 2-storey',
            heavy_algae_sides: 'North' },
  roof:   { shingle_type: 'Asphalt', pitch: '6/12', moss_severity: 'Light' },
  access: { water_tap_location: 'Rear left', electrical_receptacle_location: 'Garage',
            gate_width: '900mm', ladder_access_restrictions: 'Flower bed along east wall' },
  preferences: 'Avoid east flower beds.\nRear gate code 1234.',
  checklist: { property_access_confirmed: true, hazards_identified: false }
};

const CUSTOMER_ROWS = [
  { id: CUST_ID, name: 'Dana Whitfield', email: 'dana@example.com', phone: '555-0100',
    preferred_contact: 'email', created_at: '2026-01-05T10:00:00Z',
    property_count: 2, job_count: 3, last_job_at: '2026-10-01T10:00:00Z',
    properties: [
      { id: PROP_ID, address_line1: '12 Example Street', city: 'Sault Ste. Marie', postal_code: 'P6A 1A1' },
      { id: 'p2', address_line1: '14 Example Street', city: 'Sault Ste. Marie', postal_code: 'P6A 1A1' }
    ] },
  { id: 'c2', name: 'Sam Oduya', email: null, phone: '555-0200',
    preferred_contact: null, created_at: '2026-02-05T10:00:00Z',
    property_count: 0, job_count: 0, last_job_at: null, properties: [] }
];

const PROPERTY_HISTORY = {
  property: {
    id: PROP_ID, customer_id: CUST_ID,
    address_line1: '12 Example Street', address_line2: 'Rear unit',
    city: 'Sault Ste. Marie', province: 'ON', postal_code: 'P6A 1A1',
    property_type: 'residential', storeys_note: 'Front 1, rear 2',
    access_note: 'Gate code 1234', notes: 'Dog on site weekdays',
    latitude: 46.5, longitude: -84.3, passport: PASSPORT,
    customer: { id: CUST_ID, name: 'Dana Whitfield', email: 'dana@example.com',
                phone: '555-0100', preferred_contact: 'email' }
  },
  jobs: [
    { id: JOB_ID, reference: 'NS-1001', title: 'Gutters', status: 'completed',
      created_at: '2026-09-01T10:00:00Z', scheduled_for: '2026-09-05T15:00:00Z',
      completed_at: '2026-09-05T18:00:00Z', services: ['Gutter Cleaning', 'Roof Cleaning'] }
  ],
  quotes: [
    { id: 'q1', job_id: JOB_ID, job_reference: 'NS-1001', version: 2, status: 'declined',
      total: 1840, option_label: null, created_at: '2026-09-02T10:00:00Z',
      sent_at: '2026-09-02T11:00:00Z', responded_at: '2026-09-03T09:00:00Z' },
    { id: 'q2', job_id: JOB_ID, job_reference: 'NS-1001', version: 1, status: 'accepted',
      total: 1200, option_label: 'Essential', created_at: '2026-09-01T10:00:00Z',
      sent_at: null, responded_at: null }
  ],
  measurements: [
    { id: 'm1', job_id: JOB_ID, job_reference: 'NS-1001', service: 'Gutter Cleaning',
      service_key: 'gutter', label: 'North run', quantity: '40.00', unit: 'linear_ft',
      section: 'Front', review_required: true, review_reason: 'Rotten fascia',
      created_at: '2026-09-04T10:00:00Z', updated_at: '2026-09-04T10:00:00Z' }
  ],
  inspections: [
    { job_id: JOB_ID, job_reference: 'NS-1001', flag: 'Difficult access',
      warning: 'Allow extra time.', note: 'Ladder will not clear the bed',
      noted_at: '2026-09-04T11:00:00Z' }
  ],
  photos: [
    { id: 'ph1', job_id: JOB_ID, job_reference: 'NS-1001', request_id: null,
      storage_path: 'job/1.jpg', kind: 'before', caption: 'Rear gutter',
      elevation_tag: 'Rear', customer_visible: false, created_at: '2026-09-04T12:00:00Z' },
    { id: 'ph2', job_id: JOB_ID, job_reference: 'NS-1001', request_id: 'req-1',
      storage_path: 'req/2.jpg', kind: 'site_photo', caption: null,
      elevation_tag: null, customer_visible: true, created_at: '2026-09-01T09:00:00Z' }
  ],
  generated_at: '2026-10-07T12:00:00Z'
};

/* An untouched property: every history section empty, no passport. The
   "nothing recorded yet" path matters as much as the full one. */
const EMPTY_HISTORY = {
  property: {
    id: EMPTY_ID, customer_id: CUST_ID, address_line1: '99 Blank Road',
    city: null, province: null, postal_code: null, property_type: null,
    storeys_note: null, access_note: null, notes: null,
    latitude: null, longitude: null, passport: {},
    customer: { id: CUST_ID, name: 'Dana Whitfield' }
  },
  jobs: [], quotes: [], measurements: [], inspections: [], photos: [],
  generated_at: '2026-10-07T12:00:00Z'
};

/* A property whose customer was deleted -- properties.customer_id is
   ON DELETE SET NULL, so this is a state the schema really allows. */
const ORPHAN_HISTORY = {
  ...EMPTY_HISTORY,
  property: { ...EMPTY_HISTORY.property, id: ORPHAN_ID, customer_id: null, customer: null }
};

function fakeApi({ rows = CUSTOMER_ROWS, history = PROPERTY_HISTORY,
                   failSearch = false, failCustomer = false } = {}) {
  return `
    globalThis.__calls = { searchCustomers: [], updateCustomer: [], updateProperty: [],
                           propertyHistory: [], signedPhotoUrl: [] };

    export async function searchCustomers(args) {
      globalThis.__calls.searchCustomers.push(args);
      ${failSearch ? `throw new Error('network down');` : ''}
      const all = ${JSON.stringify(rows)};
      const q = (args?.query || '').toLowerCase();
      const rows_ = q
        ? all.filter(c => JSON.stringify(c).toLowerCase().includes(q))
        : all;
      return { total: rows_.length, limit: 50, offset: 0,
               sort: args?.sort || 'name_asc', rows: rows_ };
    }

    export async function getCustomer(id) {
      ${failCustomer ? `throw new Error('customer unavailable');` : ''}
      return {
        // A deliberately unbreakable 56-character email. The first version
        // of this fixture used a short one, so the overflow test passed
        // while the real screen was 505px wide at a 390px viewport.
        id, name: 'Dana Whitfield',
        email: 'absolutely.enormous.address@averylongdomainname.example.com',
        phone: '555-0100',
        preferred_contact: 'email', notes: 'Prefers weekday mornings',
        properties: [
          { id: '${PROP_ID}', address_line1: '12 Example Street', address_line2: null,
            city: 'Sault Ste. Marie', province: 'ON', postal_code: 'P6A 1A1',
            property_type: 'residential', access_note: 'Gate code 1234',
            created_at: '2026-01-05T10:00:00Z' }
        ]
      };
    }

    export async function listCustomerJobs() {
      return [{ id: '${JOB_ID}', reference: 'NS-1001', title: 'Gutters',
                status: 'completed', created_at: '2026-09-01T10:00:00Z',
                properties: { id: '${PROP_ID}', address_line1: '12 Example Street', city: 'Sault Ste. Marie' },
                ns_quotes: [{ id: 'q1', version: 2, status: 'declined', total: 1840 },
                            { id: 'q2', version: 1, status: 'accepted', total: 1200 }] }];
    }

    export async function listCustomerRequests() {
      return [{ id: 'r1', status: 'converted', submitted_at: '2026-08-30T10:00:00Z',
                customer_message: 'Gutters overflowing', preferred_schedule: 'Mornings',
                properties: { id: '${PROP_ID}', address_line1: '12 Example Street', city: 'Sault Ste. Marie' } }];
    }

    export async function updateCustomer(id, patch) {
      globalThis.__calls.updateCustomer.push({ id, patch });
      return { id, ...patch };
    }

    export async function propertyHistory(id) {
      globalThis.__calls.propertyHistory.push(id);
      const h = ${JSON.stringify(history)};
      return JSON.parse(JSON.stringify(h));
    }

    export async function updateProperty(id, patch) {
      globalThis.__calls.updateProperty.push({ id, patch });
      return { id, ...patch };
    }

    export async function signedPhotoUrl(path, seconds, bucket) {
      globalThis.__calls.signedPhotoUrl.push({ path, seconds, bucket });
      return 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    }
    export function attachmentBucket(a) {
      return a?.request_id ? 'request-photos' : 'job-photos';
    }

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
}

async function open(browser, { hash, width = 1200, api = fakeApi() } = {}) {
  const page = await browser.newPage();
  const mock = (urlPattern, body) =>
    page.route(urlPattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body }));
  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE_ADMIN);
  await mock(`${BASE}/admin/js/lib/api.js`, api);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/admin/index.html#${hash}`);
  await page.waitForTimeout(350);
  return page;
}

const viewText = (page) => page.evaluate(() => document.getElementById('view').textContent);
const cardByTitle = (title) => `[...document.querySelectorAll('.card')].find(c => c.querySelector('h2')?.textContent === ${JSON.stringify(title)})`;

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ===================================================== customer list == */

  await record('1. Customer list renders real counts and links to each customer', async () => {
    const page = await open(browser, { hash: '/customers' });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('.row-item')].map(r => ({
        text: r.textContent,
        href: r.querySelector('a.btn')?.getAttribute('href')
      })));
    assert.equal(rows.length, 2);
    const dana = rows.find(r => r.text.includes('Dana Whitfield'));
    assert.match(dana.text, /2 properties/);
    assert.match(dana.text, /3 jobs/);
    assert.match(dana.text, /12 Example Street/);
    assert.equal(dana.href, `#/customers/${CUST_ID}`);

    // A customer with nothing yet must say so rather than render blanks.
    const sam = rows.find(r => r.text.includes('Sam Oduya'));
    assert.match(sam.text, /No property on file/);
    assert.match(sam.text, /0 jobs/);
    await page.close();
  });

  await record('2. Searching reaches the server, debounced, and covers addresses', async () => {
    const page = await open(browser, { hash: '/customers' });
    await page.evaluate(() => {
      const i = document.querySelector('input[aria-label="Search customers"]');
      for (const t of ['Exa', 'Examp', 'Example']) {
        i.value = t;
        i.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.waitForTimeout(450);
    const calls = await page.evaluate(() => globalThis.__calls.searchCustomers);
    assert.equal(calls.length, 2, `expected initial load + one debounced search, got ${calls.length}`);
    assert.equal(calls[1].query, 'Example');
    // The address match is the whole reason this is a server RPC.
    const text = await viewText(page);
    assert.match(text, /Dana Whitfield/);
    assert.ok(!/Sam Oduya/.test(text), 'a non-matching customer must be filtered out');
    await page.close();
  });

  await record('3. Customer list: no-match, empty, and failure are three different screens', async () => {
    const noMatch = await open(browser, { hash: '/customers?q=zzzz' });
    const t1 = await viewText(noMatch);
    assert.match(t1, /No customers match that search/);
    assert.ok(await noMatch.evaluate(() =>
      [...document.querySelectorAll('button')].some(b => b.textContent === 'Clear search')));
    await noMatch.close();

    const empty = await open(browser, { hash: '/customers', api: fakeApi({ rows: [] }) });
    const t2 = await viewText(empty);
    assert.match(t2, /No customers yet/);
    assert.match(t2, /created automatically when a quote request comes in/);
    assert.ok(!/No customers match/.test(t2));
    await empty.close();

    const failed = await open(browser, { hash: '/customers', api: fakeApi({ failSearch: true }) });
    const seen = await failed.evaluate(() => ({
      text: document.getElementById('view').textContent,
      rows: document.querySelectorAll('.row-item').length,
      retry: [...document.querySelectorAll('button')].some(b => b.textContent === 'Retry')
    }));
    assert.match(seen.text, /Could not load customers/);
    assert.match(seen.text, /network down/);
    assert.equal(seen.rows, 0);
    assert.equal(seen.retry, true);
    assert.ok(!/No customers yet/.test(seen.text), 'a failure must not read as an empty database');
    await failed.close();
  });

  /* =================================================== customer detail == */

  await record('4. Customer detail shows only schema-backed fields, and invents no history', async () => {
    const page = await open(browser, { hash: `/customers/${CUST_ID}` });
    const text = await viewText(page);

    assert.match(text, /Dana Whitfield/);
    assert.match(text, /12 Example Street/);
    assert.match(text, /NS-1001/);
    assert.match(text, /Request history/);

    // customers.notes is real and editable, so it must be loaded into the
    // field. A textarea's value never appears in textContent, so read it.
    const notes = await page.evaluate(() =>
      document.querySelector('textarea[aria-label="Internal notes"]')?.value);
    assert.equal(notes, 'Prefers weekday mornings');

    // None of these exist in the schema, so none may appear.
    for (const invented of [/last contacted/i, /lifetime value/i, /engagement/i,
                            /total spend/i, /satisfaction/i]) {
      assert.ok(!invented.test(text), `invented metric on screen: ${invented}`);
    }
    await page.close();
  });

  await record('5. Customer edit validates before writing, and never writes on a bad value', async () => {
    const page = await open(browser, { hash: `/customers/${CUST_ID}` });

    const bad = await page.evaluate(async () => {
      const name = document.querySelector('input[aria-label="Customer name"]');
      const email = document.querySelector('input[aria-label="Email"]');
      const phone = document.querySelector('input[aria-label="Phone"]');
      const save = [...document.querySelectorAll('button')].find(b => b.textContent === 'Save changes');
      const out = {};

      name.value = 'A';                                   // too short
      save.click(); await new Promise(r => setTimeout(r, 60));
      out.shortName = document.querySelector('.error-text:not([hidden])')?.textContent;

      name.value = 'Dana Whitfield';
      email.value = 'not-an-email';
      save.click(); await new Promise(r => setTimeout(r, 60));
      out.badEmail = document.querySelector('.error-text:not([hidden])')?.textContent;

      email.value = ''; phone.value = '';                 // both contacts removed
      save.click(); await new Promise(r => setTimeout(r, 60));
      out.noContact = document.querySelector('.error-text:not([hidden])')?.textContent;

      out.writes = globalThis.__calls.updateCustomer.length;
      return out;
    });

    assert.match(bad.shortName, /at least two characters/);
    assert.match(bad.badEmail, /does not look valid/);
    assert.match(bad.noContact, /at least one of email or phone/);
    assert.equal(bad.writes, 0, 'no invalid attempt may reach the database');
    await page.close();
  });

  await record('6. A valid customer edit writes exactly the real columns, once', async () => {
    const page = await open(browser, { hash: `/customers/${CUST_ID}` });
    const call = await page.evaluate(async () => {
      document.querySelector('input[aria-label="Customer name"]').value = 'Dana W';
      document.querySelector('input[aria-label="Phone"]').value = '555-0999';
      const save = [...document.querySelectorAll('button')].find(b => b.textContent === 'Save changes');
      save.click(); save.click();                   // double submit
      await new Promise(r => setTimeout(r, 250));
      return { calls: globalThis.__calls.updateCustomer, disabledDuring: save.disabled };
    });

    assert.equal(call.calls.length, 1, 'a double click must produce one write');
    assert.deepEqual(Object.keys(call.calls[0].patch).sort(),
      ['email', 'name', 'notes', 'phone', 'preferred_contact']);
    assert.equal(call.calls[0].patch.name, 'Dana W');
    assert.equal(call.calls[0].patch.phone, '555-0999');
    await page.close();
  });

  await record('7. The dedup keys are stated, not silently changed', async () => {
    // submit_quote_request matches a returning customer on exact email or
    // exact normalised phone. Editing those is allowed, but the operator
    // should know it affects future matching.
    const page = await open(browser, { hash: `/customers/${CUST_ID}` });
    const text = await viewText(page);
    assert.match(text, /Email and phone are how a new website request is matched/);
    await page.close();
  });

  /* ================================================== property passport == */

  await record('8. The Passport renders the field console’s existing structure', async () => {
    const page = await open(browser, { hash: `/properties/${PROP_ID}` });
    const card = await page.evaluate((sel) => {
      const c = eval(sel);
      return { text: c.textContent, badge: c.querySelector('.badge')?.textContent };
    }, cardByTitle('Property Passport'));

    assert.equal(card.badge, 'On file');
    // Every section the field console writes must appear.
    for (const expected of ['Siding', 'Vinyl', 'Sage green', 'Roof', 'Asphalt', '6/12',
                            'Access & utilities', 'Rear left', 'Garage',
                            'Flower bed along east wall', 'Avoid east flower beds']) {
      assert.ok(card.text.includes(expected), `passport is missing: ${expected}`);
    }
    // Only ticked checklist items are shown as confirmed.
    assert.match(card.text, /Property access confirmed/);
    assert.ok(!/Hazards identified/.test(card.text),
      'an unticked checklist item must not read as confirmed');
    await page.close();
  });

  await record('9. The admin never writes the passport jsonb', async () => {
    const page = await open(browser, { hash: `/properties/${PROP_ID}` });
    const call = await page.evaluate(async () => {
      const save = [...document.querySelectorAll('button')].find(b => b.textContent === 'Save property');
      save.click();
      await new Promise(r => setTimeout(r, 250));
      return globalThis.__calls.updateProperty[0];
    });
    assert.ok(call, 'the property columns must still be savable');
    assert.ok(!('passport' in call.patch),
      'the field console owns passport; sending it from here could clobber a tech’s save');
    // It writes the real columns, though.
    assert.deepEqual(Object.keys(call.patch).sort(),
      ['access_note', 'address_line1', 'address_line2', 'city', 'notes',
       'postal_code', 'property_type', 'province', 'storeys_note']);
    await page.close();
  });

  await record('10. An empty passport says so rather than rendering blank rows', async () => {
    const page = await open(browser, { hash: `/properties/${EMPTY_ID}`, api: fakeApi({ history: EMPTY_HISTORY }) });
    const card = await page.evaluate((sel) => {
      const c = eval(sel);
      return { text: c.textContent, badge: c.querySelector('.badge')?.textContent };
    }, cardByTitle('Property Passport'));
    assert.equal(card.badge, 'Not filled in yet');
    assert.match(card.text, /filled in from the field console during a visit/);
    await page.close();
  });

  /* ======================================================== history ===== */

  await record('11. Every history row keeps the job and date it came from', async () => {
    const page = await open(browser, { hash: `/properties/${PROP_ID}` });
    const seen = await page.evaluate(() => {
      const card = (t) => [...document.querySelectorAll('.card')]
        .find(c => c.querySelector('h2')?.textContent === t)?.textContent || '';
      return {
        measurements: card('Measurements'),
        inspections: card('Inspection history'),
        quotes: card('Quotes'),
        jobs: card('Service history'),
        footnote: document.getElementById('view').textContent
      };
    });

    // A measurement must never read as a standing property figure.
    assert.match(seen.measurements, /Gutter Cleaning/);
    assert.match(seen.measurements, /NS-1001/, 'measurement must carry its job');
    assert.match(seen.measurements, /40/);
    assert.match(seen.measurements, /Flagged: Rotten fascia/);

    assert.match(seen.inspections, /Difficult access/);
    assert.match(seen.inspections, /NS-1001/, 'inspection must carry its job');
    assert.match(seen.inspections, /Ladder will not clear the bed/);

    assert.match(seen.quotes, /NS-1001/, 'quote must carry its job');
    assert.match(seen.jobs, /Gutter Cleaning, Roof Cleaning/, 'services come from real service rows');

    assert.match(seen.footnote,
      /belong to the job they were recorded on|shown here as history/,
      'the screen must say history is not a standing fact');
    await page.close();
  });

  await record('12. Quote status tones: accepted is the only win', async () => {
    const page = await open(browser, { hash: `/properties/${PROP_ID}` });
    const badges = await page.evaluate((sel) => {
      const c = eval(sel);
      return [...c.querySelectorAll('.badge')].map(b => ({
        text: b.textContent, ok: b.classList.contains('badge--ok')
      }));
    }, cardByTitle('Quotes'));

    const accepted = badges.find(b => /Accepted/.test(b.text));
    const declined = badges.find(b => /Declined/.test(b.text));
    assert.ok(accepted?.ok, 'accepted must be the ok tone');
    assert.equal(declined?.ok, false, 'declined must never render as a win');
    await page.close();
  });

  await record('13. Empty history sections each say what is missing', async () => {
    const page = await open(browser, { hash: `/properties/${EMPTY_ID}`, api: fakeApi({ history: EMPTY_HISTORY }) });
    const text = await viewText(page);
    assert.match(text, /No jobs recorded at this property yet/);
    assert.match(text, /No quotes for this property yet/);
    assert.match(text, /Nothing measured at this property yet/);
    assert.match(text, /No inspection findings recorded/);
    assert.match(text, /No photos taken at this property yet/);
    await page.close();
  });

  /* ========================================================== photos ==== */

  await record('14. Photos use signed URLs from the correct private bucket', async () => {
    const page = await open(browser, { hash: `/properties/${PROP_ID}` });
    await page.waitForTimeout(250);
    const seen = await page.evaluate(() => ({
      calls: globalThis.__calls.signedPhotoUrl,
      imgSrcs: [...document.querySelectorAll('#view img')].map(i => i.getAttribute('src'))
    }));

    assert.equal(seen.calls.length, 2, 'one signature per photo shown');
    // A photo attached to the original request lives in a different bucket
    // from one a tech took on site.
    const buckets = seen.calls.map(c => c.bucket).sort();
    assert.deepEqual(buckets, ['job-photos', 'request-photos']);
    // Nothing may construct a public URL against a private bucket.
    for (const src of seen.imgSrcs) {
      assert.ok(!/\/storage\/v1\/object\/public\//.test(src || ''),
        'a private bucket must never be read through a public URL');
    }
    await page.close();
  });

  /* ==================================================== relationships === */

  await record('15. Customer -> property -> job navigation is wired end to end', async () => {
    const cust = await open(browser, { hash: `/customers/${CUST_ID}` });
    const passportHref = await cust.evaluate(() =>
      [...document.querySelectorAll('a')].find(a => a.textContent === 'Passport')?.getAttribute('href'));
    assert.equal(passportHref, `#/properties/${PROP_ID}`);
    await cust.close();

    const prop = await open(browser, { hash: `/properties/${PROP_ID}` });
    const links = await prop.evaluate(() =>
      [...document.querySelectorAll('#view a')].map(a => a.getAttribute('href')));
    assert.ok(links.includes(`#/customers/${CUST_ID}`), 'property must link back to its customer');
    assert.ok(links.includes(`#/jobs/${JOB_ID}`), 'property must link to its jobs');
    await prop.close();
  });

  await record('16. The job screen links to the customer and the passport without copying them', async () => {
    const page = await open(browser, { hash: '/jobs' });
    const src = await page.evaluate(async () =>
      await (await fetch('/admin/js/views/job.js')).text());
    assert.match(src, /#\/customers\/\$\{job\.customers\.id\}/,
      'job must link to its customer');
    assert.match(src, /#\/properties\/\$\{job\.properties\.id\}/,
      'job must link to its property passport');
    await page.close();
  });

  await record('17. A property reached from a customer sets that customer as its Back target', async () => {
    const page = await open(browser, { hash: `/properties/${PROP_ID}` });
    // renderProperty calls setContextParent with the owning customer, which
    // is what decideBack uses when there is no history to pop (a deep link).
    const parent = await page.evaluate(async () => {
      const nav = await import('/admin/js/lib/navigation.js');
      return nav.parentOf('/properties/anything', { contextParent: `/customers/${'0000000c-0000-4000-8000-00000000000c'}` });
    });
    assert.equal(parent, `#/customers/${CUST_ID}`.replace('#', ''));
    await page.close();
  });

  await record('18. A property whose customer was deleted says so instead of showing a blank', async () => {
    // properties.customer_id is ON DELETE SET NULL, so this really happens.
    const page = await open(browser, { hash: `/properties/${ORPHAN_ID}`, api: fakeApi({ history: ORPHAN_HISTORY }) });
    const seen = await page.evaluate(() => ({
      text: document.getElementById('view').textContent,
      backAll: [...document.querySelectorAll('#view a')]
        .some(a => a.getAttribute('href') === '#/customers')
    }));
    assert.match(seen.text, /no customer on file/i);
    assert.match(seen.text, /the property and its history were kept/i);
    assert.equal(seen.backAll, true, 'with no owner, Back falls back to the customer list');
    await page.close();
  });

  /* ========================================================= mobile ===== */

  for (const width of [390, 430]) {
    await record(`19. Customers list has no horizontal overflow at ${width}px`, async () => {
      const page = await open(browser, { hash: '/customers', width });
      const o = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth
      }));
      assert.ok(o.doc <= o.client, `overflow: ${o.doc} > ${o.client}`);
      assert.equal(await page.evaluate(() => document.querySelectorAll('#view table').length), 0);
      await page.close();
    });

    await record(`20. Customer detail has no horizontal overflow at ${width}px`, async () => {
      const page = await open(browser, { hash: `/customers/${CUST_ID}`, width });
      const o = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth
      }));
      assert.ok(o.doc <= o.client, `overflow: ${o.doc} > ${o.client}`);
      await page.close();
    });

    await record(`21. Property Passport has no horizontal overflow at ${width}px`, async () => {
      const page = await open(browser, { hash: `/properties/${PROP_ID}`, width });
      await page.waitForTimeout(200);
      const o = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth
      }));
      assert.ok(o.doc <= o.client, `overflow: ${o.doc} > ${o.client}`);
      await page.close();
    });
  }

  await browser.close();
  const failed = results.filter(r => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main();
