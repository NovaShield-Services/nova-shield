import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const HW = { id: 'svc-hw', key: 'winter_deicing_cables', name: 'Heating Wire Installation', unit: 'linear_ft', category: 'winter', quotable: true, active: true, parent_key: null };
const VALLEY1 = { id: 'svc-v1', key: 'winter_deicing_cables_valley_1st', name: 'Heating Wire — Valley (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const VALLEY2 = { id: 'svc-v2', key: 'winter_deicing_cables_valley_2nd', name: 'Heating Wire — Valley (2nd floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const CORNER1 = { id: 'svc-c1', key: 'winter_deicing_cables_corner_1st', name: 'Heating Wire — Corner (1st floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const CORNER2 = { id: 'svc-c2', key: 'winter_deicing_cables_corner_2nd', name: 'Heating Wire — Corner (2nd floor)', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: 'winter_deicing_cables' };
const ALL_SERVICES = [HW, VALLEY1, VALLEY2, CORNER1, CORNER2];

const MODIFIERS = [
  { id: 'm-cond-good', service_id: 'svc-hw', group_key: 'condition', group_label: 'Gutter condition', option_key: 'good', label: 'Good', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-older', service_id: 'svc-hw', group_key: 'condition', group_label: 'Gutter condition', option_key: 'older', label: 'Older, needs care', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-cond-poor', service_id: 'svc-hw', group_key: 'condition', group_label: 'Gutter condition', option_key: 'poor', label: 'Poor - assess before fitting', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 3 },
  { id: 'm-scope-edge', service_id: 'svc-hw', group_key: 'scope', group_label: 'Coverage', option_key: 'edge_only', label: 'Roof edge only', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-scope-full', service_id: 'svc-hw', group_key: 'scope', group_label: 'Coverage', option_key: 'edge_gutters_downspouts', label: 'Roof edge + gutters + downspouts', kind: 'multiplier', value: 1.35, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-hw', approval_status: 'provisional', rate: 14, minimum: 450 }
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
    { id: 'm-eave-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Front lower roof', quantity: 30, unit: 'linear_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-cond-good' }, { modifier_id: 'm-scope-edge' }], job_measurement_addons: [] },
    { id: 'm-eave-2', service_id: 'svc-hw', section_id: 'sec-2', label: 'Rear main roof', quantity: 42, unit: 'linear_ft', notes: 'bracket-repair-authorized', review_required: true, review_reason: 'Bracket repair authorized -- confirm final count/price on site.', measurement_modifiers: [{ modifier_id: 'm-cond-poor' }, { modifier_id: 'm-scope-edge' }], job_measurement_addons: [] },
    { id: 'm-ds-1', service_id: 'svc-hw', section_id: 'sec-1', label: 'Downspout — Front', quantity: 12, unit: 'linear_ft', notes: null, review_required: false, measurement_modifiers: [], job_measurement_addons: [] },
    { id: 'm-v1', service_id: 'svc-v1', section_id: null, label: 'Valley — 1st floor', quantity: 2, unit: 'each', review_required: true, review_reason: 'No approved rate configured for this component yet -- price manually.', measurement_modifiers: [], job_measurement_addons: [] },
    { id: 'm-c1', service_id: 'svc-c1', section_id: null, label: 'Corner — 1st floor', quantity: 1, unit: 'each', review_required: true, review_reason: 'No approved rate configured for this component yet -- price manually.', measurement_modifiers: [], job_measurement_addons: [] }
  ];
  const pricing = [
    { service_id: 'svc-hw', amount: 1057.80, unit_rate: 14, minimum_applied: false }
  ];

  await page.evaluate(async ({ services, modifiers, sections, pricingRules, measurements, pricing }) => {
    const mod = await import('/admin/js/views/measurements.js');
    const refs = { services, modifiers, siteFactors: [], sections: sections.map(s => ({ ...s })), pricingRules };
    const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {} });
    document.body.appendChild(panel.root);
    panel.render({ measurements, pricing });
  }, { services: ALL_SERVICES, modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/claude-0/heating-wire-calculator.png', fullPage: true });
  await browser.close();
  console.log('Screenshot saved.');
}

main().catch((err) => { console.error(err); process.exit(1); });
