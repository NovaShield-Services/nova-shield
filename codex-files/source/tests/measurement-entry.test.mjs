import assert from 'node:assert/strict';
import { BASE, BASE_FAKE_API_PANEL, createRecorder, launchPanelPage, finishAndReport } from './test-harness.mjs';

const { results, record } = createRecorder();
const fakeApi = BASE_FAKE_API_PANEL.replace('export async function updateMeasurement', 'async function unusedUpdateMeasurement') + `
  export async function updateMeasurement(id, patch) {
    const call = { id, patch };
    globalThis.__calls.push(call);
    globalThis.__active++;
    globalThis.__maximum = Math.max(globalThis.__maximum, globalThis.__active);
    return new Promise((resolve, reject) => {
      call.finish = (error) => {
        globalThis.__active--;
        if (error) reject(new Error(error));
        else {
          Object.assign(globalThis.__store.find(row => row.id === id), patch);
          resolve({ id, ...patch });
        }
      };
      if (globalThis.__autoSave) call.finish();
    });
  }
  export async function getSettings() { return {}; }
  export async function createQuoteFromCalculation() {
    globalThis.__quotesBuilt.push(globalThis.__store.map(row => row.quantity));
  }
`;

const { browser, page } = await launchPanelPage({ fakeApi });
page.removeAllListeners('dialog');
page.on('dialog', dialog => dialog.accept());

async function fresh(key = 'generic', unit = 'linear_ft') {
  // Reload isolates pending saves, timers, editor registrations and modules.
  await page.goto(`${BASE}/admin/field.html`);
  await page.evaluate(async ({ key, unit }) => {
    const { createMeasurementsPanel } = await import('/admin/js/views/measurements.js');
    const { createQuotePanel } = await import('/admin/js/views/quote.js');
    globalThis.__store = [{ id: 'm1', service_id: 's1', unit, quantity: 7,
      measurement_modifiers: [], job_measurement_addons: [] }];
    globalThis.__calls = []; globalThis.__active = 0; globalThis.__maximum = 0;
    globalThis.__quotesBuilt = []; globalThis.__autoSave = false;
    globalThis.__refreshes = []; globalThis.__manualRefresh = false;
    const refs = { services: [{ id: 's1', key, unit, name: 'Test service', quotable: true }],
      modifiers: [], sections: [], siteFactors: [], pricingRules: [] };
    if (key === 'winter_deicing_cables') {
      refs.services.push({ id: 's2', key: 'winter_deicing_cables_valley_1st', name: 'Valley',
        parent_key: key, unit: 'each', quotable: true });
      __store.push({ id: 'm2', service_id: 's2', unit: 'each', quantity: 2,
        measurement_modifiers: [], job_measurement_addons: [] });
    }
    const job = { id: 'j1' };
    const panel = createMeasurementsPanel({ job, refs, onChange: reload });
    async function reload() {
      const token = panel.refreshToken();
      const snapshot = structuredClone(globalThis.__store);
      if (globalThis.__manualRefresh) await new Promise(resolve => globalThis.__refreshes.push(resolve));
      if (panel.isCurrent(token)) panel.render({ measurements: snapshot, pricing: [] });
    }
    const quote = createQuotePanel({ job, onChange: reload });
    panel.guardActions(quote.root);
    document.body.append(panel.root, quote.root);
    panel.render({ measurements: structuredClone(globalThis.__store), pricing: [] });
    quote.render({ quotes: [] });
    globalThis.__panel = panel; globalThis.__reload = reload;
    globalThis.__input = panel.root.querySelector('input[type="number"]');
  }, { key, unit });
}

const input = () => page.locator('input[type="number"]').first();
async function waitCalls(count) { await page.waitForFunction(count => globalThis.__calls.length === count, count); }
async function finish(index = 0, error) {
  await page.evaluate(({ index, error }) => globalThis.__calls[index].finish(error), { index, error });
}
async function state() {
  return page.evaluate(() => ({ value: __input.value, same: __input.isConnected,
    focused: document.activeElement === __input, quantity: __store[0]?.quantity,
    calls: __calls.map(({ id, patch }) => ({ id, patch })), maximum: __maximum }));
}

