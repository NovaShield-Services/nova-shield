import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const CONCRETE = { id: 'svc-concrete', key: 'concrete', name: 'Concrete / Pressure Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };

const MODIFIERS = [
  { id: 'm-acc-easy', service_id: 'svc-concrete', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-acc-normal', service_id: 'svc-concrete', group_key: 'access', group_label: 'Access', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.05, is_default: false, sort_order: 2 },
  { id: 'm-acc-diff', service_id: 'svc-concrete', group_key: 'access', group_label: 'Access', option_key: 'difficult', label: 'Difficult', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 3 },
  { id: 'm-surf-concrete', service_id: 'svc-concrete', group_key: 'surface', group_label: 'Surface', option_key: 'concrete', label: 'Poured concrete', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-surf-interlock', service_id: 'svc-concrete', group_key: 'surface', group_label: 'Surface', option_key: 'interlock', label: 'Interlock / pavers', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-surf-stone', service_id: 'svc-concrete', group_key: 'surface', group_label: 'Surface', option_key: 'stone', label: 'Natural stone', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 3 },
  { id: 'm-surf-asphalt', service_id: 'svc-concrete', group_key: 'surface', group_label: 'Surface', option_key: 'asphalt', label: 'Asphalt', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 4 },
  { id: 'm-cond-light', service_id: 'svc-concrete', group_key: 'condition', group_label: 'Condition', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-normal', service_id: 'svc-concrete', group_key: 'condition', group_label: 'Condition', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-cond-organic', service_id: 'svc-concrete', group_key: 'condition', group_label: 'Condition', option_key: 'organic', label: 'Heavy organic growth', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 3 },
  { id: 'm-cond-heavy', service_id: 'svc-concrete', group_key: 'condition', group_label: 'Condition', option_key: 'heavy_staining', label: 'Heavy staining', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 4 },
  { id: 'm-treat-none', service_id: 'svc-concrete', group_key: 'addon', group_label: 'Special treatment', option_key: 'none', label: 'None', kind: 'flat', value: 0, is_default: true, sort_order: 1 },
  { id: 'm-treat-degreaser', service_id: 'svc-concrete', group_key: 'addon', group_label: 'Special treatment', option_key: 'degreaser', label: 'Oil / degreaser', kind: 'flat', value: 50, is_default: false, sort_order: 2 },
  { id: 'm-treat-rust', service_id: 'svc-concrete', group_key: 'addon', group_label: 'Special treatment', option_key: 'rust', label: 'Rust treatment', kind: 'flat', value: 75, is_default: false, sort_order: 3 },
  { id: 'm-treat-multi', service_id: 'svc-concrete', group_key: 'addon', group_label: 'Special treatment', option_key: 'multiple', label: 'Multiple treatments', kind: 'flat', value: 100, is_default: false, sort_order: 4 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '1_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-concrete', approval_status: 'approved', rate: 0.25, minimum: 149 }
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
  { id: 'm1', service_id: 'svc-concrete', section_id: 'sec-1', label: 'Driveway', quantity: 1200, unit: 'sq_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-surf-concrete' }, { modifier_id: 'm-cond-light' }, { modifier_id: 'm-treat-none' }], job_measurement_addons: [] },
  { id: 'm2', service_id: 'svc-concrete', section_id: 'sec-1', label: 'Front walkway', quantity: 180, unit: 'sq_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-surf-concrete' }, { modifier_id: 'm-cond-light' }, { modifier_id: 'm-treat-none' }], job_measurement_addons: [] },
  { id: 'm3', service_id: 'svc-concrete', section_id: 'sec-2', label: 'Rear patio', quantity: 450, unit: 'sq_ft', notes: 'Oil stain near grill area, degreaser applied', review_required: false, measurement_modifiers: [{ modifier_id: 'm-surf-stone' }, { modifier_id: 'm-cond-heavy' }, { modifier_id: 'm-treat-degreaser' }], job_measurement_addons: [] },
  { id: 'm4', service_id: 'svc-concrete', section_id: 'sec-2', label: 'Side walkway', quantity: 220, unit: 'sq_ft', notes: null, review_required: true, review_reason: 'Cracked and uneven -- confirm safe to pressure wash before scheduling', measurement_modifiers: [{ modifier_id: 'm-surf-concrete' }, { modifier_id: 'm-cond-organic' }, { modifier_id: 'm-treat-none' }], job_measurement_addons: [] }
];
const pricing = [
  { service_id: 'svc-concrete', amount: 611.45, unit_rate: 0.25, minimum_applied: false }
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
  }, { services: [CONCRETE], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: `/tmp/claude-0/concrete-calculator-${label}.png`, fullPage: true });
  await browser.close();
  console.log(`Saved ${label} (${width}px).`);
}

async function main() {
  await shootAt(420, 'mobile');
  await shootAt(820, 'tablet');
  await shootAt(1400, 'desktop');
}

main().catch((err) => { console.error(err); process.exit(1); });
