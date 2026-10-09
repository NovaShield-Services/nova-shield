import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
import { mobileFixture, finishSave } from './mobile-reliability-fixture.mjs';

// Manual visual QA, separately selectable from mocked tests and DB integration.
const directory = resolve(process.argv[2] || '/tmp/nova-shield-batch6-2-screenshots');
await mkdir(directory, { recursive: true });
const browser = await pkg.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const views = [];
try {
  for (const layout of ['admin', 'field']) {
    for (const width of [390, 430, 1200]) {
      const { context, page } = await mobileFixture(browser, { layout, width });
      try {
        for (const state of ['saved', 'offline']) {
          if (state === 'offline') {
            await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('9');
            await finishSave(page, 'Failed to fetch');
            await page.getByRole('button', { name: 'Retry quantity save', exact: true }).waitFor();
          }
          const metrics = await page.evaluate(() => ({
            viewport: innerWidth, document: document.documentElement.scrollWidth,
            controls: [...document.querySelectorAll('.btn--sm')]
              .filter(node => node.getBoundingClientRect().width > 0)
              .map(node => {
                const { width, height } = node.getBoundingClientRect();
                return { name: node.textContent.trim(), width, height };
              })
          }));
          assert.ok(metrics.document <= metrics.viewport, `${layout}/${width}/${state}: overflow`);
          assert.ok(metrics.controls.every(control => control.width >= 44 && control.height >= 44));
          const file = `${layout}-${width}-${state}.png`;
          await page.screenshot({ path: resolve(directory, file), fullPage: true });
          views.push({ file, layout, state, ...metrics });
        }
      } finally { await context.close(); }
    }
  }
  await writeFile(resolve(directory, 'views.json'), JSON.stringify({ browser: browser.version(), views }, null, 2));
  console.log(`Captured ${views.length} views at ${directory}; all fit and have >=44px small-button targets.`);
} finally { await browser.close(); }