await record('Rapid typing coalesces into one save and keeps the focused input mounted', async () => {
  await fresh();
  await input().fill('1'); await input().fill('12'); await input().fill('123');
  await waitCalls(1); await finish();
  await page.waitForTimeout(30);
  assert.deepEqual(await state(), { value: '123', same: true, focused: true, quantity: 123,
    calls: [{ id: 'm1', patch: { quantity: 123 } }], maximum: 1 });
});

await record('A second edit waits for the first write and persists the latest captured value', async () => {
  await fresh(); await input().fill('1'); await waitCalls(1);
  await input().fill('12'); await input().fill('123');
  await page.waitForTimeout(400);
  assert.equal((await state()).calls.length, 1);
  await finish(); await waitCalls(2);
  assert.equal((await state()).quantity, 1);
  await finish(1);
  assert.equal((await state()).quantity, 123);
  assert.equal((await state()).maximum, 1);
  assert.equal((await state()).value, '123');
});

await record('An older failed write cannot revert a newer edit', async () => {
  await fresh(); await input().fill('10'); await waitCalls(1);
  await input().fill('20'); await finish(0, 'Permission denied');
  await waitCalls(2); await finish(1);
  assert.equal((await state()).value, '20');
  assert.equal((await state()).quantity, 20);
  assert.equal(await page.getByText('Retry quantity save', { exact: true }).isVisible(), false);
});

await record('A failed latest save retains the intended quantity and supports explicit retry', async () => {
  await fresh(); await input().fill('42'); await waitCalls(1); await finish(0, 'Network request failed');
  const retry = page.getByRole('button', { name: 'Retry quantity save', exact: true });
  await retry.waitFor({ state: 'visible' });
  assert.equal((await state()).value, '42'); assert.equal((await state()).quantity, 7);
  await retry.click(); await waitCalls(2); await finish(1);
  await page.waitForFunction(() => __store[0].quantity === 42);
});

await record('Blank input is not silently persisted as zero and blocks navigation until resolved', async () => {
  await fresh(); await input().fill(''); await page.waitForTimeout(400);
  assert.equal((await state()).calls.length, 0);
  assert.equal(await page.evaluate(() => __panel.flush()), false);
  await page.getByRole('button', { name: 'Use saved quantity', exact: true }).click();
  assert.equal(await input().inputValue(), '7');
  assert.equal(await page.evaluate(() => __panel.flush()), true);
  assert.equal((await state()).calls.length, 0);
});

await record('An incomplete exponent remains unsaved', async () => {
  await fresh(); await input().fill(''); await input().pressSequentially('1e');
  await page.waitForTimeout(400);
  assert.equal((await state()).calls.length, 0);
  assert.equal(await page.evaluate(() => __panel.flush()), false);
});

await record('Negative and fractional each quantities are rejected; explicit zero is saved', async () => {
  await fresh('generic', 'each'); await input().fill('-1'); await page.waitForTimeout(400);
  assert.equal((await state()).calls.length, 0);
  await input().fill('1.5'); await page.waitForTimeout(400);
  assert.equal((await state()).calls.length, 0);
  await input().fill('0'); await waitCalls(1); await finish();
  assert.equal((await state()).quantity, 0);
});

await record('Blur flushes the debounce immediately, then allows a fresh panel render', async () => {
  await fresh(); await input().fill('80');
  await input().evaluate(node => node.blur());
  await waitCalls(1); await finish();
  await page.waitForFunction(() => !__input.isConnected);
  assert.equal(await input().inputValue(), '80');
});

await record('An old refresh cannot overwrite an edit made after it started', async () => {
  await fresh();
  await page.evaluate(() => { __manualRefresh = true; void __reload(); });
  await input().fill('60');
  await page.evaluate(() => __refreshes[0]());
  assert.equal((await state()).value, '60'); assert.equal((await state()).same, true);
});

