import * as api from '../lib/api.js';
import { el, select, numberInput, confirmAction, toast } from '../../../shared/dom.js';
import { qty } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Deck / Wood Cleaning's own calculator. The real architectural question
 *  this phase posed was whether decks need separate measurement types for
 *  stairs and railings -- the actual Nova Shield configuration answers
 *  that definitively: no. There is no stairs or railing modifier group,
 *  no flat addon, and no child service for either. The service is simply
 *  section -> square footage -> modifiers, one tier simpler than Siding
 *  or Roof Cleaning (no height group here at all) and simpler again than
 *  Concrete (no flat addon). If a deck has stairs or a railing worth
 *  noting, that belongs in notes or a review flag, same as any other
 *  on-site observation -- never a fabricated priced control, since
 *  nothing in the real price book prices them separately.
 *
 *  Real configured modifiers: Access (section-driven, same convention as
 *  every other service -- there is no height group to pair it with,
 *  matching Concrete rather than Siding/Roof), "Condition" (Light / Normal
 *  / Heavy buildup / Very weathered) and "Material" (Wood / Composite --
 *  genuinely a 0.90x DISCOUNT, composite is cheaper to clean than wood --
 *  / Older-delicate wood). Both Condition and Material are genuinely
 *  per-section: a rear deck's heavy buildup must not make the front deck
 *  heavy too. No job-wide control exists, consistent with Concrete and
 *  Roof Cleaning's own real findings.
 *
 *  The section picker is labelled "Deck section", the same job_sections
 *  mechanism worded for what it represents here, matching the precedent
 *  set by Roof Cleaning's "Roof section" relabel. Duplicate is
 *  implemented: a deck section's square footage is a real starting
 *  estimate worth copying to a similarly-sized level or platform, the
 *  same reasoning already established for Siding, Gutter Brightening,
 *  Concrete and Roof Cleaning -- copies section, square footage, and
 *  modifier selections; never review_required/review_reason/notes. */

export function createDeckCleaningCalculator({ job, service, refs, measurements, onChange, createMeasurement }) {
  const rows = measurements.filter((m) => m.service_id === service.id);
  const allGroups = modifierGroupsFor(refs.modifiers, service.id);

  async function pickOrCreateSection(currentId) {
    if (refs.sections.length === 0) {
      const name = window.prompt('No deck sections on this property yet. Name this one (e.g. "Main deck"):');
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
      [{ value: '', label: 'No deck section' },
       ...refs.sections.map((s) => ({ value: s.id, label: `${s.name} (${s.access} access)` })),
       { value: NEW_SECTION, label: '+ New deck section…' }],
      measurement.section_id || '',
      async (e) => {
        let value = e.target.value;
        if (value === NEW_SECTION) {
          const name = window.prompt('Name this deck section (e.g. "Upper deck"):');
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

  function deckSectionRow(measurement) {
    const section = refs.sections.find((s) => s.id === measurement.section_id);
    const qtyInput = numberInput(measurement.quantity, async (e) => {
      await api.updateMeasurement(measurement.id, { quantity: Number(e.target.value) || 0 });
      onChange();
    }, { step: '1', 'aria-label': 'Square feet' });

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
      placeholder: 'Notes (e.g. "loose board near stairs, flag for repair referral")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', style: 'flex:1;min-width:120px',
          placeholder: 'e.g. Main deck', 'aria-label': 'Deck section name',
          onChange: async (e) => { await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || 'Deck section' }); }
        }),
        el('button', { class: 'btn btn--sm', text: 'Duplicate', type: 'button', onClick: () => duplicateSection(measurement) }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove this deck section?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Square feet' }), qtyInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Deck section' }), sectionSelectFor(measurement)])
      ]),
      section ? el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: `Access comes from "${section.name}" (${section.access} access) -- edit that in Property Layout, not here.` }) : null,
      modifierControls.length ? el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, modifierControls) : null,
      el('label', { class: 'field', style: 'margin-top:10px' }, [el('span', { text: 'Notes' }), notesInput]),
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this deck section for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addDeckSection() {
    const lastSectionId = rows.length ? rows[rows.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: sectionId, unit: service.unit,
      quantity: 0, label: 'Deck section', sort_order: measurements.length + 1
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
      quantity: measurement.quantity, label: `${measurement.label || 'Deck section'} (copy)`,
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
        text: 'Deck sections' }),
      rows.length
        ? el('span', { class: 'hint', style: 'margin:0',
            text: `${qty(totalSqFt)} sq ft total across ${rows.length} deck section${rows.length === 1 ? '' : 's'}` })
        : null
    ]),
    ...rows.map((m) => deckSectionRow(m)),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add deck section', onClick: addDeckSection })
    ])
  ]);
}
