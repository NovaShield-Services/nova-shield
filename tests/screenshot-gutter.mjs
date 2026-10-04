import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const GUTTER = { id: 'svc-gutter', key: 'gutter_brightening', name: 'Gutter Brightening', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };

const MODIFIERS = [
  { id: 'm-ox-light', service_id: 'svc-gutter', group_key: 'condition', group_label: 'Oxidation', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-ox-normal', service_id: 'svc-gutter', group_key: 'condition', group_label: 'Oxidation', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-ox-tiger', service_id: 'svc-gutter', group_key: 'condition', group_label: 'Oxidation', option_key: 'tiger_striping', label: 'Visible tiger striping', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 3 },
  { id: 'm-ox-heavy', service_id: 'svc-gutter', group_key: 'condition', group_label: 'Oxidation', option_key: 'heavy', label: 'Heavy oxidation', kind: 'multiplier', value: 1.4, is_default: false, sort_order: 4 },
  { id: 'm-scope-front', service_id: 'svc-gutter', group_key: 'scope', group_label: 'Scope', option_key: 'front', label: 'Front-facing', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-scope-full', service_id: 'svc-gutter', group_key: 'scope', group_label: 'Scope', option_key: 'full', label: 'Full exterior', kind: 'multiplier', value: 1.35, is_default: false, sort_order: 2 },
  { id: 'm-scope-fulldiff', service_id: 'svc-gutter', group_key: 'scope', group_label: 'Scope', option_key: 'full_difficult', label: 'Full + difficult sections', kind: 'multiplier', value: 1.5, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-gutter', approval_status: 'approved', rate: 1.35, minimum: 149 }
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
    { id: 'm1', service_id: 'svc-gutter', section_id: 'sec-1', label: 'Front', quantity: 42, unit: 'linear_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-ox-light' }, { modifier_id: 'm-scope-full' }], job_measurement_addons: [] },
    { id: 'm2', service_id: 'svc-gutter', section_id: 'sec-2', label: 'Rear', quantity: 55, unit: 'linear_ft', notes: 'Heavy oxidation along rear fascia', review_required: false, measurement_modifiers: [{ modifier_id: 'm-ox-heavy' }, { modifier_id: 'm-scope-full' }], job_measurement_addons: [] },
    { id: 'm3', service_id: 'svc-gutter', section_id: 'sec-1', label: 'Garage', quantity: 24, unit: 'linear_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-ox-light' }, { modifier_id: 'm-scope-full' }], job_measurement_addons: [] },
    { id: 'm4', service_id: 'svc-gutter', section_id: 'sec-2', label: 'Addition', quantity: 18, unit: 'linear_ft', notes: 'Tree clearance required before access', review_required: true, review_reason: 'Low branches blocking ladder access -- confirm clearance before scheduling', measurement_modifiers: [{ modifier_id: 'm-ox-normal' }, { modifier_id: 'm-scope-full' }], job_measurement_addons: [] }
  ];
  const pricing = [
    { service_id: 'svc-gutter', amount: 229.47, unit_rate: 1.35, minimum_applied: false }
  ];

  await page.evaluate(async ({ services, modifiers, sections, pricingRules, measurements, pricing }) => {
    const mod = await import('/admin/js/views/measurements.js');
    const refs = { services, modifiers, siteFactors: [], sections: sections.map(s => ({ ...s })), pricingRules };
    const panel = mod.createMeasurementsPanel({ job: { id: 'job-1' }, refs, onChange: () => {} });
    document.body.appendChild(panel.root);
    panel.render({ measurements, pricing });
  }, { services: [GUTTER], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/claude-0/gutter-brightening-calculator.png', fullPage: true });
  await browser.close();
  console.log('Screenshot saved.');
}

main().catch((err) => { console.error(err); process.exit(1); });
