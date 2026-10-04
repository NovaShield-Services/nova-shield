/** Groups a service's active pricing_modifiers by group_key, excluding the
 *  section-driven ones (height/access) every specialized and generic
 *  measurement editor already renders via the section/elevation picker
 *  instead -- duplicating them per-row is what let the old calculator risk
 *  charging twice for the same condition. Shared by the generic measurement
 *  editor and every specialized calculator so "which groups count as
 *  section-driven" has exactly one answer.
 *
 *  This exclusion is purely a name match on group_key, not a check that the
 *  group's option_keys actually line up with job_sections.storeys/access.
 *  'fence' (Phase 10) originally had a group literally named 'height' whose
 *  options (standard/tall/very_tall) were the fence's own panel height, not
 *  a storey count -- it got excluded here same as every genuine
 *  section-driven group, but calculate_job_pricing's own hardcoded
 *  `group_key not in ('height','access')` also meant that group could never
 *  affect price via the row path either, so it was silently inert
 *  (confirmed empirically, not rendered anywhere). Phase 10.5 fixed this at
 *  the data layer by re-keying fence's rows to group_key='fence_height',
 *  which doesn't match this set, so fence's height now groups and prices
 *  normally like any other row-level modifier. This set itself stays
 *  exactly ['height', 'access'] -- unchanged and still global across every
 *  service -- because the fix was to stop fence's group from colliding
 *  with the name, not to change what the name excludes. See
 *  fence-cleaning-calculator.js's file header for the full history. */
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
