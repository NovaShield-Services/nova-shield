import * as api from '../lib/api.js';
import { el, select, confirmAction, toast } from '../../../shared/dom.js';
import { qty, unitLabel } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Fence Cleaning's own calculator -- a linear-foot service, but NOT
 *  Gutter Brightening with the labels changed. Real configured modifiers:
 *  "Condition" (Light / Normal / Heavy, per-row -- a front fence's
 *  condition must not bleed into the rear), "Sides" (One side / Both
 *  sides, 1.8x -- a genuine job-wide decision, same reasoning as Gutter
 *  Brightening's and Window Cleaning's job-wide Scope: there's no
 *  coherent price for cleaning one side of the front run and both sides
 *  of the rear run in the same visit), "Material" (Vinyl / Metal /
 *  Wood / Older-delicate wood, per-row) and "Fence height" (Standard /
 *  Tall / Very tall, per-row -- the fence panel's own height, not the
 *  building's storey count). There is no Access group for this service
 *  at all.
 *
 *  PHASE 10.5 FIX -- fence's height group used to share the generic
 *  group_key 'height' with every other service's real building-storey
 *  group. modifierGroupsFor and calculate_job_pricing both hardcode
 *  'height'/'access' as always section-driven and exclude them from
 *  row-level multiplier aggregation, so fence's panel-height modifier
 *  was silently inert no matter how it was attached (confirmed
 *  empirically in Phase 10; see that phase's report). Phase 10.5 re-keyed
 *  fence's 3 height rows from group_key='height' to group_key=
 *  'fence_height' -- ids, option_keys, labels and values all preserved --
 *  so it no longer string-matches the section-driven exclusion and now
 *  flows through the ordinary per-row path exactly like Condition and
 *  Material. It is a per-row choice like those two, never a job-wide one
 *  like Sides, and it must never be folded into job_sections.storeys --
 *  that column still means building storeys for every other service.
 *  The migration deliberately left the stored group_label as "Height"
 *  (relabeling wasn't part of the fix, and every other service still
 *  reads that shared label data), so this component alone renders it as
 *  "Fence height" -- see rowGroupLabel() below.
 *
 *  Gates have no modifier, addon, or child-service representation
 *  anywhere in the real configuration -- simply not priced at all -- so
 *  no gate control exists here either; same treatment as deck's stairs
 *  in Phase 9.
 *
 *  The section picker also matters for a reason unrelated to fence
 *  height: calculate_job_pricing applies property-wide site_factors
 *  (ground/ladder/distance) to ANY measurement with a section_id,
 *  regardless of service, so assigning a fence run to a section affects
 *  its price through those too, on top of its own per-row Fence
 *  height/Condition/Material.
 *
 *  Duplicate is implemented: a fence run's footage is a real starting
 *  estimate worth copying to a similar adjacent run, the same reasoning
 *  already established for Siding, Gutter Brightening, Concrete, Roof
 *  Cleaning and Deck Cleaning -- copies section, footage, and modifier
 *  selections (Condition/Material/Sides/Fence height); never
 *  review_required/review_reason/notes. */

export function createFenceCleaningCalculator({ job, service, refs, measurements, onChange, createMeasurement, quantityInput }) {
  const rows = measurements.filter((m) => m.service_id === service.id);

  const allGroups = modifierGroupsFor(refs.modifiers, service.id);
  const scopeGroup = allGroups.find((g) => g.key === 'scope') || null;
  const rowGroups = allGroups.filter((g) => g.key !== 'scope');

  // The DB's group_label for this group is still "Height" (shared data every
  // other service also reads -- Phase 10.5 renamed only the group_key, not
  // the label). This component alone needs the fence-specific term, so the
  // override lives here rather than in the stored data.
  function rowGroupLabel(group) {
    return group.key === 'fence_height' ? 'Fence height' : group.label;
  }

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

  function sidesControl() {
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
        text: 'Applies to every fence run below -- this describes the visit, not one run.' })
    ]);
  }

  async function pickOrCreateSection(currentId) {
    if (refs.sections.length === 0) {
      const name = window.prompt('No fence sections on this property yet. Name this one (e.g. "Front fence"):');
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
      [{ value: '', label: 'No fence section' },
       ...refs.sections.map((s) => ({ value: s.id, label: s.name })),
       { value: NEW_SECTION, label: '+ New fence section…' }],
      measurement.section_id || '',
      async (e) => {
        let value = e.target.value;
        if (value === NEW_SECTION) {
          const name = window.prompt('Name this fence section (e.g. "Detached enclosure"):');
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

  function fenceRunRow(measurement) {
    const section = refs.sections.find((s) => s.id === measurement.section_id);
    const qtyInput = quantityInput(measurement, { step: '1', 'aria-label': 'Linear feet' });

    const selectedIds = new Set((measurement.measurement_modifiers || []).map((r) => r.modifier_id));
    const modifierControls = rowGroups.map((group) => {
      const groupIds = group.options.map((o) => o.id);
      const current = group.options.find((o) => selectedIds.has(o.id));
      const defaultOpt = group.options.find((o) => o.is_default);
      return el('label', { class: 'field', style: 'margin:0' }, [
        el('span', { text: rowGroupLabel(group) }),
        select(
          group.options.map((o) => ({ value: o.id, label: o.label })),
          current?.id || defaultOpt?.id || '',
          async (e) => { await api.setMeasurementModifier(measurement.id, groupIds, e.target.value); onChange(); }
        )
      ]);
    });

    const notesInput = el('input', {
      value: measurement.notes || '',
      placeholder: 'Notes (e.g. "6ft privacy fence, gate at east corner")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', style: 'flex:1;min-width:120px',
          placeholder: 'e.g. Front fence', 'aria-label': 'Fence section name',
          onChange: async (e) => { await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || 'Fence section' }); }
        }),
        el('button', { class: 'btn btn--sm', text: 'Duplicate', type: 'button', onClick: () => duplicateRun(measurement) }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove this fence section?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Linear feet' }), qtyInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Fence section' }), sectionSelectFor(measurement)])
      ]),
      // Deliberately not "Fence height comes from..." -- fence height is
      // its own per-row control below (like Condition/Material), not
      // derived from the section. Site conditions (ground/ladder/distance)
      // are the one thing a section assignment still does for this service.
      section ? el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: `Site conditions (ground, ladder reach, distance) come from "${section.name}" -- edit those in Property Layout, not here.` }) : null,
      modifierControls.length ? el('div', { class: 'grid grid--3', style: 'margin-top:10px' }, modifierControls) : null,
      el('label', { class: 'field', style: 'margin-top:10px' }, [el('span', { text: 'Notes' }), notesInput]),
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this fence section for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addFenceSection() {
    const lastSectionId = rows.length ? rows[rows.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: sectionId, unit: service.unit,
      quantity: 0, label: 'Fence section', sort_order: measurements.length + 1
    });
    if (created) {
      for (const group of rowGroups) {
        const def = group.options.find((o) => o.is_default);
        if (def) await api.setMeasurementModifier(created.id, group.options.map((o) => o.id), def.id);
      }
      const sidesId = currentScopeModifierId();
      if (scopeGroup && sidesId) await api.setMeasurementModifier(created.id, scopeGroup.options.map((o) => o.id), sidesId);
    } else {
      toast('Offline — saved locally, will sync automatically');
    }
    onChange();
  }

  async function duplicateRun(measurement) {
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: measurement.section_id, unit: measurement.unit,
      quantity: measurement.quantity, label: `${measurement.label || 'Fence section'} (copy)`,
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

  const totalFt = rows.reduce((sum, m) => sum + Number(m.quantity || 0), 0);

  return el('div', {}, [
    sidesControl(),
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin:14px 0 8px' }, [
      el('h3', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0',
        text: 'Fence sections' }),
      rows.length
        ? el('span', { class: 'hint', style: 'margin:0',
            text: `${qty(totalFt)} ${unitLabel(service.unit)} total across ${rows.length} fence section${rows.length === 1 ? '' : 's'}` })
        : null
    ]),
    ...rows.map((m) => fenceRunRow(m)),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add fence section', onClick: addFenceSection })
    ]),
    el('p', { class: 'hint', style: 'margin-top:10px',
      text: 'Gates are not part of this calculation -- note gates in a run\'s notes above, or flag a run for review, rather than assuming the total accounts for them.' })
  ].filter(Boolean));
}
