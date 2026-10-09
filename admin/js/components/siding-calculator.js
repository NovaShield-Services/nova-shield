import * as api from '../lib/api.js';
import { el, select, confirmAction, toast } from '../../../shared/dom.js';
import { qty, unitLabel } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Siding Washing's own calculator -- a wall-area service, not a linear or
 *  countable one. A job_measurements row IS a wall/elevation section; there
 *  is no separate "siding" table. Unlike heating wire, siding has no child
 *  services and no authorization-only field -- its real complexity is
 *  mixed elevations each needing their own square footage and their own
 *  condition/surface read, which the generic measurement editor already
 *  handles per-row. What it's missing -- a visible notes field, a way to
 *  duplicate a section, and a plain square-footage total -- is what this
 *  file actually adds; everything else (section/height/access, modifiers,
 *  review flag, pricing) is the same shared machinery heating wire uses,
 *  not a parallel implementation of it. Nothing here computes a dollar
 *  figure: the card showing this component already got its total from
 *  calculate_job_pricing before this ever renders. */

export function createSidingCalculator({ job, service, refs, measurements, onChange, createMeasurement, quantityInput }) {
  const rows = measurements.filter((m) => m.service_id === service.id);

  async function pickOrCreateSection(currentId) {
    if (refs.sections.length === 0) {
      const name = window.prompt('No elevations on this property yet. Name this one (e.g. "Front"):');
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
      [{ value: '', label: 'No elevation' },
       ...refs.sections.map((s) => ({ value: s.id, label: `${s.name} (${(s.storeys || '1_storey').replace('_', ' ')}, ${s.access})` })),
       { value: NEW_SECTION, label: '+ New elevation…' }],
      measurement.section_id || '',
      async (e) => {
        let value = e.target.value;
        if (value === NEW_SECTION) {
          const name = window.prompt('Name this elevation (e.g. "Addition"):');
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

  function wallRow(measurement) {
    const section = refs.sections.find((s) => s.id === measurement.section_id);
    const qtyInput = quantityInput(measurement, { step: '1', 'aria-label': 'Square feet' });

    const selectedIds = new Set((measurement.measurement_modifiers || []).map((r) => r.modifier_id));
    const modifierControls = modifierGroupsFor(refs.modifiers, service.id).map((group) => {
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
      placeholder: 'Notes (e.g. "stucco accent band, treat separately")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', style: 'max-width:200px',
          placeholder: 'e.g. Front', 'aria-label': 'Wall name',
          onChange: async (e) => { await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || 'Wall section' }); }
        }),
        el('button', {
          class: 'btn btn--sm', text: 'Duplicate', type: 'button',
          onClick: () => duplicateRow(measurement)
        }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove this wall section?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Square feet' }), qtyInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Elevation' }), sectionSelectFor(measurement)])
      ]),
      section ? el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: `Height/access come from "${section.name}" (${(section.storeys || '1_storey').replace('_', ' ')}, ${section.access} access) -- ` +
              'edit those in Property Layout, not here.' }) : null,
      modifierControls.length ? el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, modifierControls) : null,
      el('label', { class: 'field', style: 'margin-top:10px' }, [el('span', { text: 'Notes' }), notesInput]),
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this wall for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addWall() {
    // Same courtesy as heating wire's eave/downspout runs: default to
    // whichever elevation the last-added wall used, since siding and
    // heating wire were both measured on the same walk around the house.
    const lastSectionId = rows.length ? rows[rows.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: sectionId, unit: service.unit,
      quantity: 0, label: 'Wall section', sort_order: measurements.length + 1
    });
    if (created) {
      for (const group of modifierGroupsFor(refs.modifiers, service.id)) {
        const def = group.options.find((o) => o.is_default);
        if (def) await api.setMeasurementModifier(created.id, [], def.id);
      }
    }
    onChange();
  }

  /** Copies this wall's configuration -- elevation, square footage, and
   *  modifier selections (condition/surface) -- to a new row, so
   *  duplicating "Front" to start "Garage" doesn't mean re-picking the
   *  same surface and condition from scratch. review_required/
   *  review_reason/notes deliberately do NOT carry over: those describe
   *  something a tech found on THIS physical wall, and copying them onto
   *  an uninspected duplicate would misrepresent it as already checked. */
  async function duplicateRow(measurement) {
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: measurement.section_id, unit: measurement.unit,
      quantity: measurement.quantity, label: `${measurement.label || 'Wall section'} (copy)`,
      sort_order: measurements.length + 1
    });
    if (!created) { toast('Offline — saved locally, will sync automatically'); onChange(); return; }

    const selectedIds = (measurement.measurement_modifiers || []).map((r) => r.modifier_id);
    for (const group of modifierGroupsFor(refs.modifiers, service.id)) {
      const current = group.options.find((o) => selectedIds.includes(o.id));
      if (current) await api.setMeasurementModifier(created.id, [], current.id);
    }
    onChange();
  }

  const totalSqFt = rows.reduce((sum, m) => sum + Number(m.quantity || 0), 0);

  return el('div', {}, [
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px' }, [
      el('h3', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0',
        text: 'Wall sections' }),
      rows.length
        ? el('span', { class: 'hint', style: 'margin:0',
            text: `${qty(totalSqFt)} ${unitLabel(service.unit)} total across ${rows.length} section${rows.length === 1 ? '' : 's'}` })
        : null
    ]),
    ...rows.map((m) => wallRow(m)),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add section', onClick: addWall })
    ])
  ]);
}
