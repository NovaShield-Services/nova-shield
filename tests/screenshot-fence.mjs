import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const FENCE = { id: 'svc-fence', key: 'fence', name: 'Fence Cleaning', unit: 'linear_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };

const MODIFIERS = [
  { id: 'm-cond-light', service_id: 'svc-fence', group_key: 'condition', group_label: 'Condition', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-normal', service_id: 'svc-fence', group_key: 'condition', group_label: 'Condition', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-cond-heavy', service_id: 'svc-fence', group_key: 'condition', group_label: 'Condition', option_key: 'heavy', label: 'Heavy', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 3 },
  { id: 'm-height-standard', service_id: 'svc-fence', group_key: 'fence_height', group_label: 'Height', option_key: 'standard', label: 'Standard', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-height-tall', service_id: 'svc-fence', group_key: 'fence_height', group_label: 'Height', option_key: 'tall', label: 'Tall', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-height-vtall', service_id: 'svc-fence', group_key: 'fence_height', group_label: 'Height', option_key: 'very_tall', label: 'Very tall', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 3 },
  { id: 'm-sides-one', service_id: 'svc-fence', group_key: 'scope', group_label: 'Sides', option_key: 'one', label: 'One side', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-sides-both', service_id: 'svc-fence', group_key: 'scope', group_label: 'Sides', option_key: 'both', label: 'Both sides', kind: 'multiplier', value: 1.8, is_default: false, sort_order: 2 },
  { id: 'm-mat-vinyl', service_id: 'svc-fence', group_key: 'surface', group_label: 'Material', option_key: 'vinyl', label: 'Vinyl', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-mat-metal', service_id: 'svc-fence', group_key: 'surface', group_label: 'Material', option_key: 'metal', label: 'Metal', kind: 'multiplier', value: 1.05, is_default: false, sort_order: 2 },
  { id: 'm-mat-wood', service_id: 'svc-fence', group_key: 'surface', group_label: 'Material', option_key: 'wood', label: 'Wood', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 3 },
  { id: 'm-mat-older', service_id: 'svc-fence', group_key: 'surface', group_label: 'Material', option_key: 'older_wood', label: 'Older / delicate wood', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 4 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Rear', storeys: '1_storey', access: 'easy', ground: 'sloped', ladder: 'normal', distance: 'far' }
];

const PRICING_RULES = [
  { service_id: 'svc-fence', approval_status: 'approved', rate: 2, minimum: 149 }
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
  { id: 'm1', service_id: 'svc-fence', section_id: 'sec-1', label: 'Front Fence Along Driveway', quantity: 80, unit: 'linear_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-cond-normal' }, { modifier_id: 'm-mat-vinyl' }, { modifier_id: 'm-sides-both' }, { modifier_id: 'm-height-standard' }], job_measurement_addons: [] },
  { id: 'm2', service_id: 'svc-fence', section_id: 'sec-2', label: 'Rear Fence', quantity: 120, unit: 'linear_ft', notes: '6ft privacy fence, gate at east corner', review_required: false, measurement_modifiers: [{ modifier_id: 'm-cond-heavy' }, { modifier_id: 'm-mat-wood' }, { modifier_id: 'm-sides-both' }, { modifier_id: 'm-height-tall' }], job_measurement_addons: [] },
  { id: 'm3', service_id: 'svc-fence', section_id: 'sec-1', label: 'Side Fence', quantity: 65, unit: 'linear_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-cond-light' }, { modifier_id: 'm-mat-metal' }, { modifier_id: 'm-sides-both' }, { modifier_id: 'm-height-vtall' }], job_measurement_addons: [] },
  { id: 'm4', service_id: 'svc-fence', section_id: 'sec-2', label: 'Detached Enclosure Fence', quantity: 40, unit: 'linear_ft', notes: null, review_required: true, review_reason: 'Several panels look rotted -- confirm safe to pressure wash before scheduling', measurement_modifiers: [{ modifier_id: 'm-cond-heavy' }, { modifier_id: 'm-mat-older' }, { modifier_id: 'm-sides-both' }, { modifier_id: 'm-height-tall' }], job_measurement_addons: [] }
];
const pricing = [
  { service_id: 'svc-fence', amount: 804.42, unit_rate: 2, minimum_applied: false }
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
  }, { services: [FENCE], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: `/tmp/claude-0/fence-calculator-${label}.png`, fullPage: true });
  await browser.close();
  console.log(`Saved ${label} (${width}px).`);
}

async function main() {
  await shootAt(420, 'mobile');
  await shootAt(820, 'tablet');
  await shootAt(1400, 'desktop');
}

main().catch((err) => { console.error(err); process.exit(1); });
