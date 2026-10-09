import assert from 'node:assert/strict';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
import { createRecorder, finishAndReport } from './test-harness.mjs';
import { mobileFixture, finishSave, backHandler } from './mobile-reliability-fixture.mjs';

const { results, record } = createRecorder();
// Playwright disables popup blocking by default. Remove that bypass so the
// delayed gesture tests exercise Chromium's normal policy, not a test shortcut.
const browser = await pkg.chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  ignoreDefaultArgs: ['--disable-popup-blocking'] });
console.log('Browser:', browser.version());

for (const name of ['Preview Quote', 'Download PDF']) {
  await record(`${name}: pending edits do not delay the original activation`, async () => {
    const { context, page } = await mobileFixture(browser);
    try {
      const popups = [];
      page.on('popup', popup => popups.push(popup));
      await page.evaluate(() => { __saveDelay = 6100; });
      await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
      await page.getByRole('link', { name, exact: true }).click();
      await page.waitForTimeout(200);
      const openedBeforeSave = popups.length;
      await page.waitForTimeout(6500);
      assert.equal(await page.evaluate(() => __activationAtSaveFinish), false,
        'control: activation must actually expire before the save completes');
      console.log(name, 'popups before/after save:', openedBeforeSave, popups.length);
      assert.equal(openedBeforeSave, 1, 'read-only quote navigation must use the original click');
      assert.equal(popups.length, 1, 'one action must open exactly one quote');
    } finally { await context.close(); }
  });
}

for (const name of ['Copy Link', 'Copy SMS Text']) {
  await record(`${name}: copying the existing quote keeps user activation`, async () => {
    const { context, page } = await mobileFixture(browser);
    try {
      // Record the genuine browser activation at the clipboard boundary.
      // This double models gesture-requiring WebViews; it is not a claim
      // about real WebView or Chromium clipboard permissions.
      await page.evaluate(() => {
        __saveDelay = 6100;
        __clipboard = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          writeText: async text => {
            __clipboard.push({ text, active: navigator.userActivation.isActive });
            if (!navigator.userActivation.isActive) throw new Error('Activation required');
          }
        } });
        document.execCommand = () => false;
      });
      await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(6700);
      const calls = await page.evaluate(() => __clipboard);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].active, true, 'do not replay clipboard controls after an async save');
      assert.match(calls[0].text, /quote.html\?id=quote-1/);
    } finally { await context.close(); }
  });
}

await record('Copy Link uses the real Chromium clipboard without waiting for a quantity save', async () => {
  const { context, page } = await mobileFixture(browser);
  try {
    await page.evaluate(() => {
      __saveDelay = 6100;
      __realClipboard = [];
      const original = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async text => {
        const result = { active: navigator.userActivation.isActive };
        try { await original(text); result.success = true; }
        catch (error) { result.error = error.name; throw error; }
        finally { __realClipboard.push(result); }
      };
    });
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
    await page.getByRole('button', { name: 'Copy Link', exact: true }).click();
    await page.waitForTimeout(6700);
    const calls = await page.evaluate(() => __realClipboard);
    console.log('Real Chromium clipboard:', JSON.stringify(calls));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].active, true);
    assert.equal(calls[0].success, true);
  } finally { await context.close(); }
});

await record('A guarded successful save refreshes backend pricing even if the action does not reload', async () => {
  const { context, page } = await mobileFixture(browser);
  try {
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
    await page.getByRole('button', { name: 'Inspect saved quantity', exact: true }).click();
    await finishSave(page);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => __actionQuantity), 9);
    assert.equal(await page.locator('[data-test-price]').innerText(), 'Backend total: $90');
  } finally { await context.close(); }
});

await record('Quote creation still waits for pending quantities', async () => {
  const { context, page } = await mobileFixture(browser);
  try {
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
    await page.getByRole('button', { name: 'New version', exact: true }).click();
    await page.waitForFunction(() => __saves.length === 1);
    assert.equal(await page.evaluate(() => __builds), 0);
    await finishSave(page);
    await page.waitForFunction(() => __builds === 1);
    assert.equal(await page.evaluate(() => __measurement.quantity), 9);
  } finally { await context.close(); }
});

await record('Same-tab links still wait for quantities, even inside the quote panel', async () => {
  const { context, page } = await mobileFixture(browser);
  try {
    await page.evaluate(() => {
      const host = document.querySelector('#view > .card:last-child > div');
      const link = document.createElement('a');
      link.href = '#/dashboard'; link.textContent = 'Same-tab destination';
      __navigations = 0;
      link.addEventListener('click', event => { event.preventDefault(); __navigations++; });
      host.append(link);
    });
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
    await page.getByRole('link', { name: 'Same-tab destination' }).click();
    await page.waitForFunction(() => __saves.length === 1);
    assert.equal(await page.evaluate(() => __navigations), 0);
    await finishSave(page);
    await page.waitForFunction(() => __navigations === 1);
  } finally { await context.close(); }
});

await record('Offline navigation offers a deliberate discard-and-leave choice', async () => {
  const { context, page } = await mobileFixture(browser);
  try {
    let prompted = false;
    page.on('dialog', async dialog => { prompted = true; await dialog.accept(); });
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
    await page.evaluate(async () => {
      const { flushMeasurementEdits } = await import('/admin/js/lib/measurement-entry.js');
      __leaving = flushMeasurementEdits();
    });
    await finishSave(page, 'Failed to fetch');
    assert.equal(await page.evaluate(() => __leaving), true, 'explicit discard should allow leaving');
    assert.equal(prompted, true, 'never discard without asking');
    assert.equal(await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).inputValue(), '7');
  } finally { await context.close(); }
});

