import * as api from '../lib/api.js';
import { el, select, numberInput, confirmAction, toast } from '../../../shared/dom.js';
import { qty, unitLabel } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Moss Removal's own calculator -- an area service (sq_ft), structurally
 *  closest to Concrete (free-form named zones, no height group) crossed
 *  with Fence/Gutter Brightening/Window Cleaning (one genuine job-wide
 *  control). Real configured modifiers: "Coverage" (group_key 'condition'
 *  -- Light / Moderate / Heavy, per-area: one affected area's growth
 *  density has no bearing on another), "Surface" (Roof / Siding / Walkway,
 *  per-area -- moss doesn't stop at a roofline, so a property can
 *  genuinely have affected areas on more than one real surface type) and
 *  "Follow-up" (group_key 'scope' -- One-time / Plus preventative, 1.1x).
 *  Follow-up is a genuine job-wide decision by the same reasoning as
 *  Fence's Sides and Gutter Brightening's/Window Cleaning's Scope: a
 *  preventative follow-up treatment is a whole-visit service add-on, not
 *  something that coherently applies to one affected area and not another
 *  in the same visit.
 *
 *  Access is configured (Easy / Difficult / Very difficult) and -- unlike
 *  Fence's pre-Phase-10.5 Height -- is a genuine, live, section-driven
 *  group: empirically verified against the real database (a rolled-back
 *  probe attaching no row-level modifier at all and confirming
 *  section_service_mult still returns the correct 1.15/1.30 factor purely
 *  from job_sections.access) before writing this component, precisely
 *  because sharing a generic group_key is exactly how Fence's Height broke.
 *  Moss has no Height group at all -- access only, same shape as Concrete
 *  and Deck. modifierGroupsFor already excludes it from the per-area
 *  controls below; it reaches price through the existing section/Property
 *  Layout picker, not through any code in this file.
 *
 *  No child services are configured (no parent_key='moss' rows) and no
 *  flat-kind modifiers exist for this service, so there is no addon
 *  control here -- same as every calculator except Concrete's own
 *  flat-priced Special-treatment option.
 *
 *  AFFECTED AREA, NOT TOTAL AREA: the real price book has no separate
 *  "total roof area" concept or coverage-percentage field -- quantity IS
 *  the affected square footage directly. Because it would be easy for a
 *  technician to enter a whole roof's footprint out of habit, the
 *  quantity field is explicitly labelled "Affected area (sq ft)" with a
 *  hint reinforcing the distinction, and review is the escape hatch (per
 *  the task's own guidance) for whenever the affected area, substrate, or
 *  access can't be measured with confidence -- never a fabricated rate.
 *
 *  Duplicate is implemented: an affected area's square footage is a real
 *  starting estimate worth copying to a similar nearby area, the same
 *  reasoning already established for Siding, Gutter Brightening, Concrete,
 *  Roof Cleaning, Deck Cleaning and Fence Cleaning -- copies section,
 *  square footage, and modifier selections (Coverage/Surface/Follow-up);
 *  never review_required/review_reason/notes. */

export function createMossRemovalCalculator({ job, service, refs, measurements, onChange, createMeasurement }) {
  const rows = measurements.filter((m) => m.service_id === service.id);

  const allGroups = modifierGroupsFor(refs.modifiers, service.id);
  const scopeGroup = allGroups.find((g) => g.key === 'scope') || null;
  const rowGroups = allGroups.filter((g) => g.key !== 'scope');

  function currentScopeModifierId() {
    if (!scopeGroup) return null;
    if (rows.length) {
      const selectedIds = new Set((rows[0].measurement_modifiers || []).map((r) => r.modifier_id));
      const current = scopeGroup.options.find((o) => selectedIds.has(o.id));
      if (current) return current.id;
    }
    return scopeGroup.options.find((o) => o.is_default)?.id || scopeGroup.options[0]?.id || null;
  }

  async function applyScopeToAllRows(modifierId) {
    if (!scopeGroup || !rows.length) return;
    const groupIds = scopeGroup.options.map((o) => o.id);
    await Promise.all(rows.map((m) => api.setMeasurementModifier(m.id, groupIds, modifierId)));
    onChange();
  }

  function followUpControl() {
    if (!scopeGroup) return null;
    const current = currentScopeModifierId();
    return el('label', { class: 'field' }, [
      el('span', { text: `${scopeGroup.label} for this visit` }),
      select(
        scopeGroup.options.map((o) => ({ value: o.id, label: o.label })),
        current || '',
        (e) => applyScopeToAllRows(e.target.value)
      ),
      el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: 'Applies to every affected area below -- this describes the visit, not one area.' })
    ]);
  }

  async function pickOrCreateSection(currentId) {
    if (refs.sections.length === 0) {
      const name = window.prompt('No sections on this property yet. Name this one (e.g. "Rear roof"):');
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
          const name = window.prompt('Name this section (e.g. "Garage roof"):');
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
    const qtyInput = numberInput(measurement.quantity, async (e) => {
      await api.updateMeasurement(measurement.id, { quantity: Number(e.target.value) || 0 });
      onChange();
    }, { step: '1', 'aria-label': 'Affected area (sq ft)' });

    const selectedIds = new Set((measurement.measurement_modifiers || []).map((r) => r.modifier_id));
    const modifierControls = rowGroups.map((group) => {
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
      placeholder: 'Notes (e.g. "growth concentrated on north-facing slope, shaded by trees")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', style: 'flex:1;min-width:120px',
          placeholder: 'e.g. Rear roof', 'aria-label': 'Affected area name',
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
        text: 'Measure only the moss-affected area, not the full roof/surface -- flag below if that’s uncertain.' }),
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
      for (const group of rowGroups) {
        const def = group.options.find((o) => o.is_default);
        if (def) await api.setMeasurementModifier(created.id, group.options.map((o) => o.id), def.id);
      }
      const followUpId = currentScopeModifierId();
      if (scopeGroup && followUpId) await api.setMeasurementModifier(created.id, scopeGroup.options.map((o) => o.id), followUpId);
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
    followUpControl(),
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin:14px 0 8px' }, [
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
