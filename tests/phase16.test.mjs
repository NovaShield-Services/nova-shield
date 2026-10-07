// Phase 16 -- production-readiness Batch 1 regressions.
//
// These lock shut defects found in the Phase 0 admin audit that had no test
// coverage at all. Three of them are layout defects measured in a real
// browser at real phone widths, which nothing in this suite previously
// asserted: a hamburger menu that did nothing below the fold, a field
// topbar that gave the page a horizontal scroll exactly when offline, and a
// long customer email that widened the job screen. The rest cover the
// save-guard and the offline outbox's re-entrancy.

import assert from 'node:assert/strict';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
import { createRecorder, BASE, FAKE_CAPACITOR_CORE } from './test-harness.mjs';

const { chromium } = pkg;
const { results, record } = createRecorder();

/* An authorised admin session, so index.html renders its chrome (topbar +
   nav) instead of the login screen. */
const FAKE_SUPABASE_ADMIN = `
  export const supabase = { auth: { signOut: async () => {} } };
  export async function getSession() { return { session: { user: { id: 'u1' } }, isAdmin: true }; }
`;

/* Enough rows that the dashboard is taller than a phone viewport -- the
   hamburger defect only appeared once the page could scroll. */
const MANY_REQUESTS = Array.from({ length: 14 }, (_, i) => ({
  id: `req-${i}`, status: 'new', submitted_at: '2026-10-01T12:00:00Z',
  customer_message: 'Quite a long message so the card has real height to it.',
  customers: { name: `Customer ${i}`, email: 'someone@example.com', phone: '555-0100' },
  properties: { address_line1: `${i} Example Street`, city: 'Kelowna', postal_code: 'V1V 1V1' },
  quote_request_services: [{ other_label: null, services: { name: 'Gutter Cleaning', key: 'gutter' } }]
}));

const FAKE_API_DASHBOARD = `
  export async function dashboardCounts() {
    return { newRequests: 14, jobsByStatus: { reviewing: 3, quote_sent: 2, accepted: 1 }, totalJobs: 6 };
  }
  export async function listRequests() { return ${JSON.stringify(MANY_REQUESTS)}; }
  export async function listJobs() { return []; }
  export async function getSettings() { return {}; }
`;

