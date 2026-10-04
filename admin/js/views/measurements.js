import * as api from '../lib/api.js';
import { el, clear, toast, select, numberInput, confirmAction } from '../../../shared/dom.js';
import { unitLabel, money, num } from '../../../shared/format.js';
import { reviewFlag } from '../components/review-flag.js';
import { modifierGroupsFor } from '../components/modifier-groups.js';
import { createHeatingWireCalculator } from '../components/heating-wire-calculator.js';
import { createSidingCalculator } from '../components/siding-calculator.js';
import { createGutterBrighteningCalculator } from '../components/gutter-brightening-calculator.js';
import { createWindowCleaningCalculator } from '../components/window-cleaning-calculator.js';
import { createConcreteCleaningCalculator } from '../components/concrete-cleaning-calculator.js';
import { createRoofCleaningCalculator } from '../components/roof-cleaning-calculator.js';
import { createDeckCleaningCalculator } from '../components/deck-cleaning-calculator.js';
import { createFenceCleaningCalculator } from '../components/fence-cleaning-calculator.js';
import { createMossRemovalCalculator } from '../components/moss-removal-calculator.js';
import { createGraffitiRemovalCalculator } from '../components/graffiti-removal-calculator.js';
import { createPermanentLightingCalculator } from '../components/permanent-lighting-calculator.js';
import { createChristmasLightingCalculator } from '../components/christmas-lighting-calculator.js';

