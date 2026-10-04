import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;

function fakeSupabase(lines) {
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  return `
    export const supabase = {
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      rpc: async (name) => {
        if (name !== 'get_customer_quote') return { data: null, error: { message: 'unexpected rpc' } };
        return { data: {
          reference: 'NS-DEMO', version: 1, status: 'sent', issued_on: new Date().toISOString(),
          valid_until: null, currency: 'CAD', customer_name: 'Jane Doe', property: '12 Example Street',
          customer_notes: null, terms: null, subtotal: ${total}, tax_total: 0, total: ${total},
          company: { phone: '604-555-0100', email: 'office@novashieldmaintenance.com' },
          lines: ${JSON.stringify(lines)},
          adjustments: [], change_orders: []
        }, error: null };
      }
    };
  `;
}

async function shootAt(width, label, lines, fileLabel) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const mock = (urlPattern, body) => page.route(urlPattern, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body }));
  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, fakeSupabase(lines));
  await page.goto(`${BASE}/site/quote.html?id=demo`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `/tmp/claude-0/acceptance-${fileLabel}-${label}.png`, fullPage: true });
  await browser.close();
  console.log(`Saved ${fileLabel} ${label} (${width}px).`);
}

async function main() {
  const unapproved = [
    { description: 'Permanent Outdoor Lighting', amount: 1250, pricing_approved: false }
  ];
  const approved = [
    { description: 'Permanent Outdoor Lighting', amount: 1250, pricing_approved: true }
  ];
  for (const [width, label] of [[420, 'mobile'], [1400, 'desktop']]) {
    await shootAt(width, label, unapproved, 'blocked');
    await shootAt(width, label, approved, 'normal');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
