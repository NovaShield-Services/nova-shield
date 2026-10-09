import * as api from '../lib/api.js';
import { el, select, confirmAction, toast } from '../../../shared/dom.js';
import { qty, unitLabel } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Graffiti Removal's own calculator -- an area service (sq_ft), but NOT
 *  Moss Removal with the labels changed. Real configured modifiers:
 *  "Difficulty" (group_key 'condition' -- Fresh / Set-in / Old-multiple-
 *  layers, 1.0/1.25/1.5, per-area: a difficult rear wall must not make an
 *  easy front wall difficult) and "Surface" (Painted / Brick / Delicate,
 *  per-area). There is NO `scope` group configured for this service at
 *  all -- unlike Moss's job-wide Follow-up, nothing here describes "the
 *  whole visit," so there is deliberately no job-wide control. That is a
 *  real finding from the actual configured groups, not an oversight: the
 *  Phase 11 Moss pattern does not apply here just because both are
 *  sq_ft area services.
 *
 *  Access (Easy / Normal / Difficult) is configured and genuine --
 *  empirically verified against the real database before writing this
 *  component (a rolled-back probe attaching no row-level modifier at all
 *  confirmed section_service_mult still returns the correct 1.10/1.20
 *  factor purely from job_sections.access), same check the Fence Height
 *  mistake should always have had. There is no Height group at all for
 *  this service. modifierGroupsFor already excludes Access from the
 *  controls below; it reaches price through the existing section/
 *  Property Layout picker, not through any code in this file.
 *
 *  AFFECTED AREA, NOT WHOLE WALL: the real price book has no separate
 *  "total wall area" or coverage-percentage concept -- quantity IS the
 *  square footage entered directly, and at $0.75/sq ft (markedly higher
 *  than most other area services here) mislabeling this as the whole
 *  wall rather than the actual tagged area would risk a dramatic
 *  overcharge. So the quantity field is explicitly labelled "Affected
 *  area (sq ft)" with a hint reinforcing the distinction, the same
 *  reasoning already established for Moss Removal -- not copied from it,
 *  but the same real risk independently leading to the same answer.
 *
 *  No child services are configured (no parent_key='graffiti' rows) and
 *  no flat-kind modifiers exist for this service, so there is no addon
 *  control here either.
 *
 *  Duplicate is implemented: an affected area's square footage is a real
 *  starting estimate worth copying to a similarly sized nearby tag, the
 *  same reasoning already established for every other area-based
 *  calculator -- copies section, square footage, and modifier selections
 *  (Difficulty/Surface); never review_required/review_reason/notes. */

export function createGraffitiRemovalCalculator({ job, service, refs, measurements, onChange, createMeasurement, quantityInput }) {
  const rows = measurements.filter((m) => m.service_id === service.id);
  const allGroups = modifierGroupsFor(refs.modifiers, service.id);

  async function pickOrCreateSection(currentId) {
    if (refs.sections.length === 0) {
      const name = window.prompt('No sections on this property yet. Name this one (e.g. "Front wall"):');
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
      [{ value: '', label: 'No section' },
       ...refs.sections.map((s) => ({ value: s.id, label: `${s.name} (${s.access} access)` })),
       { value: NEW_SECTION, label: '+ New section…' }],
      measurement.section_id || '',
      async (e) => {
        let value = e.target.value;
        if (value === NEW_SECTION) {
          const name = window.prompt('Name this section (e.g. "Garage side"):');
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

  function affectedAreaRow(measurement) {
    const section = refs.sections.find((s) => s.id === measurement.section_id);
    const qtyInput = quantityInput(measurement, { step: '1', 'aria-label': 'Affected area (sq ft)' });

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
      placeholder: 'Notes (e.g. "coating appears delicate, additional photo required")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', style: 'flex:1;min-width:120px',
          placeholder: 'e.g. Front wall', 'aria-label': 'Affected area name',
          onChange: async (e) => { await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || 'Affected area' }); }
        }),
        el('button', { class: 'btn btn--sm', text: 'Duplicate', type: 'button', onClick: () => duplicateArea(measurement) }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove this affected area?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Affected area (sq ft)' }), qtyInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Section' }), sectionSelectFor(measurement)])
      ]),
      el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: 'Measure only the graffiti itself, not the whole wall -- flag below if that’s uncertain.' }),
      section ? el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: `Access comes from "${section.name}" (${section.access} access) -- edit that in Property Layout, not here.` }) : null,
      modifierControls.length ? el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, modifierControls) : null,
      el('label', { class: 'field', style: 'margin-top:10px' }, [el('span', { text: 'Notes' }), notesInput]),
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this affected area for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addAffectedArea() {
    const lastSectionId = rows.length ? rows[rows.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: sectionId, unit: service.unit,
      quantity: 0, label: 'Affected area', sort_order: measurements.length + 1
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

  async function duplicateArea(measurement) {
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: measurement.section_id, unit: measurement.unit,
      quantity: measurement.quantity, label: `${measurement.label || 'Affected area'} (copy)`,
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
        text: 'Affected areas' }),
      rows.length
        ? el('span', { class: 'hint', style: 'margin:0',
            text: `${qty(totalSqFt)} ${unitLabel(service.unit)} total across ${rows.length} affected area${rows.length === 1 ? '' : 's'}` })
        : null
    ]),
    ...rows.map((m) => affectedAreaRow(m)),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add affected area', onClick: addAffectedArea })
    ])
  ].filter(Boolean));
}