async function openAdmin(page, width) {
  const mock = (urlPattern, body) =>
    page.route(urlPattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body }));
  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE_ADMIN);
  await mock(`${BASE}/admin/js/lib/api.js`, FAKE_API_DASHBOARD);
  await page.setViewportSize({ width, height: 780 });
  await page.goto(`${BASE}/admin/index.html#/dashboard`);
  await page.waitForTimeout(250);
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ------------------------------------------------- mobile nav drawer -- */

  await record('1. Mobile nav drawer stays on screen when the page is scrolled', async () => {
    const page = await browser.newPage();
    await openAdmin(page, 390);

    // Scroll well past the fold, then open the drawer -- the exact sequence
    // that used to render it at its document position, ~1700px above the
    // viewport, so the tap appeared to do nothing.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(80);
    await page.evaluate(() => document.getElementById('navToggle').click());
    await page.waitForTimeout(80);

    const seen = await page.evaluate(() => {
      const nav = document.getElementById('nav');
      const r = nav.getBoundingClientRect();
      return {
        position: getComputedStyle(nav).position,
        open: nav.classList.contains('is-open'),
        top: Math.round(r.top),
        withinViewport: r.top >= 0 && r.top < window.innerHeight && r.height > 0
      };
    });

    assert.equal(seen.open, true, 'drawer should be open');
    assert.equal(seen.position, 'sticky', 'mobile drawer must be sticky, not static');
    assert.equal(seen.withinViewport, true, `drawer off screen at top=${seen.top}`);
    await page.close();
  });

  await record('2. Desktop nav is still a static horizontal bar, not a floating drawer', async () => {
    const page = await browser.newPage();
    await openAdmin(page, 1200);
    await page.evaluate(() => document.getElementById('nav').classList.add('is-open'));
    const position = await page.evaluate(() => getComputedStyle(document.getElementById('nav')).position);
    assert.equal(position, 'static', 'desktop nav must not inherit the mobile sticky drawer');
    await page.close();
  });

  /* ------------------------------------------------- horizontal overflow -- */

  for (const width of [390, 430]) {
    await record(`3. Admin dashboard has no horizontal overflow at ${width}px`, async () => {
      const page = await browser.newPage();
      await openAdmin(page, width);
      const o = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth
      }));
      assert.ok(o.doc <= o.client, `page scrolls horizontally: ${o.doc} > ${o.client}`);
      await page.close();
    });
  }

  await record('4. A long unbreakable customer email does not widen the page', async () => {
    const page = await browser.newPage();
    await openAdmin(page, 390);
    // The real shape of the defect: a .field > p holding a 49-char address
    // inside a grid, exactly as job.js renders the contact card.
    const o = await page.evaluate(() => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<div class="grid grid--3">' +
        '<div class="field"><span>Email</span><p>' +
        'absolutely.enormous.customer.address@averylongdomainname.example.com' +
        '</p></div></div>';
      document.getElementById('view').append(card);
      return { doc: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
    });
    assert.ok(o.doc <= o.client, `long email widened the page: ${o.doc} > ${o.client}`);
    await page.close();
  });

  for (const width of [390, 430]) {
    await record(`5. Field console topbar does not overflow at ${width}px with a queue badge`, async () => {
      const page = await browser.newPage();
      const mock = (urlPattern, body) =>
        page.route(urlPattern, (route) =>
          route.fulfill({ status: 200, contentType: 'application/javascript', body }));
      await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
      await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE_ADMIN);
      await mock(`${BASE}/admin/js/lib/api.js`, `export async function listTodaysVisits() { return []; }`);
      await page.setViewportSize({ width, height: 780 });
      await page.goto(`${BASE}/admin/field.html`);
      await page.waitForTimeout(200);

      // Worst case: the longest badge text plus a visible Sync Now button.
      const o = await page.evaluate(() => {
        const badge = document.getElementById('syncBadge');
        badge.textContent = 'Sync failed — 11 saved here';
        document.getElementById('syncNow').hidden = false;
        return { doc: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
      });
      assert.ok(o.doc <= o.client, `field topbar overflowed: ${o.doc} > ${o.client}`);
      await page.close();
    });
  }

  await record('6. Toast is not capped at half the viewport width', async () => {
    const page = await browser.newPage();
    await openAdmin(page, 390);
    const w = await page.evaluate(() => {
      const t = document.getElementById('toast');
      t.hidden = false;
      t.className = 'toast';
      t.textContent = 'No connection — that change was not saved. Try again with signal.';
      return t.getBoundingClientRect().width;
    });
    // The old shrink-to-fit bug pinned this to exactly 195px at 390px wide.
    assert.ok(w > 240, `toast only ${Math.round(w)}px wide at 390px viewport`);
    await page.close();
  });

  /* ------------------------------------------------------ attachment bucket -- */

  await record('7. attachmentBucket() routes customer uploads and field photos to different buckets', async () => {
    const page = await browser.newPage();
    // api.js is imported unmocked here: attachmentBucket is a pure function
    // and the point is to assert the real one.
    await page.route('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_CAPACITOR_CORE }));
    await page.route(`${BASE}/shared/supabase.js`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SUPABASE_ADMIN }));
    await page.goto(`${BASE}/admin/field.html`);
    const got = await page.evaluate(async () => {
      const api = await import('/admin/js/lib/api.js');
      return {
        customer: api.attachmentBucket({ request_id: 'r-1', job_id: 'j-1' }),
        field: api.attachmentBucket({ request_id: null, job_id: 'j-1' }),
        missing: api.attachmentBucket(null)
      };
    });
    assert.equal(got.customer, 'request-photos');
    assert.equal(got.field, 'job-photos', 'field photos used to be signed against the wrong bucket');
    assert.equal(got.missing, 'job-photos');
    await page.close();
  });

  /* -------------------------------------------------------------- trySave -- */

  await record('8. trySave() reverts the control and reports the reason when a write fails', async () => {
    const page = await browser.newPage();
    await page.route('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_CAPACITOR_CORE }));
    await page.route(`${BASE}/shared/supabase.js`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SUPABASE_ADMIN }));
    await page.goto(`${BASE}/admin/field.html`);

    const got = await page.evaluate(async () => {
      const { trySave, describeWriteError } = await import('/admin/js/lib/save.js');
      const input = document.createElement('input');
      input.value = 'new value';
      let afterRan = false;

      const ok = await trySave(
        async () => { throw new Error('new row violates row-level security policy'); },
        { revert: () => { input.value = 'stored value'; }, success: 'Saved', after: () => { afterRan = true; } }
      );

      const toastNode = document.getElementById('toast');
      return {
        ok, afterRan, value: input.value,
        toastText: toastNode.textContent, toastClass: toastNode.className,
        offlineMessage: describeWriteError(new Error('Failed to fetch')),
        realMessage: describeWriteError(new Error('duplicate key value'))
      };
    });

    assert.equal(got.ok, false);
    assert.equal(got.value, 'stored value', 'control must not keep a value the database rejected');
    assert.equal(got.afterRan, false, 'a failed write must not trigger the refresh');
    assert.match(got.toastText, /row-level security/);
    assert.match(got.toastClass, /toast--error/);
    assert.match(got.offlineMessage, /No connection/);
    assert.match(got.realMessage, /duplicate key value/);
    await page.close();
  });

  await record('9. trySave() reports a refresh failure distinctly from a write failure', async () => {
    const page = await browser.newPage();
    await page.route('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_CAPACITOR_CORE }));
    await page.route(`${BASE}/shared/supabase.js`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SUPABASE_ADMIN }));
    await page.goto(`${BASE}/admin/field.html`);

    const got = await page.evaluate(async () => {
      const { trySave } = await import('/admin/js/lib/save.js');
      let reverted = false;
      const ok = await trySave(
        async () => {},                                  // the write lands
        { revert: () => { reverted = true; }, after: async () => { throw new Error('reload blew up'); } }
      );
      return { ok, reverted, toastText: document.getElementById('toast').textContent };
    });

    assert.equal(got.ok, true, 'the write did land, so trySave should report success');
    assert.equal(got.reverted, false, 'a refresh failure must not revert a saved value');
    assert.match(got.toastText, /Saved, but the screen could not refresh/);
    await page.close();
  });

  /* ------------------------------------------------- outbox re-entrancy -- */

  await record('10. Concurrent flush() calls replay each queued item exactly once', async () => {
    const page = await browser.newPage();
    await page.route('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_CAPACITOR_CORE }));
    await page.route(`${BASE}/shared/supabase.js`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SUPABASE_ADMIN }));
    // A deliberately slow handler widens the window two overlapping flushes
    // used to both read the same head record in.
    await page.route(`${BASE}/admin/js/lib/api.js`, (r) =>
      r.fulfill({
        status: 200, contentType: 'application/javascript',
        body: `
          globalThis.__updatePropertyCalls = [];
          export async function updateProperty(id, patch) {
            globalThis.__updatePropertyCalls.push({ id, patch });
            await new Promise((res) => setTimeout(res, 120));
            return { id, ...patch };
          }
          export async function createMeasurement() { return {}; }
          export async function uploadJobPhoto() { return {}; }
          export async function uploadSignature() { return 'p'; }
          export async function saveQuoteSignature() { return {}; }
          export async function listTodaysVisits() { return []; }
        `
      }));
    await page.goto(`${BASE}/admin/field.html`);
    await page.waitForTimeout(150);

    const calls = await page.evaluate(async () => {
      const q = await import('/admin/js/lib/offline-queue.js');
      // Queue two writes while "offline", then replay with two concurrent
      // flushes -- the shape of tapping Sync Now while the 'online'
      // auto-flush is already running.
      const online = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      await q.callOrQueue('updateProperty', { id: 'p-1', patch: { passport: { a: 1 } } }, 'Passport');
      await q.callOrQueue('updateProperty', { id: 'p-2', patch: { passport: { b: 2 } } }, 'Passport');
      Object.defineProperty(navigator, 'onLine', online || { configurable: true, get: () => true });

      globalThis.__updatePropertyCalls = [];
      await Promise.all([q.flush(), q.flush(), q.flush()]);
      return {
        count: globalThis.__updatePropertyCalls.length,
        ids: globalThis.__updatePropertyCalls.map((c) => c.id),
        remaining: await q.count()
      };
    });

    assert.equal(calls.count, 2, `each queued write must run once, saw ${calls.count}: ${calls.ids}`);
    assert.deepEqual(calls.ids, ['p-1', 'p-2'], 'order must be preserved');
    assert.equal(calls.remaining, 0, 'queue should be empty after a successful flush');
    await page.close();
  });

  await record('11. syncState() distinguishes pending sync from a failed sync', async () => {
    const page = await browser.newPage();
    await page.route('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_CAPACITOR_CORE }));
    await page.route(`${BASE}/shared/supabase.js`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SUPABASE_ADMIN }));
    await page.route(`${BASE}/admin/js/lib/api.js`, (r) =>
      r.fulfill({
        status: 200, contentType: 'application/javascript',
        body: `
          export async function updateProperty() { throw new Error('permission denied for table properties'); }
          export async function createMeasurement() { return {}; }
          export async function uploadJobPhoto() { return {}; }
          export async function uploadSignature() { return 'p'; }
          export async function saveQuoteSignature() { return {}; }
          export async function listTodaysVisits() { return []; }
        `
      }));
    await page.goto(`${BASE}/admin/field.html`);
    await page.waitForTimeout(150);

    const got = await page.evaluate(async () => {
      const q = await import('/admin/js/lib/offline-queue.js');
      const online = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      await q.callOrQueue('updateProperty', { id: 'p-9', patch: { passport: {} } }, 'Passport save');
      Object.defineProperty(navigator, 'onLine', online || { configurable: true, get: () => true });

      const before = q.syncState();
      await q.flush();                       // fails: handler throws a real error
      const after = q.syncState();
      const items = await q.pending();
      return { before, after, labels: items.map((i) => i.label) };
    });

    assert.equal(got.before.lastError, null, 'a queued-but-not-yet-tried write is pending, not failed');
    assert.ok(got.before.count >= 1);
    assert.match(got.after.lastError || '', /permission denied/, 'a failed replay must be visible in sync state');
    assert.ok(got.after.count >= 1, 'the item stays queued after a failed replay');
    assert.deepEqual(got.labels, ['Passport save'], 'pending() must name what is stuck');
    await page.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
