/** Groups a service's active pricing_modifiers by group_key, excluding the
 *  section-driven ones (height/access) every specialized and generic
 *  measurement editor already renders via the section/elevation picker
 *  instead -- duplicating them per-row is what let the old calculator risk
 *  charging twice for the same condition. Shared by the generic measurement
 *  editor and every specialized calculator so "which groups count as
 *  section-driven" has exactly one answer.
 *
 *  This exclusion is purely a name match on group_key, not a check that the
 *  group's option_keys actually line up with job_sections.storeys/access --
 *  'fence' (Phase 10) has a real group literally named 'height' whose
 *  options (standard/tall/very_tall) are the fence's own panel height, not
 *  a storey count, so it gets excluded here same as every genuine
 *  section-driven group, but calculate_job_pricing's own hardcoded
 *  `group_key not in ('height','access')` also means that group can never
 *  affect price via the row path either -- confirmed empirically, not
 *  rendered anywhere. See fence-cleaning-calculator.js's file header for
 *  the full finding. Exclusion-by-name happens to produce the safe UI
 *  outcome here (no broken control shown) for a different reason than why
 *  it's safe for every other service. */
const SECTION_DRIVEN_GROUPS = new Set(['height', 'access']);

export function modifierGroupsFor(modifiers, serviceId) {
  const groups = new Map();
  for (const m of modifiers) {
    if (m.service_id !== serviceId) continue;
    if (SECTION_DRIVEN_GROUPS.has(m.group_key)) continue;
    if (!groups.has(m.group_key)) groups.set(m.group_key, { key: m.group_key, label: m.group_label, options: [] });
    groups.get(m.group_key).options.push(m);
  }
  return [...groups.values()];
}
