import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const DECK = { id: 'svc-deck', key: 'deck', name: 'Deck / Wood Cleaning', unit: 'sq_ft', category: 'cleaning', quotable: true, active: true, parent_key: null };

const MODIFIERS = [
  { id: 'm-acc-easy', service_id: 'svc-deck', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-acc-normal', service_id: 'svc-deck', group_key: 'access', group_label: 'Access', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 2 },
  { id: 'm-acc-diff', service_id: 'svc-deck', group_key: 'access', group_label: 'Access', option_key: 'difficult', label: 'Difficult', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 3 },
  { id: 'm-cond-light', service_id: 'svc-deck', group_key: 'condition', group_label: 'Condition', option_key: 'light', label: 'Light', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-cond-normal', service_id: 'svc-deck', group_key: 'condition', group_label: 'Condition', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 2 },
  { id: 'm-cond-heavy', service_id: 'svc-deck', group_key: 'condition', group_label: 'Condition', option_key: 'heavy', label: 'Heavy buildup', kind: 'multiplier', value: 1.3, is_default: false, sort_order: 3 },
  { id: 'm-cond-weathered', service_id: 'svc-deck', group_key: 'condition', group_label: 'Condition', option_key: 'very_weathered', label: 'Very weathered', kind: 'multiplier', value: 1.45, is_default: false, sort_order: 4 },
  { id: 'm-mat-wood', service_id: 'svc-deck', group_key: 'surface', group_label: 'Material', option_key: 'wood', label: 'Wood', kind: 'multiplier', value: 1, is_default: true, sort_order: 1 },
  { id: 'm-mat-composite', service_id: 'svc-deck', group_key: 'surface', group_label: 'Material', option_key: 'composite', label: 'Composite', kind: 'multiplier', value: 0.9, is_default: false, sort_order: 2 },
  { id: 'm-mat-older', service_id: 'svc-deck', group_key: 'surface', group_label: 'Material', option_key: 'older_wood', label: 'Older / delicate wood', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 3 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Main deck', storeys: '1_storey', access: 'easy', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Upper deck', storeys: '2_storey', access: 'difficult', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-deck', approval_status: 'approved', rate: 0.5, minimum: 199 }
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
  { id: 'm1', service_id: 'svc-deck', section_id: 'sec-1', label: 'Main Deck and Attached Sun Platform', quantity: 420, unit: 'sq_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-cond-normal' }, { modifier_id: 'm-mat-wood' }], job_measurement_addons: [] },
  { id: 'm2', service_id: 'svc-deck', section_id: 'sec-2', label: 'Upper Deck', quantity: 180, unit: 'sq_ft', notes: null, review_required: false, measurement_modifiers: [{ modifier_id: 'm-cond-light' }, { modifier_id: 'm-mat-composite' }], job_measurement_addons: [] },
  { id: 'm3', service_id: 'svc-deck', section_id: 'sec-1', label: 'Rear Platform', quantity: 120, unit: 'sq_ft', notes: 'Stairs lead to lower yard, not separately measured', review_required: false, measurement_modifiers: [{ modifier_id: 'm-cond-weathered' }, { modifier_id: 'm-mat-older' }], job_measurement_addons: [] },
  { id: 'm4', service_id: 'svc-deck', section_id: 'sec-2', label: 'Walkout Deck Section', quantity: 90, unit: 'sq_ft', notes: null, review_required: true, review_reason: 'Loose board near railing post -- confirm safe before cleaning', measurement_modifiers: [{ modifier_id: 'm-cond-heavy' }, { modifier_id: 'm-mat-wood' }], job_measurement_addons: [] }
];
const pricing = [
  { service_id: 'svc-deck', amount: 427.55, unit_rate: 0.5, minimum_applied: false }
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
  }, { services: [DECK], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: `/tmp/claude-0/deck-calculator-${label}.png`, fullPage: true });
  await browser.close();
  console.log(`Saved ${label} (${width}px).`);
}

async function main() {
  await shootAt(420, 'mobile');
  await shootAt(820, 'tablet');
  await shootAt(1400, 'desktop');
}

main().catch((err) => { console.error(err); process.exit(1); });
