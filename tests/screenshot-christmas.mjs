import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const XMAS = { id: 'svc-xmas', key: 'christmas_lighting', name: 'Seasonal Christmas Lighting', unit: 'linear_ft', category: 'lighting', quotable: true, active: true, parent_key: null };
const XMAS_JUMP = { id: 'svc-xmas-jump', key: 'christmas_lighting_jump', name: 'Christmas Lighting — Jump Wire', unit: 'linear_ft', category: 'lighting', quotable: true, active: true, parent_key: 'christmas_lighting' };

const MODIFIERS = [
  { id: 'm-height-1', service_id: 'svc-xmas', group_key: 'height', group_label: 'Height', option_key: '1_storey', label: '1 storey', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-height-2', service_id: 'svc-xmas', group_key: 'height', group_label: 'Height', option_key: '2_storey', label: '2 storeys', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-height-3', service_id: 'svc-xmas', group_key: 'height', group_label: 'Height', option_key: '3_storey', label: '3 storeys', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 3 },
  { id: 'm-height-4', service_id: 'svc-xmas', group_key: 'height', group_label: 'Height', option_key: '4_plus', label: 'Special access', kind: 'multiplier', value: 1.5, is_default: false, sort_order: 4 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-3', name: 'Garage', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-xmas', approval_status: 'approved', rate: 5, minimum: 0 },
  { service_id: 'svc-xmas-jump', approval_status: 'approved', rate: 2, minimum: 0 }
];

const FAKE_API = `
  export async function createSection() { return { id: 'new-sec', name: 'Section' }; }
  export async function updateMeasurement(id, patch) { return { id, ...patch }; }
  export async function deleteMeasurement() {}
  export async function setMeasurementModifier() {}
  export async function deleteMeasurementAddon() {}
  export async function addMeasurementAddon() { return {}; }
`;

const measurements = [
  { id: 'm1', service_id: 'svc-xmas', section_id: 'sec-1', label: 'Front roofline', quantity: 75, unit: 'linear_ft', notes: null, review_required: false, measurement_modifiers: [], job_measurement_addons: [] },
  { id: 'm2', service_id: 'svc-xmas', section_id: 'sec-2', label: 'Rear roofline', quantity: 105, unit: 'linear_ft', notes: 'Icy access on this side, confirm takedown route in January', review_required: false, measurement_modifiers: [], job_measurement_addons: [] },
  { id: 'm3', service_id: 'svc-xmas', section_id: 'sec-3', label: 'Garage', quantity: 32, unit: 'linear_ft', notes: null, review_required: true, review_reason: 'Unusual roofline geometry at the garage/house transition, confirm routing on site', measurement_modifiers: [], job_measurement_addons: [] },
  { id: 'mj', service_id: 'svc-xmas-jump', section_id: null, label: 'Jump wire', quantity: 35, unit: 'linear_ft', notes: null, review_required: false, measurement_modifiers: [], job_measurement_addons: [] }
];
const pricing = [
  { service_id: 'svc-xmas', amount: 1138.75, unit_rate: 5, minimum_applied: false },
  { service_id: 'svc-xmas-jump', amount: 70, unit_rate: 2, minimum_applied: false }
];

async function shootAt(width, label) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width, height: 1400 } });
  const mock = (urlPattern, body) => page.route(urlPattern, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body }));

  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE);
  await mock(`${BASE}/admin/js/lib/api.js`, FAKE_API);

  await page.goto(`${BASE}/admin/field.html`);
  await page.waitForTimeout(150);

  await page.evaluate(async ({ services, modifiers, sections, pricingRules, measurements, pricing }) => {
    const mod = await import('/admin/js/views/measurements.js');
    const refs = { services, modifiers, siteFactors: [], sections: sections.map(s => ({ ...s })), pricingRules };
    const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {} });
    document.body.appendChild(panel.root);
    panel.render({ measurements, pricing });
  }, { services: [XMAS, XMAS_JUMP], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: `/tmp/claude-0/christmas-calculator-${label}.png`, fullPage: true });
  await browser.close();
  console.log(`Saved ${label} (${width}px).`);
}

async function main() {
  await shootAt(420, 'mobile');
  await shootAt(820, 'tablet');
  await shootAt(1400, 'desktop');
}

main().catch((err) => { console.error(err); process.exit(1); });
