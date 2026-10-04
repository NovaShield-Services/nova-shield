import * as api from '../lib/api.js';
import { el, select, numberInput, confirmAction, toast } from '../../../shared/dom.js';
import { qty, unitLabel } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Gutter Brightening's own calculator -- a single-measurement-kind linear
 *  service: no child components, no secondary measurement type (no
 *  downspout-style split), no authorization-only field. So this is NOT
 *  heating wire's layout with different labels (no steppers, no eave/
 *  downspout grouping, no bracket section) and NOT siding's wall-section
 *  layout with "ft" swapped in for "sq ft" -- the one real design decision
 *  this service's actual configuration calls for is where the "Scope"
 *  modifier lives.
 *
 *  The real pricing_modifiers for this service are: height/access
 *  (section-driven, same as every other service), "Oxidation" (light /
 *  normal / tiger striping / heavy -- a genuine per-gutter-run physical
 *  condition, since a north-facing run can oxidise differently than a
 *  south-facing one) and "Scope" (front-facing / full exterior / full +
 *  difficult sections -- a multiplier on the whole visit's rate, not a
 *  property of any one run). Nothing distinguishes these two groups at
 *  the schema level; the distinction comes from reading what their real
 *  option labels mean. Exposing "Scope" as a per-row dropdown would let a
 *  tech set "front-facing" on one run and "full exterior" on another,
 *  which has no coherent real-world price -- "full exterior" describes
 *  the job, not that one gutter run. So Scope gets ONE control for the
 *  whole card, which fans out to every row via the same setMeasurementModifier
 *  the generic editor already uses; Oxidation stays per-row, exactly
 *  because the instructions are explicit that a condition on one section
 *  must not bleed into the rest of the property. Neither is invented --
 *  both are real, already-configured groups; this only decides where in
 *  the UI each one's control lives. */

export function createGutterBrighteningCalculator({ job, service, refs, measurements, onChange, createMeasurement }) {
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

  function scopeControl() {
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
        text: 'Applies to every gutter run below -- this describes the visit, not one specific run.' })
    ]);
  }

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

  function gutterRow(measurement) {
    const section = refs.sections.find((s) => s.id === measurement.section_id);
    const qtyInput = numberInput(measurement.quantity, async (e) => {
      await api.updateMeasurement(measurement.id, { quantity: Number(e.target.value) || 0 });
      onChange();
    }, { step: '1', 'aria-label': 'Linear feet' });

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
      placeholder: 'Notes (e.g. "heavy oxidation along rear fascia")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', style: 'max-width:160px',
          placeholder: 'e.g. Front', 'aria-label': 'Run name',
          onChange: async (e) => { await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || 'Gutter run' }); }
        }),
        el('button', { class: 'btn btn--sm', text: 'Duplicate', type: 'button', onClick: () => duplicateRow(measurement) }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove this gutter run?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Linear feet' }), qtyInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Elevation' }), sectionSelectFor(measurement)])
      ]),
      section ? el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: `Height/access come from "${section.name}" (${(section.storeys || '1_storey').replace('_', ' ')}, ${section.access} access) -- ` +
              'edit those in Property Layout, not here.' }) : null,
      modifierControls.length ? el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, modifierControls) : null,
      el('label', { class: 'field', style: 'margin-top:10px' }, [el('span', { text: 'Notes' }), notesInput]),
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this run for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addSection() {
    // Same courtesy established for heating wire and siding: default to
    // the last-added run's elevation rather than resetting to blank.
    const lastSectionId = rows.length ? rows[rows.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: sectionId, unit: service.unit,
      quantity: 0, label: 'Gutter run', sort_order: measurements.length + 1
    });
    if (created) {
      for (const group of rowGroups) {
        const def = group.options.find((o) => o.is_default);
        if (def) await api.setMeasurementModifier(created.id, group.options.map((o) => o.id), def.id);
      }
      const scopeId = currentScopeModifierId();
      if (scopeGroup && scopeId) await api.setMeasurementModifier(created.id, scopeGroup.options.map((o) => o.id), scopeId);
    }
    onChange();
  }

  /** Copies elevation, footage, and every current modifier selection
   *  (Oxidation AND Scope -- Scope will already match every other row
   *  since it's kept in sync from the one shared control, so copying it
   *  verbatim is correct, not an extra special case). review_required/
   *  review_reason/notes do NOT carry over: those describe something
   *  found on THIS physical run, not a safe default for an uninspected
   *  duplicate. */
  async function duplicateRow(measurement) {
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: measurement.section_id, unit: measurement.unit,
      quantity: measurement.quantity, label: `${measurement.label || 'Gutter run'} (copy)`,
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
    scopeControl(),
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin:14px 0 8px' }, [
      el('h3', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0',
        text: 'Gutter sections' }),
      rows.length
        ? el('span', { class: 'hint', style: 'margin:0',
            text: `${qty(totalFt)} ${unitLabel(service.unit)} total across ${rows.length} section${rows.length === 1 ? '' : 's'}` })
        : null
    ]),
    ...rows.map((m) => gutterRow(m)),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add section', onClick: addSection })
    ])
  ].filter(Boolean));
}
