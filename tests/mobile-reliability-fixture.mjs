import { BASE, FAKE_CAPACITOR_CORE, DEFAULT_FAKE_SUPABASE } from './test-harness.mjs';

const api = `
  export async function getSettings() { return { company: { website: 'https://example.test' } }; }
  export async function updateMeasurement(id, patch) {
    return new Promise((resolve, reject) => {
      const request = { id, patch, finish(error) {
        if (error) reject(new Error(error));
        else { Object.assign(globalThis.__measurement, patch); resolve({ id, ...patch }); }
      }};
      globalThis.__saves.push(request);
      if (globalThis.__saveDelay) setTimeout(() => {
        globalThis.__activationAtSaveFinish = navigator.userActivation.isActive;
        request.finish();
      }, globalThis.__saveDelay);
    });
  }
  export async function listChangeOrders() { return []; }
  export async function createQuoteFromCalculation() { globalThis.__builds++; }
`;

export async function mobileFixture(browser, { width = 1200, height = 900, layout = 'admin' } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const mock = (url, body) => context.route(url, route => route.fulfill({
    status: 200, contentType: 'application/javascript', body
  }));
  await mock('**/shared/vendor/@capacitor/core/dist/index.js', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, DEFAULT_FAKE_SUPABASE);
  await mock(`${BASE}/admin/js/lib/api.js`, api);
  await context.route('**/site/quote.html*', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<h1>Customer quote fixture</h1>'
  }));
  await page.goto(`${BASE}/admin/${layout === 'field' ? 'field' : 'index'}.html`);
  await page.evaluate(async layout => {
    const { createMeasurementEditor } = await import('/admin/js/lib/measurement-entry.js');
    const { createQuotePanel } = await import('/admin/js/views/quote.js');
    const { el, clear } = await import('/shared/dom.js');
    const mount = document.getElementById('view');
    clear(mount);
    __saves = []; __builds = 0; __refreshes = 0; __saveDelay = 0;
    __measurement = { id: 'measurement', quantity: 7, unit: 'linear_ft' };
    const root = el('div', { class: 'card' });
    const price = el('p', { role: 'status', text: 'Backend total: $70', dataset: { testPrice: 'true' } });
    const editor = createMeasurementEditor({ root,
      save: async (...args) => (await import('/admin/js/lib/api.js')).updateMeasurement(...args),
      onChange: () => { __refreshes++; price.textContent = 'Backend total: $' + (__measurement.quantity * 10); }
    });
    root.append(el('h1', { text: 'Measurement entry' }), el('label', { class: 'field' }, [
      el('span', { text: 'Quantity (linear feet)' }),
      editor.quantityInput(structuredClone(__measurement), { 'aria-label': 'Quantity', step: '1' })
    ]), price);
    const action = el('button', { class: 'btn btn--sm', text: 'Inspect saved quantity',
      onClick: () => { __actionQuantity = __measurement.quantity; }
    });
    root.append(action);
    const quote = createQuotePanel({ job: { id: 'job', customers: { name: 'Test Customer',
      email: 'customer@example.test', phone: '5550100' }, properties: { address_line1: 'Test address' } },
      onChange: () => {} });
    editor.guardActions(quote.root, { allowQuoteDelivery: true });
    quote.render({ quotes: [{ id: 'quote-1', kind: 'final', status: 'draft', version: 1,
      subtotal: 70, total: 70, tax_total: 0, quote_line_items: [{ id: 'line',
        description: 'Test service', quantity: 7, unit: 'linear_ft', unit_rate: 10,
        modifier_factor: 1, addons_amount: 0, amount: 70, pricing_approved: true }], quote_adjustments: [] }] });
    mount.append(root, el('div', { class: 'card' }, [quote.root]));
    __editor = editor;
  }, layout);
  return { context, page };
}

export async function finishSave(page, error) {
  await page.waitForFunction(() => __saves.length > 0);
  await page.evaluate(error => __saves.at(-1).finish(error), error);
}

export async function backHandler(page, { beforeExit = true, overlay = false, keyboard = false } = {}) {
  await page.evaluate(async ({ beforeExit, overlay, keyboard }) => {
    const { installBackHandler, pushOverlay } = await import('/admin/js/lib/navigation.js');
    const { flushMeasurementEdits } = await import('/admin/js/lib/measurement-entry.js');
    __exits = 0; __exitQuantity = null; __overlayClosed = 0; __blurred = 0;
    if (overlay) pushOverlay(() => { __overlayClosed++; });
    __back = await installBackHandler({
      currentPath: () => '/dashboard', canGoBack: () => false,
      keyboardOpen: () => keyboard, blurActive: () => { __blurred++; },
      beforeExit: beforeExit ? flushMeasurementEdits : undefined,
      native: () => true,
      loadApp: async () => ({ App: {
        addListener: async () => ({ remove() {} }),
        exitApp: () => { __exits++; __exitQuantity = __measurement.quantity; }
      } })
    });
  }, { beforeExit, overlay, keyboard });
}
