import * as api from '../lib/api.js';
import { el, clear, toast, select, numberInput, confirmAction } from '../../../shared/dom.js';
import { unitLabel, money, num } from '../../../shared/format.js';

/* Height and access are deliberately NOT editable here: they are recorded once
   on the property section. Duplicating them per measurement is what made the
   old calculator risk charging twice for the same condition. */
const SECTION_DRIVEN_GROUPS = new Set(['height', 'access']);

export function createMeasurementsPanel({ job, refs, onChange, createMeasurementFn }) {
  const root = el('div', {});
  // Desktop calls api.createMeasurement directly (always online). The field
  // console passes a wrapped version that goes through its offline outbox
  // instead -- this component stays unaware of that distinction either way.
  const createMeasurement = createMeasurementFn || api.createMeasurement;

  function serviceModifierGroups(serviceId) {
    const groups = new Map();
    for (const m of refs.modifiers) {
      if (m.service_id !== serviceId) continue;
      if (SECTION_DRIVEN_GROUPS.has(m.group_key)) continue;
      if (!groups.has(m.group_key)) {
        groups.set(m.group_key, { key: m.group_key, label: m.group_label, options: [] });
      }
      groups.get(m.group_key).options.push(m);
    }
    return [...groups.values()];
  }

  function renderMeasurement(measurement, service) {
    const selectedIds = new Set((measurement.measurement_modifiers || []).map(r => r.modifier_id));

    const qtyInput = numberInput(measurement.quantity, async e => {
      await api.updateMeasurement(measurement.id, { quantity: num(e.target.value) });
      onChange();
    }, { step: service.unit === 'each' ? '1' : '10', 'aria-label': 'Quantity' });

    const sectionSelect = select(
      [{ value: '', label: 'No section' },
       ...refs.sections.map(s => ({ value: s.id, label: s.name }))],
      measurement.section_id || '',
      async e => {
        await api.updateMeasurement(measurement.id, { section_id: e.target.value || null });
        onChange();
      }
    );

    const modifierControls = serviceModifierGroups(service.id).map(group => {
      const groupIds = group.options.map(o => o.id);
      const current = group.options.find(o => selectedIds.has(o.id));
      const defaultOpt = group.options.find(o => o.is_default);

      return el('label', { class: 'field', style: 'margin:0' }, [
        el('span', { text: group.label }),
        select(
          group.options.map(o => ({
            value: o.id,
            label: o.kind === 'flat' && Number(o.value) > 0
              ? `${o.label} (+${money(o.value)})`
              : o.label
          })),
          current?.id || defaultOpt?.id || '',
          async e => {
            await api.setMeasurementModifier(measurement.id, groupIds, e.target.value);
            onChange();
          }
        )
      ]);
    });

    const addons = (measurement.job_measurement_addons || []).map(a =>
      el('div', { class: 'row-item', style: 'margin:0 0 6px' }, [
        el('div', { class: 'row-item__main' }, [
          el('strong', { text: a.label }),
          el('span', { class: 'row-item__meta',
            text: a.kind === 'per_unit' ? `${money(a.amount)} per unit` : money(a.amount) })
        ]),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove',
          onClick: async () => { await api.deleteMeasurementAddon(a.id); onChange(); }
        })
      ]));

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: measurement.label || '', placeholder: 'Area name (e.g. Front elevation)',
          'aria-label': 'Measurement label',
          style: 'max-width:260px',
          onChange: async e => {
            await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || null });
          }
        }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove',
          onClick: async () => {
            if (!confirmAction('Remove this measurement?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [
          el('span', { text: `Quantity (${unitLabel(service.unit)})` }), qtyInput
        ]),
        el('label', { class: 'field', style: 'margin:0' }, [
          el('span', { text: 'Property section' }), sectionSelect
        ])
      ]),
      modifierControls.length
        ? el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, modifierControls)
        : null,
      addons.length ? el('div', { style: 'margin-top:10px' }, addons) : null,
      el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
        el('button', {
          class: 'btn btn--sm', text: '+ Extra charge',
          onClick: () => addAddon(measurement)
        })
      ])
    ]);
  }

  async function addAddon(measurement) {
    const label = window.prompt('What is the extra for? (e.g. Screens, Tracks, Hard-water)');
    if (!label) return;
    const raw = window.prompt('Amount in dollars');
    const amount = num(raw, NaN);
    if (!Number.isFinite(amount)) return toast('That was not a number', 'error');
    const perUnit = window.confirm('OK = charge per unit (per window/sq ft). Cancel = one flat charge.');
    await api.addMeasurementAddon(measurement.id, {
      label: label.trim().slice(0, 80),
      kind: perUnit ? 'per_unit' : 'flat',
      amount
    });
    onChange();
  }

  function renderServiceBlock(service, measurements, priced) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: service.name }),
          el('p', { text: `${money(priced?.unit_rate || 0)} per ${unitLabel(service.unit)}` +
                          (priced?.minimum_applied ? ' · minimum applied' : '') })
        ]),
        el('strong', { class: 'money', text: money(priced?.amount || 0) })
      ]),
      ...measurements.map(m => renderMeasurement(m, service)),
      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn btn--sm', text: '+ Add area',
          onClick: async () => {
            await createMeasurement(job.id, {
              service_id: service.id,
              section_id: refs.sections[0]?.id || null,
              unit: service.unit,
              quantity: 0,
              sort_order: measurements.length + 1
            });
            onChange();
          }
        })
      ])
    ]);
  }

  function render({ measurements, pricing }) {
    const byService = new Map();
    for (const m of measurements) {
      if (!byService.has(m.service_id)) byService.set(m.service_id, []);
      byService.get(m.service_id).push(m);
    }

    const pricedByService = new Map(pricing.map(p => [p.service_id, p]));
    const usedIds = new Set(byService.keys());
    const available = refs.services.filter(s => s.quotable && !usedIds.has(s.id));

    const addServiceControl = available.length
      ? el('div', { class: 'card' }, [
          el('label', { class: 'field', style: 'margin:0' }, [
            el('span', { text: 'Add a service to this job' }),
            select(
              [{ value: '', label: 'Choose a service…' },
               ...available.map(s => ({ value: s.id, label: s.name }))],
              '',
              async e => {
                if (!e.target.value) return;
                const service = refs.services.find(s => s.id === e.target.value);
                const created = await createMeasurement(job.id, {
                  service_id: service.id,
                  section_id: refs.sections[0]?.id || null,
                  unit: service.unit,
                  quantity: 0,
                  sort_order: 1
                });
                // created is null when the field console queued this offline
                // instead of creating it -- there is no row id yet to attach
                // defaults to, so that step is skipped until it actually
                // syncs (nothing is lost; the measurement itself still has
                // the service's own default pricing, just without these
                // extra modifier selections pre-applied).
                if (created) {
                  for (const group of serviceModifierGroups(service.id)) {
                    const def = group.options.find(o => o.is_default);
                    if (def) await api.setMeasurementModifier(created.id, [], def.id);
                  }
                }
                onChange();
              }
            )
          ])
        ])
      : null;

    const blocks = [...byService.entries()].map(([serviceId, ms]) => {
      const service = refs.services.find(s => s.id === serviceId);
      if (!service) return null;
      return renderServiceBlock(service, ms, pricedByService.get(serviceId));
    }).filter(Boolean);

    // Element.append() stringifies any non-Node argument (including null),
    // so a conditional that can yield null -- addServiceControl, once every
    // quotable service is already on the job -- must be filtered out here
    // rather than passed straight through, or it renders as the literal
    // text "null".
    clear(root).append(...[
      blocks.length
        ? el('div', {}, blocks)
        : el('div', { class: 'empty', text: 'No services on this job yet. Add one below.' }),
      addServiceControl,
      el('p', { class: 'hint',
        text: 'Height and access come from the property’s elevation settings, not from each ' +
              'measurement — set them once above.' })
    ].filter(Boolean));
  }

  return { root, render };
}
