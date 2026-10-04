import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8743';

const FAKE_CAPACITOR_CORE = `export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };`;
const FAKE_SUPABASE = `export const supabase = { auth: { signOut: async () => {} } }; export async function getSession() { return { session: null, isAdmin: false }; }`;

const WPC = { id: 'svc-wpc', key: 'winter_property_care', name: 'Walkway, Step & Deck Snow Removal', unit: 'each', category: 'winter', quotable: true, active: true, parent_key: null };

const MODIFIERS = [
  { id: 'm-acc-easy', service_id: 'svc-wpc', group_key: 'access', group_label: 'Access', option_key: 'easy', label: 'Easy', kind: 'multiplier', value: 1, is_default: true, sort_order: 20 },
  { id: 'm-acc-normal', service_id: 'svc-wpc', group_key: 'access', group_label: 'Access', option_key: 'normal', label: 'Normal', kind: 'multiplier', value: 1.1, is_default: false, sort_order: 21 },
  { id: 'm-acc-difficult', service_id: 'svc-wpc', group_key: 'access', group_label: 'Access', option_key: 'difficult', label: 'Difficult - tight or terraced', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 22 },
  { id: 'm-acc-vdifficult', service_id: 'svc-wpc', group_key: 'access', group_label: 'Access', option_key: 'very_difficult', label: 'Very difficult', kind: 'multiplier', value: 1.45, is_default: false, sort_order: 23 },
  { id: 'm-height-ground', service_id: 'svc-wpc', group_key: 'height', group_label: 'Height', option_key: '1_storey', label: 'Ground level', kind: 'multiplier', value: 1, is_default: true, sort_order: 10 },
  { id: 'm-scope-walkway', service_id: 'svc-wpc', group_key: 'scope', group_label: 'What is cleared', option_key: 'walkway', label: 'Walkway only', kind: 'multiplier', value: 1, is_default: true, sort_order: 30 },
  { id: 'm-scope-steps', service_id: 'svc-wpc', group_key: 'scope', group_label: 'What is cleared', option_key: 'walk_steps', label: 'Walkway + steps', kind: 'multiplier', value: 1.25, is_default: false, sort_order: 31 },
  { id: 'm-scope-deck', service_id: 'svc-wpc', group_key: 'scope', group_label: 'What is cleared', option_key: 'walk_steps_deck', label: 'Walkway + steps + deck', kind: 'multiplier', value: 1.55, is_default: false, sort_order: 32 },
  { id: 'm-scope-all', service_id: 'svc-wpc', group_key: 'scope', group_label: 'What is cleared', option_key: 'all_paths', label: 'All paths + deck', kind: 'multiplier', value: 1.8, is_default: false, sort_order: 33 },
  { id: 'm-surf-concrete', service_id: 'svc-wpc', group_key: 'surface', group_label: 'Surface', option_key: 'concrete', label: 'Concrete / pavers', kind: 'multiplier', value: 1, is_default: true, sort_order: 40 },
  { id: 'm-surf-wood', service_id: 'svc-wpc', group_key: 'surface', group_label: 'Surface', option_key: 'wood_deck', label: 'Wood deck - gentle clearing', kind: 'multiplier', value: 1.15, is_default: false, sort_order: 41 },
  { id: 'm-surf-mixed', service_id: 'svc-wpc', group_key: 'surface', group_label: 'Surface', option_key: 'mixed', label: 'Mixed / uneven', kind: 'multiplier', value: 1.2, is_default: false, sort_order: 42 },
  { id: 'm-salt-none', service_id: 'svc-wpc', group_key: 'salting', group_label: 'Salting', option_key: 'none', label: 'No salting', kind: 'flat', value: 0, is_default: true, sort_order: 50 },
  { id: 'm-salt-asneeded', service_id: 'svc-wpc', group_key: 'salting', group_label: 'Salting', option_key: 'as_needed', label: 'Salt as needed', kind: 'flat', value: 18, is_default: false, sort_order: 51 },
  { id: 'm-salt-every', service_id: 'svc-wpc', group_key: 'salting', group_label: 'Salting', option_key: 'every_visit', label: 'Salt every visit', kind: 'flat', value: 30, is_default: false, sort_order: 52 }
];

const SECTIONS = [
  { id: 'sec-1', name: 'Front entrance', storeys: '1_storey', access: 'normal', ground: 'flat', ladder: 'normal', distance: 'close' },
  { id: 'sec-2', name: 'Garage path', storeys: '1_storey', access: 'difficult', ground: 'flat', ladder: 'normal', distance: 'close' }
];

const PRICING_RULES = [
  { service_id: 'svc-wpc', approval_status: 'provisional', rate: 55, minimum: 45 }
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
  {
    id: 'm1', service_id: 'svc-wpc', section_id: 'sec-1', label: 'Front entrance', quantity: 4, unit: 'each', notes: null,
    review_required: false,
    measurement_modifiers: [{ modifier_id: 'm-scope-deck' }, { modifier_id: 'm-surf-concrete' }, { modifier_id: 'm-salt-every' }],
    job_measurement_addons: []
  },
  {
    id: 'm2', service_id: 'svc-wpc', section_id: 'sec-2', label: 'Garage path', quantity: 6, unit: 'each',
    notes: 'Narrow path beside the fence, confirm clearing width on site',
    review_required: true, review_reason: 'Unusual deck configuration, confirm clearing path on site',
    measurement_modifiers: [{ modifier_id: 'm-scope-walkway' }, { modifier_id: 'm-surf-wood' }, { modifier_id: 'm-salt-asneeded' }],
    job_measurement_addons: []
  }
];
const pricing = [
  { service_id: 'svc-wpc', amount: 1007.28, unit_rate: 55, minimum_applied: false }
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
  }, { services: [WPC], modifiers: MODIFIERS, sections: SECTIONS, pricingRules: PRICING_RULES, measurements, pricing });

  await page.waitForTimeout(150);
  await page.screenshot({ path: `/tmp/claude-0/winter-calculator-${label}.png`, fullPage: true });
  await browser.close();
  console.log(`Saved ${label} (${width}px).`);
}

async function main() {
  await shootAt(420, 'mobile');
  await shootAt(820, 'tablet');
  await shootAt(1400, 'desktop');
}

main().catch((err) => { console.error(err); process.exit(1); });
