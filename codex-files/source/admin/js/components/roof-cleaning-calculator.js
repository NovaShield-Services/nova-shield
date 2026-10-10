import * as api from '../lib/api.js';
import { el, select, confirmAction, toast } from '../../../shared/dom.js';
import { qty } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Roof Soft Washing's own calculator. Inspection found this service's
 *  real pricing shape is structurally the SAME cardinality as Siding's:
 *  two section-driven groups (height, access -- both present here, unlike
 *  Concrete which only had access or Windows which only had height) and
 *  two row-driven multiplier groups, no job-wide control and no flat
 *  addon. Forcing a different modifier mechanism onto that -- a fake
 *  third dropdown, an invented job-wide toggle, a child-service split --
 *  would be exactly the kind of made-up complexity every phase so far has
 *  been told not to add. So this is deliberately NOT a different pricing
 *  interaction from Siding's; where it differs is field vocabulary and
 *  language, because that's what the real difference between quoting a
 *  roof and quoting a wall actually is.
 *
 *  Real configured modifiers: Access and Height (section-driven, same
 *  convention as every other service), "Coverage" (group_key 'condition'
 *  -- the label is Coverage, but the real options -- Light streaking /
 *  Normal / Heavy algae-black streaking / Severe-moss present -- are
 *  unambiguously an organic-growth severity scale, not a visit-wide scope
 *  the way Gutter Brightening's or Window Cleaning's job-wide groups
 *  were, so this stays per-section) and "Roof type" (Asphalt shingle /
 *  Metal / Cedar-delicate). No flat-dollar addon group exists for this
 *  service, so none is added here. No child services exist for it either.
 *
 *  The section picker is labelled "Roof section", not "Elevation" --
 *  still the exact same job_sections mechanism every other calculator
 *  uses, just worded for what it actually represents on a roof (a slope/
 *  plane, not a wall elevation). Duplicate is implemented: a roof
 *  section's square footage is a real starting estimate worth copying to
 *  a similarly-sized adjacent section, the same reasoning already
 *  established for Siding, Gutter Brightening and Concrete -- copies
 *  section, square footage, and modifier selections; never
 *  review_required/review_reason/notes, which describe something found
 *  on THIS physical roof section. Language throughout stays factual --
 *  no claims about permanently removing stains or preventing regrowth --
 *  consistent with every other internal tool in this system never
 *  carrying marketing copy. */

export function createRoofCleaningCalculator({ job, service, refs, measurements, onChange, createMeasurement, quantityInput }) {
  const rows = measurements.filter((m) => m.service_id === service.id);
  const allGroups = modifierGroupsFor(refs.modifiers, service.id);

  async function pickOrCreateSection(currentId) {
    if (refs.sections.length === 0) {
      const name = window.prompt('No roof sections on this property yet. Name this one (e.g. "Main roof"):');
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
      [{ value: '', label: 'No roof section' },
       ...refs.sections.map((s) => ({ value: s.id, label: `${s.name} (${(s.storeys || '1_storey').replace('_', ' ')}, ${s.access})` })),
       { value: NEW_SECTION, label: '+ New roof section…' }],
      measurement.section_id || '',
      async (e) => {
        let value = e.target.value;
        if (value === NEW_SECTION) {
          const name = window.prompt('Name this roof section (e.g. "Rear Addition Roof"):');
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

  function roofSectionRow(measurement) {
    const section = refs.sections.find((s) => s.id === measurement.section_id);
    const qtyInput = quantityInput(measurement, { step: '1', 'aria-label': 'Square feet' });

    const selectedIds = new Set((measurement.measurement_modifiers || []).map((r) => r.modifier_id));
    const modifierControls = allGroups.map((group) => {
      const groupIds = group.options.map((o) => o.id);
      const current = group.options.find((o) => selectedIds.has(o.id));
      const defaultOpt = group.options.find((o) => o.is_default);
      return el('label', { class: 'field', style: 'margin:0' }, [
        el('span', { text: group.label }),
        select(
          group.options.map((o) => ({ value: o.id, label: o.label })),
          current?.id || defaultOpt?.id || '',
          async (e) => { await api.setMeasurementModifier(measurement.id, groupIds, e.target.value); onChange(); }
        )
      ]);
    });

    const notesInput = el('input', {
      value: measurement.notes || '',
      placeholder: 'Notes (e.g. "skylight penetrations, measure around")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', style: 'flex:1;min-width:120px',
          placeholder: 'e.g. Main Front Slope', 'aria-label': 'Roof section name',
          onChange: async (e) => { await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || 'Roof section' }); }
        }),
        el('button', { class: 'btn btn--sm', text: 'Duplicate', type: 'button', onClick: () => duplicateSection(measurement) }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove this roof section?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Square feet' }), qtyInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Roof section' }), sectionSelectFor(measurement)])
      ]),
      section ? el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: `Height/access come from "${section.name}" (${(section.storeys || '1_storey').replace('_', ' ')}, ${section.access} access) -- ` +
              'edit those in Property Layout, not here.' }) : null,
      modifierControls.length ? el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, modifierControls) : null,
      el('label', { class: 'field', style: 'margin-top:10px' }, [el('span', { text: 'Notes' }), notesInput]),
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this roof section for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addRoofSection() {
    const lastSectionId = rows.length ? rows[rows.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: sectionId, unit: service.unit,
      quantity: 0, label: 'Roof section', sort_order: measurements.length + 1
    });
    if (created) {
      for (const group of allGroups) {
        const def = group.options.find((o) => o.is_default);
        if (def) await api.setMeasurementModifier(created.id, group.options.map((o) => o.id), def.id);
      }
    } else {
      toast('Offline — saved locally, will sync automatically');
    }
    onChange();
  }

  async function duplicateSection(measurement) {
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: measurement.section_id, unit: measurement.unit,
      quantity: measurement.quantity, label: `${measurement.label || 'Roof section'} (copy)`,
      sort_order: measurements.length + 1
    });
    if (!created) { toast('Offline — saved locally, will sync automatically'); onChange(); return; }

    const selectedIds = (measurement.measurement_modifiers || []).map((r) => r.modifier_id);
    for (const group of allGroups) {
      const current = group.options.find((o) => selectedIds.includes(o.id));
      if (current) await api.setMeasurementModifier(created.id, group.options.map((o) => o.id), current.id);
    }
    onChange();
  }

  const totalSqFt = rows.reduce((sum, m) => sum + Number(m.quantity || 0), 0);

  return el('div', {}, [
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px' }, [
      el('h3', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0',
        text: 'Roof sections' }),
      rows.length
        ? el('span', { class: 'hint', style: 'margin:0',
            text: `${qty(totalSqFt)} sq ft total across ${rows.length} roof section${rows.length === 1 ? '' : 's'}` })
        : null
    ]),
    ...rows.map((m) => roofSectionRow(m)),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add roof section', onClick: addRoofSection })
    ])
  ]);
}
