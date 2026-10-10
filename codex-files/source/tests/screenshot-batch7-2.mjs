import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fieldFixture, queueAction, JOB_A } from './field-resilience-fixture.mjs';

const { default: pkg } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright/index.js');
const browser = await pkg.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium' });
const directory = resolve(process.argv[2] || '/tmp/nova-shield-batch7-2-screenshots');
await mkdir(directory, { recursive: true });
const views = [];
try {
  for (const width of [390, 430, 1200]) {
    for (const scenario of ['load-error', 'stale-data', 'saving-passport', 'failed-outbox', 'large-schedule', 'many-measurements']) {
      const config = scenario === 'load-error' ? { __fail: { session: 'Failed to fetch' } }
        : scenario === 'large-schedule' ? { __visitCount: 500 }
        : scenario === 'many-measurements' ? { __measurementCount: 150, __serviceName: 'A long service name with detailed exterior maintenance requirements' }
        : {};
      const hash = ['load-error', 'failed-outbox', 'large-schedule'].includes(scenario) ? '#/' : '#/visit/' + JOB_A;
      const { context, page } = await fieldFixture(browser, { width, hash, config });
      try {
        if (scenario === 'load-error') await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
        else if (scenario === 'large-schedule') await page.waitForFunction(() => document.querySelectorAll('button').length >= 500);
        else if (scenario === 'failed-outbox') {
          await queueAction(page, 'Save Property Passport');
          await queueAction(page, 'Checklist update');
          await page.evaluate(async () => {
            __fail.updateProperty = 'Permission denied — ask an administrator to check property access';
            await (await import('/admin/js/lib/offline-queue.js')).flush();
          });
          await page.locator('#syncBadge').click();
          await page.getByRole('dialog').getByText('Save Property Passport', { exact: true }).waitFor();
        } else {
          await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).first().waitFor();
          if (scenario === 'stale-data') {
            await page.evaluate(() => { __fail.listMeasurements = 'Failed to fetch'; });
            await page.getByRole('button', { name: 'Save passport', exact: true }).click();
            await page.getByRole('button', { name: 'Retry visit data', exact: true }).waitFor();
            await page.evaluate(() => window.scrollTo(0, 0));
            // Inspect the persistent recovery control after the normal
            // transient toast has dismissed, as a tech can do on the page.
            await page.locator('#toast').waitFor({ state: 'hidden', timeout: 7500 });
          } else if (scenario === 'saving-passport') {
            await page.evaluate(() => { __defer.updateProperty = true; });
            await page.getByLabel('Material', { exact: true }).fill('Vinyl');
            await page.getByRole('button', { name: 'Save passport', exact: true }).click();
            await page.getByRole('button', { name: 'Saving passport…', exact: true }).waitFor();
          } else {
            await page.getByRole('heading', { name: config.__serviceName, exact: false }).scrollIntoViewIfNeeded();
          }
        }
        const metrics = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
        assert.ok(metrics.document <= metrics.viewport, `${width}/${scenario}: overflow`);
        const file = `${width}-${scenario}.png`;
        // Viewport captures are deliberate: 150 measurements and 500 visits
        // produce extremely tall documents. Inspect their usable controls.
        await page.screenshot({ path: resolve(directory, file) });
        views.push({ file, scenario, ...metrics });
      } finally { await context.close(); }
    }
  }
  await writeFile(resolve(directory, 'views.json'), JSON.stringify({ browser: browser.version(), views }, null, 2));
  console.log(`Captured ${views.length} views at ${directory}; all fit their viewports.`);
} finally { await browser.close(); }
