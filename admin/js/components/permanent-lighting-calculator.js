import * as api from '../lib/api.js';
import { el, select, numberInput, confirmAction, toast } from '../../../shared/dom.js';
import { qty, money, unitLabel } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Permanent Outdoor Lighting's own calculator -- the first lighting-
 *  family service, and structurally simpler than any cleaning calculator
 *  built so far: the main run has exactly one real modifier group,
 *  "Height" (1_storey/2_storey/3_storey/4_plus, the genuine building-
 *  storey vocabulary -- empirically verified against the real database
 *  before writing this file, same check the Fence Height mistake should
 *  always have had), section-driven, no access/condition/surface group
 *  at all. modifierGroupsFor already excludes it from the per-run
 *  controls below; a run's price comes from footage x rate x height via
 *  the existing section/Property Layout picker, same as Window
 *  Cleaning's own height-only shape.
 *
 *  Jump Wire (permanent_lighting_jump) is a real, already-configured
 *  child service (parent_key='permanent_lighting') with its own approved
 *  rate ($2.00/linear ft) and ZERO modifiers of its own -- confirmed
 *  empirically that it cannot inherit the main run's height even if a
 *  jump-wire row were given a section_id, since there is no
 *  pricing_modifiers row for that service at all. The existing real
 *  jump-wire measurement in the database has section_id=null and is a
 *  single row for the whole job, which this component follows exactly
 *  -- one job_measurements row, created on demand, never per-section.
 *
 *  Unlike Heating Wire's valley/corner children (unit 'each', stepper,
 *  always force-flagged for review because they have no approved rate
 *  yet), Jump Wire's real unit is linear_ft and it DOES have an approved
 *  rate -- so this uses a footage number input, not a stepper, and never
 *  auto-sets review_required. The parent/child grouping itself (this
 *  card showing one combined total, the measurements.js byGroup/
 *  pricedRowsByGroup machinery, and get_customer_quote's parent_key
 *  rollup) is all existing, already-proven infrastructure; nothing here
 *  duplicates it.
 *
 *  Duplicate is implemented for main runs (a roofline run's footage is a
 *  real starting estimate worth copying to a similar run, same reasoning
 *  as every other linear-footage calculator); jump wire is a single
 *  job-wide row, so it is added/edited/removed directly rather than
 *  duplicated. */

export function createPermanentLightingCalculator({ job, service, refs, measurements, pricedRows, onChange, createMeasurement }) {
  const jumpService = refs.services.find((s) => s.key === 'permanent_lighting_jump');
  const mainRuns = measurements.filter((m) => m.service_id === service.id);
  const jumpRow = jumpService ? measurements.find((m) => m.service_id === jumpService.id) : null;
  const jumpPriced = jumpService ? pricedRows.find((p) => p.service_id === jumpService.id) : null;

  const rowGroups = modifierGroupsFor(refs.modifiers, service.id);

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
       ...refs.sections.map((s) => ({ value: s.id, label: `${s.name} (${(s.storeys || '1_storey').replace('_', ' ')})` })),
       { value: NEW_SECTION, label: '+ New elevation…' }],
      measurement.section_id || '',
      async (e) => {
        let value = e.target.value;
        if (value === NEW_SECTION) {
          const name = window.prompt('Name this elevation (e.g. "Rear roofline"):');
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

  function lightingRunRow(measurement) {
    const section = refs.sections.find((s) => s.id === measurement.section_id);
    const qtyInput = numberInput(measurement.quantity, async (e) => {
      await api.updateMeasurement(measurement.id, { quantity: Number(e.target.value) || 0 });
      onChange();
    }, { step: '1', 'aria-label': 'Feet' });

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
      placeholder: 'Notes (e.g. "unusual roofline geometry, confirm routing on site")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', style: 'flex:1;min-width:120px',
          placeholder: 'e.g. Front roofline', 'aria-label': 'Lighting run name',
          onChange: async (e) => { await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || 'Lighting run' }); }
        }),
        el('button', { class: 'btn btn--sm', text: 'Duplicate', type: 'button', onClick: () => duplicateRun(measurement) }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove this lighting run?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Feet' }), qtyInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Elevation' }), sectionSelectFor(measurement)])
      ]),
      section ? el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: `Height comes from "${section.name}" (${(section.storeys || '1_storey').replace('_', ' ')}) -- edit that in Property Layout, not here.` }) : null,
      modifierControls.length ? el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, modifierControls) : null,
      el('label', { class: 'field', style: 'margin-top:10px' }, [el('span', { text: 'Notes' }), notesInput]),
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this run for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addLightingRun() {
    const lastSectionId = mainRuns.length ? mainRuns[mainRuns.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: sectionId, unit: service.unit,
      quantity: 0, label: 'Lighting run', sort_order: measurements.length + 1
    });
    if (!created) toast('Offline — saved locally, will sync automatically');
    onChange();
  }

  async function duplicateRun(measurement) {
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: measurement.section_id, unit: measurement.unit,
      quantity: measurement.quantity, label: `${measurement.label || 'Lighting run'} (copy)`,
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

  function jumpWireBlock() {
    if (!jumpService) return null; // the migration that adds this child service hasn't landed -- degrade quietly

    if (!jumpRow) {
      return el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn btn--sm', text: '+ Add jump wire', type: 'button',
          onClick: async () => {
            const created = await createMeasurement(job.id, {
              service_id: jumpService.id, section_id: null, unit: jumpService.unit,
              quantity: 0, label: 'Jump wire', sort_order: measurements.length + 1
            });
            if (!created) toast('Offline — saved locally, will sync automatically');
            onChange();
          }
        })
      ]);
    }

    const qtyInput = numberInput(jumpRow.quantity, async (e) => {
      await api.updateMeasurement(jumpRow.id, { quantity: Number(e.target.value) || 0 });
      onChange();
    }, { step: '1', 'aria-label': 'Jump wire feet' });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('strong', { text: 'Jump wire' }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove jump wire from this job?')) return;
            await api.deleteMeasurement(jumpRow.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Feet' }), qtyInput]),
        el('div', { class: 'field', style: 'margin:0' }, [
          el('span', { text: 'Amount' }),
          el('p', { style: 'margin:0;padding-top:6px;font-weight:600',
            text: jumpPriced && Number(jumpPriced.amount) > 0 ? money(jumpPriced.amount) : 'Not priced yet' })
        ])
      ]),
      el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: 'One jump-wire total for this job -- not tied to a single roofline section.' }),
      reviewFlag({
        required: jumpRow.review_required, reason: jumpRow.review_reason,
        label: 'Flag jump wire for review',
        save: (patch) => api.updateMeasurement(jumpRow.id, patch)
      })
    ]);
  }

  const totalFt = mainRuns.reduce((sum, m) => sum + Number(m.quantity || 0), 0);

  return el('div', {}, [
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px' }, [
      el('h3', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0',
        text: 'Lighting runs' }),
      mainRuns.length
        ? el('span', { class: 'hint', style: 'margin:0',
            text: `${qty(totalFt)} ${unitLabel(service.unit)} total across ${mainRuns.length} run${mainRuns.length === 1 ? '' : 's'}` })
        : null
    ]),
    ...mainRuns.map((m) => lightingRunRow(m)),
    el('div', { class: 'btn-row', style: 'margin-bottom:16px' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add lighting run', onClick: addLightingRun })
    ]),

    el('h3', { style: 'margin:0 0 8px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)',
      text: 'Jump wire' }),
    jumpWireBlock()
  ].filter(Boolean));
}
