import * as api from '../lib/api.js';
import { el, select, confirmAction, toast } from '../../../shared/dom.js';
import { qty, money } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Concrete / Pressure Washing's own calculator -- an area service like
 *  Siding, but with a different real modifier shape: no height group at
 *  all (poured concrete doesn't come in storeys), and a third per-zone
 *  modifier -- "Special treatment" -- that's flat-kind (a dollar amount
 *  added once per zone, e.g. an oil stain needing degreaser), not a
 *  multiplier on area the way Condition and Surface are. A job_measurements
 *  row here is one named zone -- "Driveway", "Front walkway" -- with its
 *  own square footage; zone names are free text, not a fixed category list,
 *  because the real price book doesn't define "driveway" or "patio" as
 *  pricing concepts, only square footage with a surface/condition/
 *  treatment read.
 *
 *  Real configured modifiers: access (section-driven, same convention as
 *  every other service -- there is no height group to pair it with here),
 *  Surface (Poured concrete / Interlock-pavers / Natural stone / Asphalt),
 *  Condition (Light / Normal / Heavy organic growth / Heavy staining), and
 *  Special treatment (None / Oil-degreaser +$50 / Rust +$75 / Multiple
 *  +$100). All three non-section-driven groups are genuinely zone-specific
 *  by what their real options mean -- a driveway's oil stain or heavy
 *  staining has no bearing on an unrelated walkway -- so unlike Gutter
 *  Brightening and Window Cleaning, this service has NO job-wide control.
 *  That's a real finding from the actual configured semantics, not an
 *  oversight: nothing here reads as "describes the whole visit" the way
 *  Scope did for those two services.
 *
 *  Duplicate is implemented, unlike Window Cleaning: a zone's square
 *  footage is a real starting estimate worth copying to a similar
 *  neighbouring zone (Sidewalk Section A -> Sidewalk Section B), the same
 *  reasoning Siding and Gutter Brightening already established. Copies
 *  section, square footage, and every current modifier selection
 *  (Surface/Condition/Special treatment); never review_required/
 *  review_reason/notes, which describe something found on THIS physical
 *  zone, not a safe default for an uninspected copy. */

export function createConcreteCleaningCalculator({ job, service, refs, measurements, onChange, createMeasurement, quantityInput }) {
  const rows = measurements.filter((m) => m.service_id === service.id);
  const allGroups = modifierGroupsFor(refs.modifiers, service.id);

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
       ...refs.sections.map((s) => ({ value: s.id, label: `${s.name} (${s.access} access)` })),
       { value: NEW_SECTION, label: '+ New elevation…' }],
      measurement.section_id || '',
      async (e) => {
        let value = e.target.value;
        if (value === NEW_SECTION) {
          const name = window.prompt('Name this elevation (e.g. "Side yard"):');
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

  function zoneRow(measurement) {
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
          group.options.map((o) => ({
            value: o.id,
            // Flat-kind options (Special treatment) carry a real dollar
            // amount, not a multiplier -- show it, same convention the
            // generic measurement editor already uses for flat modifiers.
            label: o.kind === 'flat' && Number(o.value) > 0 ? `${o.label} (+${money(o.value)})` : o.label
          })),
          current?.id || defaultOpt?.id || '',
          async (e) => { await api.setMeasurementModifier(measurement.id, groupIds, e.target.value); onChange(); }
        )
      ]);
    });

    const notesInput = el('input', {
      value: measurement.notes || '',
      placeholder: 'Notes (e.g. "oil stain near garage door, degreaser applied")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', style: 'flex:1;min-width:120px',
          placeholder: 'e.g. Driveway', 'aria-label': 'Zone name',
          onChange: async (e) => { await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || 'Zone' }); }
        }),
        el('button', { class: 'btn btn--sm', text: 'Duplicate', type: 'button', onClick: () => duplicateZone(measurement) }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove this zone?')) return;
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
        text: `Access comes from "${section.name}" (${section.access} access) -- edit that in Property Layout, not here.` }) : null,
      modifierControls.length ? el('div', { class: 'grid grid--3', style: 'margin-top:10px' }, modifierControls) : null,
      el('label', { class: 'field', style: 'margin-top:10px' }, [el('span', { text: 'Notes' }), notesInput]),
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this zone for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addZone() {
    const lastSectionId = rows.length ? rows[rows.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: sectionId, unit: service.unit,
      quantity: 0, label: 'Zone', sort_order: measurements.length + 1
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

  async function duplicateZone(measurement) {
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: measurement.section_id, unit: measurement.unit,
      quantity: measurement.quantity, label: `${measurement.label || 'Zone'} (copy)`,
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
        text: 'Zones' }),
      rows.length
        ? el('span', { class: 'hint', style: 'margin:0',
            text: `${qty(totalSqFt)} sq ft total across ${rows.length} zone${rows.length === 1 ? '' : 's'}` })
        : null
    ]),
    ...rows.map((m) => zoneRow(m)),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add zone', onClick: addZone })
    ])
  ]);
}
