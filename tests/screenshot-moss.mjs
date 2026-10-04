import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const MOSS = { id: 'svc-moss', key: 'moss', name: 'Moss Removal', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };

const MODIFIERS = [
  { id: 'm-access-easy', service_id: 'svc-moss', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-access-difficult', service_id: 'svc-moss', group_key: 'access', group_label: 'Access', option_key: 'difficult', label: 'Difficult', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-access-vdifficult', service_id: 'svc-moss', group_key: 'access', group_label: 'Access', option_key: 'very_difficult', label: 'Very difficult', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 3 },
  { id: 'm-cov-light', service_id: 'svc-moss', group_key: 'condition', group_label: 'Coverage', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cov-moderate', service_id: 'svc-moss', group_key: 'condition', group_label: 'Coverage', option_key: 'moderate', label: 'Moderate', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 2 },
  { id: 'm-cov-heavy', service_id: 'svc-moss', group_key: 'condition', group_label: 'Coverage', option_key: 'heavy', label: 'Heavy', kind: 'multiplier', value: 1.4, is_default: false, sort_order: 3 },
  { id: 'm-fu-onetime', service_id: 'svc-moss', group_key: 'scope', group_label: 'Follow-up', option_key: 'one_time', label: 'One-time', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-fu-preventative', service_id: 'svc-moss', group_key: 'scope', group_label: 'Follow-up', option_key: 'preventative', label: 'Plus preventative', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-surf-roof', service_id: 'svc-moss', group_key: 'surface', group_label: 'Surface', option_key: 'roof', label: 'Roof', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-surf-siding', service_id: 'svc-moss', group_key: 'surface', group_label: 'Surface', option_key: 'siding', label: 'Siding', kind: 'multiplier', value: 1.05, is_default: false, sort_order: 2 },
  { id: 'm-surf-walkway', service_id: 'svc-moss', group_key: 'surface', group_label: 'Surface', option_key: 'walkway', label: 'Walkway', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front roof', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear roof', storeys: '1_storey', access: 'difficult', ground: 'sloped', ladder: 'normal', distance: 'far' },
  { id: 'sec-3', name: 'Back walkway', storeys: '1_storey', access: 'very_difficult', ground: 'uneven', ladder: 'normal', distance: 'far' }
];

const PRICING_RULES = [
  { service_id: 'svc-moss', approval_status: 'approved', rate: 0.35, minimum: 149 }
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
  { id: 'm1', service_id: 'svc-moss', section_id: 'sec-1', label: 'Front roof, north slope', quantity: 300, unit: 'sq_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-cov-light' }, { modifier_id: 'm-surf-roof' }, { modifier_id: 'm-fu-onetime' }], job_measurement_addons: [] },
  { id: 'm2', service_id: 'svc-moss', section_id: 'sec-2', label: 'Rear roof', quantity: 250, unit: 'sq_ft', notes: 'Growth concentrated on north-facing slope, shaded by trees', review_required: false, measurement_modifiers: [{ modifier_id: 'm-cov-moderate' }, { modifier_id: 'm-surf-siding' }, { modifier_id: 'm-fu-preventative' }], job_measurement_addons: [] },
  { id: 'm3', service_id: 'svc-moss', section_id: 'sec-3', label: 'Back walkway', quantity: 150, unit: 'sq_ft', notes: null, review_required: true, review_reason: 'Heavy growth undermining paver joints -- confirm substrate before treatment', measurement_modifiers: [{ modifier_id: 'm-cov-heavy' }, { modifier_id: 'm-surf-walkway' }, { modifier_id: 'm-fu-preventative' }], job_measurement_addons: [] }
];
const pricing = [
  { service_id: 'svc-moss', amount: 360.08, unit_rate: 0.35, minimum_applied: false }
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
  }, { services: [MOSS], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: `/tmp/claude-0/moss-calculator-${label}.png`, fullPage: true });
  await browser.close();
  console.log(`Saved ${label} (${width}px).`);
}

async function main() {
  await shootAt(420, 'mobile');
  await shootAt(820, 'tablet');
  await shootAt(1400, 'desktop');
}

main().catch((err) => { console.error(err); process.exit(1); });