await record('A later refresh wins when responses complete in reverse order', async () => {
  await fresh();
  await page.evaluate(() => {
    __manualRefresh = true; void __reload();
    __store[0].quantity = 90; void __reload();
  });
  await page.evaluate(() => __refreshes[1]());
  assert.equal(await input().inputValue(), '90');
  await page.evaluate(() => __refreshes[0]());
  assert.equal(await input().inputValue(), '90');
});

await record('A refresh started before commit is rejected even if its edit version was current', async () => {
  await fresh(); await input().fill('81'); await waitCalls(1);
  await page.evaluate(() => { __manualRefresh = true; void __reload(); });
  await finish();
  await page.evaluate(() => __refreshes[0]());
  await input().evaluate(node => node.blur());
  await page.waitForFunction(() => __refreshes.length >= 2);
  await page.evaluate(() => __refreshes.at(-1)());
  await page.waitForFunction(() => !__input.isConnected);
  assert.equal(await input().inputValue(), '81');
});

await record('Discarding a failed draft restores the confirmed value without retrying it', async () => {
  await fresh(); await input().fill('42'); await waitCalls(1); await finish(0, 'Permission denied');
  await page.getByRole('button', { name: 'Use saved quantity', exact: true }).click();
  await page.waitForTimeout(40);
  assert.equal(await input().inputValue(), '7');
  assert.equal((await state()).calls.length, 1);
});

await record('Delete waits for the pending quantity before its original handler runs', async () => {
  await fresh(); await input().fill('99');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await waitCalls(1);
  assert.equal(await page.evaluate(() => globalThis.__deleteMeasurementCalls?.length || 0), 0);
  await finish();
  await page.waitForFunction(() => globalThis.__deleteMeasurementCalls?.length === 1);
  assert.equal((await state()).quantity, 99);
});

await record('Build quote waits for the latest quantity and ignores duplicate clicks while saving', async () => {
  await fresh(); await input().fill('55');
  await page.getByRole('button', { name: 'Build quote', exact: true }).click();
  await waitCalls(1);
  await page.getByRole('button', { name: 'Build quote', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => __quotesBuilt), []);
  await finish();
  await page.waitForFunction(() => __quotesBuilt.length === 1);
  assert.deepEqual(await page.evaluate(() => __quotesBuilt), [[55]]);
});

await record('A failed quantity prevents quote creation and leaves the draft recoverable', async () => {
  await fresh(); await input().fill('55');
  await page.getByRole('button', { name: 'Build quote', exact: true }).click();
  await waitCalls(1); await finish(0, 'Permission denied');
  await page.getByRole('button', { name: 'Retry quantity save', exact: true }).waitFor({ state: 'visible' });
  assert.deepEqual(await page.evaluate(() => __quotesBuilt), []);
  assert.equal((await state()).value, '55');
});

await record('Navigation flush waits for pending writes and restores the route for an invalid draft', async () => {
  await fresh(); await input().fill('66');
  await page.evaluate(async () => {
    const { flushMeasurementEdits } = await import('/admin/js/lib/measurement-entry.js');
    __navigationDone = false;
    void flushMeasurementEdits().then(ok => { __navigationDone = ok; });
  });
  await waitCalls(1); assert.equal(await page.evaluate(() => __navigationDone), false);
  await finish(); await page.waitForFunction(() => __navigationDone);
  await input().fill('');
  await page.evaluate(() => history.replaceState(history.state, '', '#/another-job'));
  const ok = await page.evaluate(async () => (await import('/admin/js/lib/measurement-entry.js')).flushMeasurementEdits());
  assert.equal(ok, false); assert.equal(await page.evaluate(() => location.hash), '');
});

for (const key of ['siding', 'permanent_lighting']) {
  await record(`${key} specialized footage uses the same ordered save and preserves focus`, async () => {
    await fresh(key); await input().fill('145'); await waitCalls(1); await finish();
    await page.waitForTimeout(30);
    assert.equal((await state()).quantity, 145);
    assert.equal((await state()).same, true); assert.equal((await state()).focused, true);
  });
}

