import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const WINDOWS = { id: 'svc-windows', key: 'windows', name: 'Window Cleaning', unit: 'each', category: 'cleaning', quotable: true, active: true, parent_key: null };

const MODIFIERS = [
  { id: 'm-h-1', service_id: 'svc-windows', group_key: 'height', group_label: 'Height', option_key: '1_storey', label: 'Ground floor', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-h-2', service_id: 'svc-windows', group_key: 'height', group_label: 'Height', option_key: '2_storey', label: '2 storeys', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-h-3', service_id: 'svc-windows', group_key: 'height', group_label: 'Height', option_key: '3_storey', label: '3 storeys', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 3 },
  { id: 'm-h-4', service_id: 'svc-windows', group_key: 'height', group_label: 'Height', option_key: '4_plus', label: 'Special access', kind: 'multiplier', value: 1.5, is_default: false, sort_order: 4 },
  { id: 'm-scope-ext', service_id: 'svc-windows', group_key: 'scope', group_label: 'Scope', option_key: 'exterior_only', label: 'Exterior only', kind: 'multiplier', value: 0.7, is_default: true, sort_order: 1 },
  { id: 'm-scope-both', service_id: 'svc-windows', group_key: 'scope', group_label: 'Scope', option_key: 'interior_exterior', label: 'Interior + exterior', kind: 'multiplier', value: 1, is_default: false, sort_order: 2 },
  { id: 'm-type-std', service_id: 'svc-windows', group_key: 'surface', group_label: 'Window type', option_key: 'standard', label: 'Standard', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-type-panes', service_id: 'svc-windows', group_key: 'surface', group_label: 'Window type', option_key: 'many_panes', label: 'Many panes / divided', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-type-storm', service_id: 'svc-windows', group_key: 'surface', group_label: 'Window type', option_key: 'storm', label: 'Storm / difficult', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '2_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-windows', approval_status: 'approved', rate: 9, minimum: 149 }
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
  { id: 'm1', service_id: 'svc-windows', section_id: 'sec-1', label: 'Front ground standard', quantity: 10, unit: 'each', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-type-std' }, { modifier_id: 'm-scope-ext' }], job_measurement_addons: [] },
  { id: 'm2', service_id: 'svc-windows', section_id: 'sec-2', label: 'Rear upper standard', quantity: 7, unit: 'each', notes: '2 upper rear windows blocked by deck roof', review_required: false, measurement_modifiers: [{ modifier_id: 'm-type-std' }, { modifier_id: 'm-scope-ext' }], job_measurement_addons: [] },
  { id: 'm3', service_id: 'svc-windows', section_id: 'sec-1', label: 'Front many-pane bay', quantity: 2, unit: 'each', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-type-panes' }, { modifier_id: 'm-scope-ext' }], job_measurement_addons: [] },
  { id: 'm4', service_id: 'svc-windows', section_id: 'sec-2', label: 'Rear storm windows', quantity: 3, unit: 'each', notes: null, review_required: true, review_reason: 'Storm windows painted shut -- confirm they open before quoting full clean', measurement_modifiers: [{ modifier_id: 'm-type-storm' }, { modifier_id: 'm-scope-ext' }], job_measurement_addons: [] }
];
const pricing = [
  { service_id: 'svc-windows', amount: 155.61, unit_rate: 9, minimum_applied: false }
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
  }, { services: [WINDOWS], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: `/tmp/claude-0/windows-calculator-${label}.png`, fullPage: true });
  await browser.close();
  console.log(`Saved ${label} (${width}px).`);
}

async function main() {
  await shootAt(420, 'mobile');
  await shootAt(820, 'tablet');
  await shootAt(1400, 'desktop');
}

main().catch((err) => { console.error(err); process.exit(1); });
