import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const GRAFFITI = { id: 'svc-graffiti', key: 'graffiti', name: 'Graffiti Removal', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };

const MODIFIERS = [
  { id: 'm-access-easy', service_id: 'svc-graffiti', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-access-normal', service_id: 'svc-graffiti', group_key: 'access', group_label: 'Access', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-access-difficult', service_id: 'svc-graffiti', group_key: 'access', group_label: 'Access', option_key: 'difficult', label: 'Difficult', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 3 },
  { id: 'm-diff-fresh', service_id: 'svc-graffiti', group_key: 'condition', group_label: 'Difficulty', option_key: 'fresh', label: 'Fresh', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-diff-setin', service_id: 'svc-graffiti', group_key: 'condition', group_label: 'Difficulty', option_key: 'set_in', label: 'Set-in', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 2 },
  { id: 'm-diff-old', service_id: 'svc-graffiti', group_key: 'condition', group_label: 'Difficulty', option_key: 'old_multiple', label: 'Old / multiple layers', kind: 'multiplier', value: 1.5, is_default: false, sort_order: 3 },
  { id: 'm-surf-painted', service_id: 'svc-graffiti', group_key: 'surface', group_label: 'Surface', option_key: 'painted', label: 'Painted', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-surf-brick', service_id: 'svc-graffiti', group_key: 'surface', group_label: 'Surface', option_key: 'brick', label: 'Brick', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-surf-delicate', service_id: 'svc-graffiti', group_key: 'surface', group_label: 'Surface', option_key: 'delicate', label: 'Delicate', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front wall', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Garage side', storeys: '1_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-3', name: 'Rear retaining wall', storeys: '1_storey', access: 'difficult', ground: 'uneven', ladder: 'normal', distance: 'far' }
];

const PRICING_RULES = [
  { service_id: 'svc-graffiti', approval_status: 'approved', rate: 0.75, minimum: 149 }
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
  { id: 'm1', service_id: 'svc-graffiti', section_id: 'sec-1', label: 'Front wall', quantity: 85, unit: 'sq_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-diff-fresh' }, { modifier_id: 'm-surf-painted' }], job_measurement_addons: [] },
  { id: 'm2', service_id: 'svc-graffiti', section_id: 'sec-2', label: 'Garage side', quantity: 42, unit: 'sq_ft', notes: 'Customer wants only visible markings removed', review_required: false, measurement_modifiers: [{ modifier_id: 'm-diff-setin' }, { modifier_id: 'm-surf-brick' }], job_measurement_addons: [] },
  { id: 'm3', service_id: 'svc-graffiti', section_id: 'sec-3', label: 'Rear retaining wall', quantity: 30, unit: 'sq_ft', notes: null, review_required: true, review_reason: 'Coating appears delicate, additional photo required before treatment', measurement_modifiers: [{ modifier_id: 'm-diff-old' }, { modifier_id: 'm-surf-delicate' }], job_measurement_addons: [] }
];
const pricing = [
  { service_id: 'svc-graffiti', amount: 159.99, unit_rate: 0.75, minimum_applied: false }
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
  }, { services: [GRAFFITI], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: `/tmp/claude-0/graffiti-calculator-${label}.png`, fullPage: true });
  await browser.close();
  console.log(`Saved ${label} (${width}px).`);
}

async function main() {
  await shootAt(420, 'mobile');
  await shootAt(820, 'tablet');
  await shootAt(1400, 'desktop');
}

main().catch((err) => { console.error(err); process.exit(1); });
