/** Groups a service's active pricing_modifiers by group_key, excluding the
 *  section-driven ones (height/access) every specialized and generic
 *  measurement editor already renders via the section/elevation picker
 *  instead -- duplicating them per-row is what let the old calculator risk
 *  charging twice for the same condition. Shared by the generic measurement
 *  editor and every specialized calculator so "which groups count as
 *  section-driven" has exactly one answer. */
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
