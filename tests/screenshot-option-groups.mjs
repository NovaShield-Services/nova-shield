import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';
const OUT = '/tmp/claude-0/-home-user-nova-shield/e23c5c3a-f5e5-54bd-adbd-1dd772a8c970/scratchpad';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;

function optionGroupSupabase() {
  const options = [
    { id: 'opt-a', option_label: 'Essential', option_sort_order: 1, total: 440, status: 'sent', pricing_approved: true },
    { id: 'opt-b', option_label: 'Complete', option_sort_order: 2, total: 770, status: 'sent', pricing_approved: true },
    { id: 'opt-c', option_label: 'Full Home', option_sort_order: 3, total: 1050, status: 'sent', pricing_approved: false }
  ];
  const linesFor = {
    'opt-a': [{ description: 'Permanent Outdoor Lighting', amount: 440, pricing_approved: true }],
    'opt-b': [
      { description: 'Permanent Outdoor Lighting', amount: 440, pricing_approved: true },
      { description: 'Seasonal Christmas Lighting', amount: 330, pricing_approved: true }
    ],
    'opt-c': [
      { description: 'Permanent Outdoor Lighting', amount: 440, pricing_approved: true },
      { description: 'Seasonal Christmas Lighting', amount: 330, pricing_approved: true },
      { description: 'Heating Wire Installation', amount: 280, pricing_approved: false }
    ]
  };
  return `
    export const supabase = {
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      rpc: async (name, args) => {
        if (name !== 'get_customer_quote') return { data: null, error: { message: 'unexpected rpc' } };
        const lines = ${JSON.stringify(linesFor)}[args.p_quote_id] || [];
        const total = lines.reduce((s, l) => s + l.amount, 0);
        return { data: {
          reference: 'NS-2041', version: 1, status: 'sent', issued_on: new Date().toISOString(),
          valid_until: '2026-12-01', currency: 'CAD', customer_name: 'Jane Doe', property: '12 Example Street',
          customer_notes: null, terms: null, subtotal: total, tax_total: 0, total,
          company: { phone: '604-555-0100', email: 'office@novashieldmaintenance.com' },
          lines, adjustments: [], change_orders: [],
          option_group: { group_id: 'grp-demo', options: ${JSON.stringify(options)} }
        }, error: null };
      }
    };
  `;
}

function ordinarySupabase() {
  return `
    export const supabase = {
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      rpc: async (name) => {
        if (name !== 'get_customer_quote') return { data: null, error: { message: 'unexpected rpc' } };
        return { data: {
          reference: 'NS-1998', version: 1, status: 'sent', issued_on: new Date().toISOString(),
          valid_until: '2026-12-01', currency: 'CAD', customer_name: 'Jane Doe', property: '12 Example Street',
          customer_notes: null, terms: null, subtotal: 320, tax_total: 0, total: 320,
          company: { phone: '604-555-0100', email: 'office@novashieldmaintenance.com' },
          lines: [{ description: 'Siding / Soft Wash', amount: 320, pricing_approved: true }],
          adjustments: [], change_orders: []
        }, error: null };
      }
    };
  `;
}

async function newPage(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const mock = (urlPattern, body) => page.route(urlPattern, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body }));
  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  return { page, mock };
}

async function shootCustomer(browser, width, label, supabaseBody, quoteId, clickViewDetails) {
  const { page, mock } = await newPage(browser, width);
  await mock(`${BASE}/shared/supabase.js`, supabaseBody);
  await page.goto(`${BASE}/site/quote.html?id=${quoteId}`);
  await page.waitForTimeout(200);
  if (clickViewDetails) {
    await page.evaluate((idx) => {
      [...document.querySelectorAll('button')].filter(b => b.textContent === 'View details')[idx].click();
    }, clickViewDetails - 1);
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: `${OUT}/phasec-${label}-${width}.png`, fullPage: true });
  await page.close();
  console.log(`Saved ${label} at ${width}px.`);
}