export function createMeasurementsPanel({ job, refs, onChange, createMeasurementFn }) {
  const root = el('div', {});
  // Desktop calls api.createMeasurement directly (always online). The field
  // console passes a wrapped version that goes through its offline outbox
  // instead -- this component stays unaware of that distinction either way.
  const createMeasurement = createMeasurementFn || api.createMeasurement;

  /** 'approved' | 'provisional' | 'unpriced' for a service's currently
   *  active rate, derived from refs.pricingRules (listPricingRules())
   *  rather than a second fetch. 'unpriced' (no pricing_rules row at all --
   *  the state a brand-new child-service component like a heat-cable
   *  valley starts in) is distinct from 'provisional' (a real rate exists,
   *  just not commercially approved yet) -- both need a visible flag, but
   *  they mean different things to whoever is looking at the badge. */
  function approvalState(serviceId) {
    const rule = (refs.pricingRules || []).find(r => r.service_id === serviceId);
    return rule ? rule.approval_status : 'unpriced';
  }
  const isApproved = (serviceId) => approvalState(serviceId) === 'approved';

  function resolveService(id) { return (refs.services || []).find(s => s.id === id); }

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

    const modifierControls = modifierGroupsFor(refs.modifiers, service.id).map(group => {
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

    const reviewControl = reviewFlag({
      required: measurement.review_required, reason: measurement.review_reason,
      label: 'Flag this area for review',
      save: (patch) => api.updateMeasurement(measurement.id, patch)
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
      reviewControl,
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

  /** Service-specific calculators swap in here, keyed by the PARENT
   *  service's key -- the card header/badge/total above stays the one
   *  shared shell every service gets; only the body differs. A service
   *  with no entry here just gets the generic measurement list below. */
  const SPECIALIZED_CALCULATORS = {
    winter_deicing_cables: createHeatingWireCalculator,
    siding: createSidingCalculator,
    gutter_brightening: createGutterBrighteningCalculator,
    windows: createWindowCleaningCalculator,
    concrete: createConcreteCleaningCalculator,
    roof_soft_wash: createRoofCleaningCalculator,
    deck: createDeckCleaningCalculator,
    fence: createFenceCleaningCalculator,
    moss: createMossRemovalCalculator,
    graffiti: createGraffitiRemovalCalculator,
    permanent_lighting: createPermanentLightingCalculator,
    christmas_lighting: createChristmasLightingCalculator
  };

  function renderServiceBlock(service, measurements, pricedRows) {
    // pricedRows covers the parent AND any of its child components that
    // actually have measurements on this job (e.g. heat-cable's valley/
    // corner counts) -- summed here for the one number that matters at a
    // glance, "what does this service cost in total", without this view
    // ever re-deriving a dollar amount itself (every figure already came
    // out of calculate_job_pricing).
    const total = pricedRows.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const ownPriced = pricedRows.find(p => p.service_id === service.id);
    const worstState = pricedRows
      .map(p => approvalState(p.service_id))
      .reduce((worst, s) => (s === 'unpriced' || worst === 'unpriced') ? 'unpriced'
        : (s === 'provisional' || worst === 'provisional') ? 'provisional' : 'approved', 'approved');

    const badge = worstState === 'unpriced'
      ? el('span', { class: 'badge badge--warn', style: 'margin-left:8px', text: 'Not priced yet' })
      : worstState === 'provisional'
        ? el('span', { class: 'badge badge--warn', style: 'margin-left:8px', text: 'Pricing not yet approved' })
        : null;

    const hint = worstState === 'unpriced'
      ? 'At least one component here (e.g. a valley or corner count) has no approved rate configured ' +
        'yet. It’s flagged for review rather than priced at $0 -- measure it, the price comes later.'
      : worstState === 'provisional'
        ? 'This service’s pricing is configured but not yet commercially approved. ' +
          'Measure and prepare freely -- just don’t send this to the customer as a final number yet.'
        : null;

    const specialized = SPECIALIZED_CALCULATORS[service.key];

    return el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', {}, [service.name, badge].filter(Boolean)),
          el('p', { text: `${money(ownPriced?.unit_rate || 0)} per ${unitLabel(service.unit)}` +
                          (ownPriced?.minimum_applied ? ' · minimum applied' : '') })
        ]),
        el('strong', { class: 'money', text: money(total) })
      ]),
      hint ? el('p', { class: 'hint', style: 'margin:-4px 0 10px', text: hint }) : null,

      specialized
        ? specialized({ job, service, refs, measurements, pricedRows, onChange, createMeasurement })
        : el('div', {}, [
            ...measurements.map(m => renderMeasurement(m, resolveService(m.service_id) || service)),
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
          ])
    ]);
  }

  /** A child service's own measurements group under its PARENT's card
   *  (services.parent_key), not as a second, unrelated-looking service --
   *  this is what actually makes "jump wire stays part of the lighting
   *  card" / "valleys stay part of the heating-wire card" true in the
   *  editor, rather than just true by convention. Falls back to the
   *  measurement's own service if its parent_key doesn't resolve to a
   *  known service (data integrity issue, not something to crash over). */
  function groupServiceFor(service) {
    if (!service?.parent_key) return service;
    return refs.services.find(s => s.key === service.parent_key) || service;
  }

  function render({ measurements, pricing }) {
    const byGroup = new Map();
    for (const m of measurements) {
      const svc = resolveService(m.service_id);
      if (!svc) continue;
      const group = groupServiceFor(svc);
      if (!byGroup.has(group.id)) byGroup.set(group.id, []);
      byGroup.get(group.id).push(m);
    }

    const pricedRowsByGroup = new Map();
    for (const p of pricing) {
      const svc = resolveService(p.service_id);
      if (!svc) continue;
      const group = groupServiceFor(svc);
      if (!pricedRowsByGroup.has(group.id)) pricedRowsByGroup.set(group.id, []);
      pricedRowsByGroup.get(group.id).push(p);
    }
    // A component can be on the job (a measurement exists) before the
    // first calculate_job_pricing pass has anything to report for it --
    // make sure its own zeroed row is still present so the group's total/
    // badge accounts for it instead of silently omitting it.
    for (const [groupId, ms] of byGroup) {
      const rows = pricedRowsByGroup.get(groupId) || [];
      const covered = new Set(rows.map(r => r.service_id));
      for (const m of ms) {
        if (!covered.has(m.service_id)) {
          covered.add(m.service_id);
          rows.push({ service_id: m.service_id, amount: 0, unit_rate: 0, minimum_applied: false });
        }
      }
      pricedRowsByGroup.set(groupId, rows);
    }

    // Child services (jump-wire, a heat-cable valley/corner) are never
    // independently addable -- they only ever appear through their
    // parent's own calculator, generic or specialized.
    const usedIds = new Set(byGroup.keys());
    const available = refs.services.filter(s => s.quotable && !s.parent_key && !usedIds.has(s.id));

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
                  for (const group of modifierGroupsFor(refs.modifiers, service.id)) {
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

    const blocks = [...byGroup.entries()].map(([groupId, ms]) => {
      const service = refs.services.find(s => s.id === groupId);
      if (!service) return null;
      return renderServiceBlock(service, ms, pricedRowsByGroup.get(groupId) || []);
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
