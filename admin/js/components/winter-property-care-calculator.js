import * as api from '../lib/api.js';
import { el, select, confirmAction, toast } from '../../../shared/dom.js';
import { qty, money, unitLabel } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Winter Property Care ("Walkway, Step & Deck Snow Removal") -- a
 *  visit-based service (unit='each'), not a square-foot or linear-foot
 *  one. The real price book answers every structural question this
 *  service could have raised:
 *
 *  - "Walkway / Steps / Deck" are NOT separate measurements or child
 *    services -- they are four cumulative tiers of one real multiplier
 *    group, group_key='scope', labelled "What is cleared": Walkway only
 *    (1.0) / +steps (1.25) / +steps+deck (1.55) / All paths+deck (1.8).
 *    Per-row, not job-wide: a property's front entrance and a separate
 *    detached structure can legitimately need different scope, unlike
 *    Gutter Brightening's or Fence's genuinely whole-visit controls.
 *  - "Tight access" is NOT a separate concept -- it is literally one
 *    tier of the real Access group ("Difficult - tight or terraced",
 *    1.25), section-driven like every other service's Access, and
 *    empirically verified live against the real database before writing
 *    this file (a rolled-back probe with no row-level modifier attached
 *    confirmed the correct 1.10/1.45 factors purely from
 *    job_sections.access).
 *  - Height is configured but has exactly one real option ("Ground
 *    level", 1.0, always default) -- a real, section-driven group that
 *    happens to never vary for ground-level walkway/step/deck work. It
 *    is excluded from the per-row controls below by modifierGroupsFor
 *    like every other service's Height; nothing here needs to treat it
 *    specially beyond the section hint already covering it.
 *  - "De-icing" is the real "Salting" group: flat-kind (no salting $0 /
 *    salt as needed +$18 / salt every visit +$30), per-row, rendered
 *    with the same $-suffix convention Concrete's flat options use.
 *    It is not a child service and not linked to Heating Wire Installation
 *    (a completely separate, already-implemented service for physical
 *    de-icing cable).
 *  - Surface (Concrete/pavers, Wood deck, Mixed/uneven) is per-row.
 *
 *  PROVISIONAL PRICING: this service's pricing_rules row is
 *  approval_status='provisional', not approved. This component changes
 *  nothing about that -- it never writes to pricing_rules -- and relies
 *  entirely on the existing generic Phase 2 mechanism in
 *  measurements.js's renderServiceBlock (badge + hint + stronger
 *  send-confirmation) to communicate that to the field user and to
 *  admin/customer-facing screens. The calculator itself stays usable for
 *  scope/operational planning regardless.
 *
 *  The winter-operations logs shown on the admin Winter page (storm-date
 *  records and per-property clearing records) are separate tables with no
 *  job/quote/measurement linking column at all, and no database trigger
 *  connects job_measurements or quotes to either one (confirmed by
 *  inspection) -- quoting this service can never create or alter a row in
 *  either log.
 *
 *  A "row" here is one service area for the property (most properties
 *  will have exactly one -- "Front entrance" -- but a detached garage
 *  path with different scope/access is a second, independent row).
 *  Quantity is the number of visits being quoted for that area at that
 *  scope, a real count, so it uses a stepper (large touch targets),
 *  the same interaction already established for Window Cleaning's
 *  count-based unit.
 *
 *  Duplicate is implemented: a second service area with a similar
 *  starting scope/access is a real, reasoned use case (e.g. cloning
 *  "Front entrance" as a starting point for "Side entrance"); never
 *  copies review state or notes. */