for (const key of ['windows', 'winter_property_care']) {
  await record(`${key} stepper restores the confirmed count after a failed write`, async () => {
    await fresh(key, 'each');
    const plus = page.getByRole('button', { name: key === 'windows' ? 'More' : 'More visits', exact: true });
    await plus.click(); await waitCalls(1);
    assert.equal(await plus.isDisabled(), true);
    await finish(0, 'Permission denied');
    await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('Permission denied'));
    assert.equal(await plus.isDisabled(), false);
    assert.equal((await page.locator('.section-box').first().innerText()).includes('7'), true);
    assert.equal(await page.evaluate(() => __store[0].quantity), 7);
  });
}

await record('Heating-wire child counts block quote creation while saving and restore failed counts', async () => {
  await fresh('winter_deicing_cables');
  const plus = page.getByRole('button', { name: 'More Valley — 1st floor', exact: true });
  await plus.click(); await waitCalls(1);
  await page.getByRole('button', { name: 'Build quote', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => __quotesBuilt), []);
  await finish(0, 'Permission denied');
  await page.waitForFunction(() => __quotesBuilt.length === 1);
  assert.deepEqual(await page.evaluate(() => __quotesBuilt), [[7, 2]]);
  assert.equal(await plus.isDisabled(), false);
});

const screenApi = fakeApi + `
  const job = { id: 'j1', status: 'new', customers: { name: 'Test Customer' },
    properties: { id: 'p1', address_line1: 'Test address', passport: {} } };
  export async function getJob() { return structuredClone(job); }
  export async function currentUserId() { return 'u1'; }
  export async function listServices() {
    return [{ id: 's1', key: 'generic', name: 'Test service', unit: 'linear_ft', quotable: true }];
  }
  export async function listModifiers() { return []; }
  export async function listSiteFactors() { return []; }
  export async function listInspectionFlags() { return []; }
  export async function listServiceFlagMap() { return []; }
  export async function listPricingRules() { return []; }
  export async function listSections() { return []; }
  export async function listMeasurements() {
    const snapshot = structuredClone(globalThis.__store);
    if (globalThis.__delayReads) await new Promise(resolve => globalThis.__readResolvers.push(resolve));
    return snapshot;
  }
  export async function listJobFlags() { return []; }
  export async function calculatePricing() {
    return [{ service_id: 's1', service_name: 'Test service', amount: globalThis.__store[0].quantity * 10 }];
  }
  export async function listQuotes() { return []; }
  export async function listAttachments() { return []; }
  export async function listNotes() { return []; }
  export async function jobActivity() { return []; }
  export async function searchJobs() { return { rows: [], total: 0, limit: 50, offset: 0 }; }
  export async function listTodaysVisits() { return []; }
  export async function listUpcomingVisits() { return []; }
`;

async function screen(view) {
  await page.route(`${BASE}/admin/js/lib/api.js`, route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: screenApi
  }));
  await page.goto(`${BASE}/admin/field.html`);
  await page.evaluate(async view => {
    __store = [{ id: 'm1', service_id: 's1', unit: 'linear_ft', quantity: 7,
      measurement_modifiers: [], job_measurement_addons: [] }];
    __calls = []; __active = 0; __maximum = 0; __quotesBuilt = []; __autoSave = false;
    __delayReads = false; __readResolvers = [];
    const mount = document.createElement('div'); document.body.append(mount);
    if (view === 'desktop') {
      const { renderJob } = await import('/admin/js/views/job.js');
      await renderJob({ mount }, 'j1');
    } else {
      const { renderVisit } = await import('/admin/js/views/field-workspace.js');
      await renderVisit({ mount, navigate: () => {} }, 'j1');
    }
    __input = mount.querySelector('input[aria-label="Quantity"]');
  }, view);
}

