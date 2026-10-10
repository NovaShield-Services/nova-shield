import * as api from '../lib/api.js';
import { el, select, confirmAction, toast } from '../../../shared/dom.js';
import { qty, money, unitLabel } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Christmas Lighting's own calculator -- verified independently against
 *  the real database, not assumed identical to Permanent Lighting just
 *  because the service keys look similar. The real configured shape
 *  happens to be structurally the same as Permanent Lighting's (same
 *  $5.00/linear ft main rate, same $0.00 minimum, the identical real
 *  "Height" group -- 1_storey/2_storey/3_storey/4_plus, the genuine
 *  building-storey vocabulary, empirically re-verified for THIS service
 *  specifically rather than assumed by analogy) and christmas_lighting_jump
 *  is a real child (parent_key='christmas_lighting', $2.00/linear ft,
 *  zero modifiers of its own, confirmed empirically unable to inherit
 *  height even if given a section). That similarity is a real finding
 *  from inspection, not a reason to import or alias the other file --
 *  this component is independently written and independently verified.
 *
 *  SEASONAL / LIFECYCLE FINDING: the "yearly fee" / "install then
 *  takedown" business model is real, but it is not represented anywhere
 *  in the pricing/measurement schema -- there is no season, recurring,
 *  takedown, install-date, or storage column anywhere in this database,
 *  and this service has zero existing job_measurements to suggest
 *  otherwise. The only "seasonal" logic anywhere in the app is (1)
 *  winter.js's admin "Generate Renewal Quote" button, which just calls
 *  the existing duplicateQuote() RPC on a customer's most recent
 *  category='lighting' quote to start a new draft for this season, and
 *  (2) settings.js's generic app_settings.lighting JSON blob ("warranty
 *  years and seasonal windows shown on the website") for the public
 *  marketing site. Neither touches job_measurements or
 *  calculate_job_pricing. So: this calculator quotes footage x rate x
 *  height, exactly like Permanent Lighting: annual renewal is a
 *  quote-duplication action taken later by an admin, not a field this
 *  component reads or writes. Relatedly, the database draws no
 *  distinction between an install-only price and an install+takedown
 *  bundle -- there is only the one linear-foot rate -- so this component
 *  makes no claim either way; if a job genuinely needs that distinction
 *  recorded, that belongs in notes/review, not an invented price field.
 *
 *  Duplicate is implemented for main runs (a roofline run's footage is a
 *  real starting estimate worth copying to a similar run); jump wire is
 *  a single job-wide row, added/edited/removed directly, same reasoning
 *  as Permanent Lighting's. */

export function createChristmasLightingCalculator({ job, service, refs, measurements, pricedRows, onChange, createMeasurement, quantityInput }) {
  const jumpService = refs.services.find((s) => s.key === 'christmas_lighting_jump');
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
    const qtyInput = quantityInput(measurement, { step: '1', 'aria-label': 'Feet' });

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
      placeholder: 'Notes (e.g. "icy access, confirm takedown route in January")',
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

    const qtyInput = quantityInput(jumpRow, { step: '1', 'aria-label': 'Jump wire feet' });

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