export function createWinterPropertyCareCalculator({ job, service, refs, measurements, onChange, createMeasurement }) {
  const rows = measurements.filter((m) => m.service_id === service.id);
  const rowGroups = modifierGroupsFor(refs.modifiers, service.id);

  async function pickOrCreateSection(currentId) {
    if (refs.sections.length === 0) {
      const name = window.prompt('No areas on this property yet. Name this one (e.g. "Front entrance"):');
      if (!name) return currentId || null;
      const created = await api.createSection(job.id, { name: name.trim() || 'Section', sort_order: 1 });
      refs.sections.push(created);
      return created.id;
    }
    return currentId;
  }

  function sectionSelectFor(measurement) {
    const NEW_SECTION = '__new__';
    const node = select(
      [{ value: '', label: 'No area' },
       ...refs.sections.map((s) => ({ value: s.id, label: `${s.name} (${s.access} access)` })),
       { value: NEW_SECTION, label: '+ New area…' }],
      measurement.section_id || '',
      async (e) => {
        let value = e.target.value;
        if (value === NEW_SECTION) {
          const name = window.prompt('Name this area (e.g. "Garage path"):');
          if (!name) { node.value = measurement.section_id || ''; return; }
          const created = await api.createSection(job.id, { name: name.trim() || 'Section', sort_order: refs.sections.length + 1 });
          refs.sections.push(created);
          value = created.id;
        }
        await api.updateMeasurement(measurement.id, { section_id: value || null });
        onChange();
      }
    );
    return node;
  }

  function serviceAreaRow(measurement) {
    const section = refs.sections.find((s) => s.id === measurement.section_id);

    let count = measurement.quantity || 0;
    const countLabel = el('strong', { style: 'font-size:1.3rem', text: String(count) });
    const minus = el('button', { class: 'btn btn--sm', text: '−', type: 'button', 'aria-label': 'Fewer visits' });
    const plus = el('button', { class: 'btn btn--sm', text: '+', type: 'button', 'aria-label': 'More visits' });
    async function applyCount(next) {
      next = Math.max(0, next);
      count = next;
      countLabel.textContent = String(next);
      minus.disabled = true; plus.disabled = true;
      try {
        await api.updateMeasurement(measurement.id, { quantity: next });
      } finally {
        minus.disabled = false; plus.disabled = false;
        onChange();
      }
    }
    minus.addEventListener('click', () => applyCount(count - 1));
    plus.addEventListener('click', () => applyCount(count + 1));

    const selectedIds = new Set((measurement.measurement_modifiers || []).map((r) => r.modifier_id));
    const modifierControls = rowGroups.map((group) => {
      const groupIds = group.options.map((o) => o.id);
      const current = group.options.find((o) => selectedIds.has(o.id));
      const defaultOpt = group.options.find((o) => o.is_default);
      return el('label', { class: 'field', style: 'margin:0' }, [
        el('span', { text: group.label }),
        select(
          group.options.map((o) => ({
            value: o.id,
            label: o.kind === 'flat' && Number(o.value) > 0 ? `${o.label} (+${money(o.value)})` : o.label
          })),
          current?.id || defaultOpt?.id || '',
          async (e) => { await api.setMeasurementModifier(measurement.id, groupIds, e.target.value); onChange(); }
        )
      ]);
    });

    const notesInput = el('input', {
      value: measurement.notes || '',
      placeholder: 'Notes (e.g. "unusual deck configuration, confirm clearing path on site")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', style: 'flex:1;min-width:120px',
          placeholder: 'e.g. Front entrance', 'aria-label': 'Service area name',
          onChange: async (e) => { await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || 'Service area' }); }
        }),
        el('button', { class: 'btn btn--sm', text: 'Duplicate', type: 'button', onClick: () => duplicateArea(measurement) }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove this service area?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [
          el('span', { text: 'Visits this season' }),
          el('div', { style: 'display:flex;align-items:center;gap:12px;margin-top:4px' }, [minus, countLabel, plus])
        ]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Area' }), sectionSelectFor(measurement)])
      ]),
      section ? el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: `Height/access come from "${section.name}" (${(section.storeys || '1_storey').replace('_', ' ')}, ${section.access} access) -- edit those in Property Layout, not here.` }) : null,
      modifierControls.length ? el('div', { class: 'grid grid--3', style: 'margin-top:10px' }, modifierControls) : null,
      el('label', { class: 'field', style: 'margin-top:10px' }, [el('span', { text: 'Notes' }), notesInput]),
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this service area for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addServiceArea() {
    const lastSectionId = rows.length ? rows[rows.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: sectionId, unit: service.unit,
      quantity: 0, label: 'Service area', sort_order: measurements.length + 1
    });
    if (created) {
      for (const group of rowGroups) {
        const def = group.options.find((o) => o.is_default);
        if (def) await api.setMeasurementModifier(created.id, group.options.map((o) => o.id), def.id);
      }
    } else {
      toast('Offline — saved locally, will sync automatically');
    }
    onChange();
  }

  async function duplicateArea(measurement) {
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: measurement.section_id, unit: measurement.unit,
      quantity: measurement.quantity, label: `${measurement.label || 'Service area'} (copy)`,
      sort_order: measurements.length + 1
    });
    if (!created) { toast('Offline — saved locally, will sync automatically'); onChange(); return; }

    const selectedIds = (measurement.measurement_modifiers || []).map((r) => r.modifier_id);
    for (const group of rowGroups) {
      const current = group.options.find((o) => selectedIds.includes(o.id));
      if (current) await api.setMeasurementModifier(created.id, group.options.map((o) => o.id), current.id);
    }
    onChange();
  }

  const totalVisits = rows.reduce((sum, m) => sum + Number(m.quantity || 0), 0);

  return el('div', {}, [
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px' }, [
      el('h3', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0',
        text: 'Service areas' }),
      rows.length
        ? el('span', { class: 'hint', style: 'margin:0',
            text: `${qty(totalVisits)} ${unitLabel(service.unit)} total across ${rows.length} service area${rows.length === 1 ? '' : 's'}` })
        : null
    ]),
    ...rows.map((m) => serviceAreaRow(m)),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add service area', onClick: addServiceArea })
    ])
  ].filter(Boolean));
}