for (const view of ['desktop', 'field']) {
  await record(`${view} screen flushes quantity before its real Build quote handler`, async () => {
    await screen(view);
    const quantity = page.getByRole('spinbutton', { name: 'Quantity', exact: true });
    await quantity.fill('150');
    await page.getByRole('button', { name: 'Build quote', exact: true }).click();
    await waitCalls(1);
    assert.deepEqual(await page.evaluate(() => __quotesBuilt), []);
    await finish(); await page.waitForFunction(() => __quotesBuilt.length === 1);
    assert.deepEqual(await page.evaluate(() => __quotesBuilt), [[150]]);
  });

  await record(`${view} screen rejects reversed reload responses after separate saves`, async () => {
    await screen(view);
    await page.evaluate(() => { __delayReads = true; });
    const quantity = page.getByRole('spinbutton', { name: 'Quantity', exact: true });
    await quantity.fill('100'); await waitCalls(1); await finish();
    await page.waitForFunction(() => __readResolvers.length === 1);
    await quantity.fill('200'); await waitCalls(2); await finish(1);
    await page.waitForFunction(() => __readResolvers.length === 2);
    await page.evaluate(() => __readResolvers[1]());
    await page.evaluate(() => __readResolvers[0]());
    await quantity.evaluate(node => node.blur());
    await page.waitForFunction(() => __readResolvers.length === 3);
    await page.evaluate(() => __readResolvers[2]());
    await page.waitForFunction(() => !__input.isConnected);
    assert.equal(await quantity.inputValue(), '200');
    assert.equal(await page.locator('.money').filter({ hasText: '$2,000' }).count() > 0, true);
  });
}

async function routedScreen(view) {
  await page.route(`${BASE}/admin/js/lib/api.js`, route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: screenApi
  }));
  await page.route(`${BASE}/shared/supabase.js`, route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: `
      export const supabase = { auth: { signOut: async () => { globalThis.__signedOutCount++; } } };
      export async function getSession() { return { session: { user: { id: 'u1' } }, isAdmin: true }; }
    `
  }));
  await page.addInitScript(() => {
    globalThis.__store = [{ id: 'm1', service_id: 's1', unit: 'linear_ft', quantity: 7,
      measurement_modifiers: [], job_measurement_addons: [] }];
    globalThis.__calls = []; globalThis.__active = 0; globalThis.__maximum = 0;
    globalThis.__quotesBuilt = []; globalThis.__autoSave = false;
    globalThis.__signedOutCount = 0; globalThis.__delayReads = false; globalThis.__readResolvers = [];
  });
  const route = view === 'desktop' ? '#/jobs/1111' : '#/visit/1111';
  await page.goto(`${BASE}/admin/${view === 'desktop' ? 'index' : 'field'}.html${route}`);
  // A goto that changes only the hash reuses the document and its prior
  // mock state. Reload explicitly so every router case starts independently.
  await page.reload();
  await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).waitFor();
  return route;
}

for (const view of ['desktop', 'field']) {
  await record(`${view} router waits for the quantity write before changing screens`, async () => {
    await routedScreen(view);
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('78');
    await page.evaluate(view => { location.hash = view === 'desktop' ? '/jobs' : '/'; }, view);
    await waitCalls(1);
    assert.equal(await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).count(), 1);
    await finish();
    await page.waitForFunction(() => !document.querySelector('input[aria-label="Quantity"]'));
    assert.equal(await page.evaluate(() => __store[0].quantity), 78);
    assert.equal(await page.getByText('Something went wrong', { exact: true }).count(), 0);
  });

  await record(`${view} router and sign-out retain invalid input on the current screen`, async () => {
    const route = await routedScreen(view);
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('');
    await page.evaluate(view => { location.hash = view === 'desktop' ? '/jobs' : '/'; }, view);
    await page.waitForFunction(route => location.hash === route, route);
    assert.equal(await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).inputValue(), '');
    await page.locator('#signOut').click();
    assert.equal(await page.evaluate(() => __signedOutCount), 0, 'sign-out must not run');
    assert.equal(await page.evaluate(() => __calls.length), 0, 'blank quantity must not be written');
  });
}

await finishAndReport(browser, results);