await record('Cancelling offline discard keeps the draft and allows retry after reconnecting', async () => {
  const { context, page } = await mobileFixture(browser);
  try {
    let prompted = false;
    page.on('dialog', async dialog => { prompted = true; await dialog.dismiss(); });
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
    await page.evaluate(async () => {
      const { flushMeasurementEdits } = await import('/admin/js/lib/measurement-entry.js');
      __leaving = flushMeasurementEdits();
    });
    await finishSave(page, 'Failed to fetch');
    assert.equal(await page.evaluate(() => __leaving), false);
    assert.equal(prompted, true);
    assert.equal(await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).inputValue(), '9');
    await page.getByRole('button', { name: 'Retry quantity save', exact: true }).click();
    await page.waitForFunction(() => __saves.length === 2);
    await finishSave(page);
    await page.waitForFunction(() => !__editor.pending());
    assert.equal(await page.evaluate(() => __measurement.quantity), 9);
  } finally { await context.close(); }
});

await record('A permission failure never offers the offline discard shortcut', async () => {
  const { context, page } = await mobileFixture(browser);
  try {
    let prompted = false;
    page.on('dialog', async dialog => { prompted = true; await dialog.dismiss(); });
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
    await page.evaluate(async () => {
      const { flushMeasurementEdits } = await import('/admin/js/lib/measurement-entry.js');
      __leaving = flushMeasurementEdits();
    });
    await finishSave(page, 'Permission denied');
    assert.equal(await page.evaluate(() => __leaving), false);
    assert.equal(prompted, false);
    assert.equal(await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).inputValue(), '9');
  } finally { await context.close(); }
});

await record('Android root Back waits for the save instead of exiting immediately', async () => {
  const { context, page } = await mobileFixture(browser);
  try {
    await backHandler(page);
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
    await page.evaluate(() => { void __back.handler(); });
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => __exits), 0, 'the native exit must wait');
    await finishSave(page);
    await page.waitForFunction(() => __exits === 1);
    assert.equal(await page.evaluate(() => __exitQuantity), 9);
  } finally { await context.close(); }
});

await record('Repeated Android Back presses share one save/exit attempt', async () => {
  const { context, page } = await mobileFixture(browser);
  try {
    await backHandler(page);
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
    await page.evaluate(() => { void __back.handler(); void __back.handler(); });
    await finishSave(page);
    await page.waitForFunction(() => __exits > 0);
    assert.equal(await page.evaluate(() => __exits), 1);
    assert.equal(await page.evaluate(() => __saves.length), 1);
  } finally { await context.close(); }
});

await record('Android exit stays blocked for incomplete quantity input', async () => {
  const { context, page } = await mobileFixture(browser);
  try {
    await backHandler(page);
    await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('');
    await page.evaluate(() => { void __back.handler(); });
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => __exits), 0);
    assert.equal(await page.evaluate(() => __saves.length), 0);
  } finally { await context.close(); }
});

for (const discard of [false, true]) {
  await record(`Android offline exit ${discard ? 'requires explicit discard' : 'preserves the draft when cancelled'}`, async () => {
    const { context, page } = await mobileFixture(browser);
    try {
      await backHandler(page);
      let prompted = false;
      page.on('dialog', async dialog => {
        prompted = true;
        if (discard) await dialog.accept(); else await dialog.dismiss();
      });
      await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
      await page.evaluate(() => { __exitAttempt = __back.handler(); });
      await finishSave(page, 'Failed to fetch');
      await page.evaluate(() => __exitAttempt);
      assert.equal(prompted, true);
      assert.equal(await page.evaluate(() => __exits), discard ? 1 : 0);
      assert.equal(await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).inputValue(), discard ? '7' : '9');
    } finally { await context.close(); }
  });
}

for (const kind of ['overlay', 'keyboard']) {
  await record(`Android ${kind} dismissal keeps priority over save/exit`, async () => {
    const { context, page } = await mobileFixture(browser);
    try {
      await backHandler(page, { [kind]: true });
      await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
      await page.evaluate(() => { void __back.handler(); });
      assert.equal(await page.evaluate(() => __exits), 0);
      assert.equal(await page.evaluate(kind => kind === 'overlay' ? __overlayClosed : __blurred, kind), 1);
      assert.equal(await page.evaluate(() => __saves.length), 0);
    } finally { await context.close(); }
  });
}

for (const layout of ['admin', 'field']) {
  for (const width of [390, 430]) {
    await record(`${layout} ${width}px: small buttons have 44px targets without horizontal overflow`, async () => {
      const { context, page } = await mobileFixture(browser, { width, layout });
      try {
        const sizes = await page.locator('.btn--sm:visible').evaluateAll(nodes => nodes.map(node => {
          const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height };
        }));
        assert.ok(sizes.length > 0);
        assert.ok(sizes.every(size => size.width >= 44 && size.height >= 44), JSON.stringify(sizes));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      } finally { await context.close(); }
    });
  }
}

await finishAndReport(browser, results);
