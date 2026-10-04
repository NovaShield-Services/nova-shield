import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // Homepage "about" plate (brandart--full, now the new transparent logo)
  for (const [width, label] of [[1400, 'desktop'], [420, 'mobile']]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(`${BASE}/site/index.html`);
    await page.locator('#about').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.locator('#about').screenshot({ path: `/tmp/claude-0/brand-about-${label}.png` });
    await page.close();
    console.log(`Saved about section (${width}px).`);
  }

  // Homepage header nav mark (untouched SVG) + hero, for a before/after sanity check
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 500 } });
    await page.goto(`${BASE}/site/index.html`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `/tmp/claude-0/brand-header-hero.png` });
    await page.close();
    console.log('Saved header/hero.');
  }

  // Quote document header (new logo via .qlockup)
  {
    const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
    const mock = (urlPattern, body) => page.route(urlPattern, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body }));
    await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`);
    await mock(`${BASE}/shared/supabase.js`, `
      export const supabase = {
        storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
        rpc: async (name) => {
          if (name !== 'get_customer_quote') return { data: null, error: { message: 'unexpected rpc' } };
          return { data: {
            reference: 'NS-1001', version: 1, status: 'sent', issued_on: new Date().toISOString(),
            valid_until: null, currency: 'CAD', customer_name: 'Jane Doe', property: '12 Example Street',
            customer_notes: null, terms: null, subtotal: 1250, tax_total: 0, total: 1250,
            company: { phone: '604-555-0100', email: 'office@novashieldmaintenance.com' },
            lines: [{ description: 'Permanent Outdoor Lighting', amount: 1250, pricing_approved: true }],
            adjustments: [], change_orders: []
          }, error: null };
        }
      };
    `);
    await page.goto(`${BASE}/site/quote.html?id=demo`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `/tmp/claude-0/brand-quote-header.png` });
    await page.close();
    console.log('Saved quote header.');
  }

  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
