import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const SIDING = { id: 'svc-siding', key: 'siding', name: 'Siding / Soft Wash', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };

const MODIFIERS = [
  { id: 'm-cond-light', service_id: 'svc-siding', group_key: 'condition', group_label: 'Condition', option_key: 'light', label: 'Light dirt', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-normal', service_id: 'svc-siding', group_key: 'condition', group_label: 'Condition', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-cond-algae', service_id: 'svc-siding', group_key: 'condition', group_label: 'Condition', option_key: 'algae', label: 'Algae / mildew', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 3 },
  { id: 'm-cond-heavy', service_id: 'svc-siding', group_key: 'condition', group_label: 'Condition', option_key: 'heavy', label: 'Heavy buildup', kind: 'multiplier', value: 1.35, is_default: false, sort_order: 4 },
  { id: 'm-cond-severe', service_id: 'svc-siding', group_key: 'condition', group_label: 'Condition', option_key: 'severe', label: 'Severe / treatment', kind: 'multiplier', value: 1.5, is_default: false, sort_order: 5 },
  { id: 'm-surf-vinyl', service_id: 'svc-siding', group_key: 'surface', group_label: 'Surface', option_key: 'vinyl', label: 'Vinyl / standard', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-surf-aluminum', service_id: 'svc-siding', group_key: 'surface', group_label: 'Surface', option_key: 'aluminum', label: 'Aluminum', kind: 'multiplier', value: 1.05, is_default: false, sort_order: 2 },
  { id: 'm-surf-painted', service_id: 'svc-siding', group_key: 'surface', group_label: 'Surface', option_key: 'painted', label: 'Painted / delicate', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 3 },
  { id: 'm-surf-other', service_id: 'svc-siding', group_key: 'surface', group_label: 'Surface', option_key: 'other', label: 'Other / inspect', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 4 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-siding', approval_status: 'approved', rate: 0.3, minimum: 199 }
];

const FAKE_API = `
  export async function createSection() { return { id: 'new-sec', name: 'Section' }; }
  export async function updateMeasurement(id, patch) { return { id, ...patch }; }
  export async function deleteMeasurement() {}
  export async function setMeasurementModifier() {}
  export async function deleteMeasurementAddon() {}
  export async function addMeasurementAddon() { return {}; }
`;

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 420, height: 1400 } });
  const mock = (urlPattern, body) => page.route(urlPattern, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body }));

  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE);
  await mock(`${BASE}/admin/js/lib/api.js`, FAKE_API);

  await page.goto(`${BASE}/admin/field.html`);
  await page.waitForTimeout(150);

  const measurements = [
    { id: 'm1', service_id: 'svc-siding', section_id: 'sec-1', label: 'Front', quantity: 420, unit: 'sq_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-cond-light' }, { modifier_id: 'm-surf-vinyl' }], job_measurement_addons: [] },
    { id: 'm2', service_id: 'svc-siding', section_id: 'sec-2', label: 'Rear', quantity: 680, unit: 'sq_ft', notes: 'North-facing, heavier algae than front', review_required: false, measurement_modifiers: [{ modifier_id: 'm-cond-algae' }, { modifier_id: 'm-surf-vinyl' }], job_measurement_addons: [] },
    { id: 'm3', service_id: 'svc-siding', section_id: 'sec-1', label: 'Garage', quantity: 160, unit: 'sq_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-cond-light' }, { modifier_id: 'm-surf-vinyl' }], job_measurement_addons: [] },
    { id: 'm4', service_id: 'svc-siding', section_id: 'sec-2', label: 'Addition', quantity: 220, unit: 'sq_ft', notes: 'Stucco accent band near roofline -- confirm before washing', review_required: true, review_reason: 'Unclear if accent band is painted stucco or EIFS -- confirm before washing', measurement_modifiers: [{ modifier_id: 'm-cond-normal' }, { modifier_id: 'm-surf-painted' }], job_measurement_addons: [] }
  ];
  const pricing = [
    { service_id: 'svc-siding', amount: 521.70, unit_rate: 0.3, minimum_applied: false }
  ];

  await page.evaluate(async ({ services, modifiers, sections, pricingRules, measurements, pricing }) => {
    const mod = await import('/admin/js/views/measurements.js');
    const refs = { services, modifiers, siteFactors: [], sections: sections.map(s => ({ ...s })), pricingRules };
    const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {} });
    document.body.appendChild(panel.root);
    panel.render({ measurements, pricing });
  }, { services: [SIDING], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/claude-0/siding-calculator.png', fullPage: true });
  await browser.close();
  console.log('Screenshot saved.');
}

main().catch((err) => { console.error(err); process.exit(1); });
