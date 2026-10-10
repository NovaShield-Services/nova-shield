import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readinessFixture, queueAction } from './native-readiness-fixture.mjs';
const { default: pkg } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright/index.js');
const browser = await pkg.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium' });
const output = process.argv[2] || '/tmp/nova-shield-batch8-2-screenshots';
mkdirSync(output, { recursive: true });
const views = [];
try {
  for (const width of [390, 430, 1200]) for (const theme of ['light', 'dark']) {
    for (const scenario of ['quantity-recovery', 'passport-progress', 'outbox-error']) {
      const { context, page } = await readinessFixture(browser, { width,
        config: scenario === 'quantity-recovery' ? { __fail: { updateMeasurement: 'permission denied' } } : {} });
      try {
        await page.emulateMedia({ colorScheme: theme });
        if (scenario === 'quantity-recovery') {
          await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
          const retry = page.getByRole('button', { name: 'Retry quantity save', exact: true });
          await retry.waitFor(); await retry.focus();
          await retry.scrollIntoViewIfNeeded();
        } else if (scenario === 'passport-progress') {
          await page.evaluate(() => { __defer.updateProperty = true; });
          await page.getByRole('button', { name: 'Save passport', exact: true }).click();
          await page.locator('[data-passport-status]').scrollIntoViewIfNeeded();
        } else {
          await queueAction(page, 'Save Property Passport');
          await page.evaluate(async () => {
            __fail.updateProperty = 'permission denied';
            await (await import('/admin/js/lib/offline-queue.js')).flush();
          });
          await page.locator('#syncBadge').focus(); await page.keyboard.press('Space');
          await page.getByText('Last sync failed: permission denied', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Discard Save Property Passport', exact: true }).focus();
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (overflow) throw new Error(`Overflow at ${width}/${theme}/${scenario}`);
        const file = `${width}-${theme}-${scenario}.png`;
        await page.screenshot({ path: join(output, file) });
        views.push({ width, theme, scenario, file, overflow });
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
writeFileSync(join(output, 'views.json'), JSON.stringify(views, null, 2));
console.log(`Captured ${views.length} views in ${output}`);
