import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const ROOF = { id: 'svc-roof', key: 'roof_soft_wash', name: 'Roof Soft Washing', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };

const MODIFIERS = [
  { id: 'm-acc-easy', service_id: 'svc-roof', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-acc-normal', service_id: 'svc-roof', group_key: 'access', group_label: 'Access', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-acc-diff', service_id: 'svc-roof', group_key: 'access', group_label: 'Access', option_key: 'difficult', label: 'Difficult', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 3 },
  { id: 'm-acc-vdiff', service_id: 'svc-roof', group_key: 'access', group_label: 'Access', option_key: 'very_difficult', label: 'Very difficult', kind: 'multiplier', value: 1.45, is_default: false, sort_order: 4 },
  { id: 'm-cov-light', service_id: 'svc-roof', group_key: 'condition', group_label: 'Coverage', option_key: 'light', label: 'Light streaking', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cov-normal', service_id: 'svc-roof', group_key: 'condition', group_label: 'Coverage', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-cov-heavy', service_id: 'svc-roof', group_key: 'condition', group_label: 'Coverage', option_key: 'heavy', label: 'Heavy algae / black streaking', kind: 'multiplier', value: 1.35, is_default: false, sort_order: 3 },
  { id: 'm-cov-severe', service_id: 'svc-roof', group_key: 'condition', group_label: 'Coverage', option_key: 'severe', label: 'Severe / moss present', kind: 'multiplier', value: 1.55, is_default: false, sort_order: 4 },
  { id: 'm-type-asphalt', service_id: 'svc-roof', group_key: 'surface', group_label: 'Roof type', option_key: 'asphalt', label: 'Asphalt shingle', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-type-metal', service_id: 'svc-roof', group_key: 'surface', group_label: 'Roof type', option_key: 'metal', label: 'Metal', kind: 'multiplier', value: 1.05, is_default: false, sort_order: 2 },
  { id: 'm-type-cedar', service_id: 'svc-roof', group_key: 'surface', group_label: 'Roof type', option_key: 'cedar', label: 'Cedar / delicate', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Main roof', storeys: '2_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Garage', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-3', name: 'Rear addition', storeys: '1_storey', access: 'difficult', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-roof', approval_status: 'approved', rate: 0.45, minimum: 299 }
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
  { id: 'm1', service_id: 'svc-roof', section_id: 'sec-1', label: 'Main Front Slope and Upper Dormer Section', quantity: 780, unit: 'sq_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-cov-normal' }, { modifier_id: 'm-type-asphalt' }], job_measurement_addons: [] },
  { id: 'm2', service_id: 'svc-roof', section_id: 'sec-2', label: 'Detached Garage', quantity: 260, unit: 'sq_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-cov-light' }, { modifier_id: 'm-type-asphalt' }], job_measurement_addons: [] },
  { id: 'm3', service_id: 'svc-roof', section_id: 'sec-3', label: 'Rear Addition Roof', quantity: 340, unit: 'sq_ft', notes: 'Heavy moss on north-facing slope, cedar shakes underneath', review_required: false, measurement_modifiers: [{ modifier_id: 'm-cov-severe' }, { modifier_id: 'm-type-cedar' }], job_measurement_addons: [] },
  { id: 'm4', service_id: 'svc-roof', section_id: 'sec-3', label: 'Skylight Surround Section', quantity: 60, unit: 'sq_ft', notes: null, review_required: true, review_reason: 'Steep pitch near skylight -- confirm safe ladder/harness access before scheduling', measurement_modifiers: [{ modifier_id: 'm-cov-heavy' }, { modifier_id: 'm-type-asphalt' }], job_measurement_addons: [] }
];
const pricing = [
  { service_id: 'svc-roof', amount: 733.84, unit_rate: 0.45, minimum_applied: false }
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
  }, { services: [ROOF], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: `/tmp/claude-0/roof-calculator-${label}.png`, fullPage: true });
  await browser.close();
  console.log(`Saved ${label} (${width}px).`);
}

async function main() {
  await shootAt(420, 'mobile');
  await shootAt(820, 'tablet');
  await shootAt(1400, 'desktop');
}

main().catch((err) => { console.error(err); process.exit(1); });