async function shootAdmin(browser, width) {
  const { page, mock } = await newPage(browser, width);
  await mock(`${BASE}/shared/supabase.js`, `export const supabase = { auth: { signOut: async () => {} }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) }, rpc: async () => ({ data: null, error: { message: 'not used' } }) };`);
  await mock(`${BASE}/admin/js/lib/api.js`, `
    export async function getSettings() { return { company: { website: 'https://novashieldmaintenance.com' } }; }
    export async function signedPhotoUrl() { return ''; }
    export async function createOptionQuote() { return 'new-id'; }
    export async function sendOptionGroup() {}
    export async function sendQuote() {}
    export async function duplicateQuote() { return {}; }
    export async function updateQuote() { return {}; }
    export async function deleteLine() {}
    export async function deleteAdjustment() {}
    export async function addAdjustment() { return {}; }
    export async function uploadSignature() { return ''; }
    export async function saveQuoteSignature() { return {}; }
  `);
  await page.goto(`${BASE}/admin/field.html`);
  await page.waitForTimeout(150);

  const optionA = { id: 'opt-a', version: 1, kind: 'final', status: 'sent', total: 440, subtotal: 440, tax_total: 0,
    valid_until: '2026-12-01', option_group_id: 'grp-demo', option_label: 'Essential', option_sort_order: 1,
    quote_line_items: [{ id: 'li-a', description: 'Permanent Outdoor Lighting', amount: 440, quantity: 80, unit: 'linear_ft', unit_rate: 5, modifier_factor: 1, addons_amount: 0, minimum_applied: false, source: 'calculated', sort_order: 1, pricing_approved: true }],
    quote_adjustments: [] };
  const optionB = { ...optionA, id: 'opt-b', version: 2, option_label: 'Complete', option_sort_order: 2, total: 770,
    quote_line_items: [{ ...optionA.quote_line_items[0], amount: 770 }] };
  const optionC = { ...optionA, id: 'opt-c', version: 3, status: 'draft', option_label: 'Full Home', option_sort_order: 3, total: 1050,
    quote_line_items: [{ ...optionA.quote_line_items[0], description: 'Heating Wire Installation', amount: 1050, pricing_approved: false }] };
  const measurements = [
    { id: 'm-1', service_id: 'svc-perm', label: 'Front', quantity: 80, unit: 'linear_ft' },
    { id: 'm-2', service_id: 'svc-xmas', label: 'Front', quantity: 60, unit: 'linear_ft' },
    { id: 'm-3', service_id: 'svc-heat', label: 'Valley', quantity: 40, unit: 'linear_ft' }
  ];
  const services = [
    { id: 'svc-perm', name: 'Permanent Outdoor Lighting' },
    { id: 'svc-xmas', name: 'Seasonal Christmas Lighting' },
    { id: 'svc-heat', name: 'Heating Wire Installation' }
  ];

  await page.evaluate(async ({ optionA, optionB, optionC, measurements, services }) => {
    const mod = await import('/admin/js/views/quote.js');
    const job = { id: 'job-1', customers: { name: 'Jane Doe', email: 'jane@example.com', phone: '+16045550123' }, properties: { address_line1: '12 Example Street' } };
    const panel = mod.createQuotePanel({ job, onChange: () => {} });
    document.body.innerHTML = '';
    document.body.style.maxWidth = '900px';
    document.body.style.margin = '20px auto';
    document.body.appendChild(panel.root);
    panel.render({ quotes: [optionC, optionB, optionA], measurements, services });
  }, { optionA, optionB, optionC, measurements, services });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/phasec-admin-option-group-${width}.png`, fullPage: true });
  await page.close();
  console.log(`Saved admin option-group view at ${width}px.`);
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  for (const [width, label] of [[420, 'mobile'], [1400, 'desktop']]) {
    await shootCustomer(browser, width, 'option-list', optionGroupSupabase(), 'opt-a', null);
    await shootCustomer(browser, width, 'option-detail', optionGroupSupabase(), 'opt-a', 2); // drill into "Complete"
    await shootCustomer(browser, width, 'ordinary-quote', ordinarySupabase(), 'plain-1', null);
  }
  await shootAdmin(browser, 1400);

  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
