import * as api from '../lib/api.js';
import { el, select, numberInput, confirmAction, toast } from '../../../shared/dom.js';
import { money } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';

/** Heating Wire Installation's own calculator -- the first service-
 *  specific editor in this system, built to prove the shared quote
 *  engine (job_sections, job_measurements, calculate_job_pricing, the
 *  child-service pattern, review_required) can carry a genuinely more
 *  complex service without a parallel data model. Nothing here computes
 *  a dollar figure: every number displayed is read straight from
 *  pricedRows, which measurements.js already built from
 *  calculate_job_pricing. This file only ever collects measurements/
 *  options and renders the breakdown -- see quoting_engine docs on why
 *  that split matters for auditability.
 *
 *  A job_measurements row IS an eave run, a downspout drop, or a valley/
 *  corner count -- there is no separate "heating wire" table. Eave vs
 *  downspout is a cosmetic grouping only (by label prefix, applied when
 *  this component creates the row); nothing about pricing depends on
 *  it, so a tech renaming a label never breaks a calculation, only
 *  which heading it's shown under. */

const DOWNSPOUT_PREFIX = 'Downspout — ';
const CHILD_KEYS = {
  valley1st: 'winter_deicing_cables_valley_1st',
  valley2nd: 'winter_deicing_cables_valley_2nd',
  corner1st: 'winter_deicing_cables_corner_1st',
  corner2nd: 'winter_deicing_cables_corner_2nd'
};

function modifierGroupsFor(refs, serviceId) {
  const groups = new Map();
  for (const m of refs.modifiers) {
    if (m.service_id !== serviceId) continue;
    if (m.group_key === 'height' || m.group_key === 'access') continue; // section-driven, same rule as measurements.js
    if (!groups.has(m.group_key)) groups.set(m.group_key, { key: m.group_key, label: m.group_label, options: [] });
    groups.get(m.group_key).options.push(m);
  }
  return [...groups.values()];
}

export function createHeatingWireCalculator({ job, service, refs, measurements, pricedRows, onChange, createMeasurement }) {
  const pricedByService = new Map(pricedRows.map(p => [p.service_id, p]));
  const childIds = Object.fromEntries(
    Object.entries(CHILD_KEYS).map(([k, key]) => [k, refs.services.find(s => s.key === key)?.id])
  );

  const cableRuns = measurements.filter(m => m.service_id === service.id);
  const eaveRuns = cableRuns.filter(m => !(m.label || '').startsWith(DOWNSPOUT_PREFIX));
  const downspoutRuns = cableRuns.filter(m => (m.label || '').startsWith(DOWNSPOUT_PREFIX));

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
       ...refs.sections.map(s => ({ value: s.id, label: `${s.name} (${s.storeys === '2_storey' ? '2 storey' : s.storeys === '3_storey' ? '3 storey' : '1 storey'}, ${s.access})` })),
       { value: NEW_SECTION, label: '+ New elevation…' }],
      measurement.section_id || '',
      async (e) => {
        let value = e.target.value;
        if (value === NEW_SECTION) {
          const name = window.prompt('Name this elevation (e.g. "Front lower roof"):');
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

  function cableRunRow(measurement, { removable = true } = {}) {
    const section = refs.sections.find(s => s.id === measurement.section_id);
    const qtyInput = numberInput(measurement.quantity, async (e) => {
      await api.updateMeasurement(measurement.id, { quantity: Number(e.target.value) || 0 });
      onChange();
    }, { step: '1', 'aria-label': 'Feet' });

    const selectedIds = new Set((measurement.measurement_modifiers || []).map(r => r.modifier_id));
    const modifierControls = modifierGroupsFor(refs, service.id).map((group) => {
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

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          value: (measurement.label || '').replace(DOWNSPOUT_PREFIX, ''), style: 'max-width:200px',
          placeholder: 'e.g. Front lower roof', 'aria-label': 'Run name',
          onChange: async (e) => {
            const prefix = (measurement.label || '').startsWith(DOWNSPOUT_PREFIX) ? DOWNSPOUT_PREFIX : '';
            await api.updateMeasurement(measurement.id, { label: prefix + (e.target.value.trim() || 'Run') });
          }
        }),
        removable ? el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove',
          onClick: async () => {
            if (!confirmAction('Remove this run?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        }) : null
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Feet' }), qtyInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Elevation' }), sectionSelectFor(measurement)])
      ]),
      section ? el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: `Height/access come from "${section.name}" (${section.storeys?.replace('_', ' ')}, ${section.access} access) -- ` +
              'edit those in Property Layout, not here.' }) : null,
      modifierControls.length ? el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, modifierControls) : null,
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this run for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addCableRun(isDownspout) {
    // Default to whichever elevation the tech just used for the last run in
    // this same group -- adding three runs in a row for "Rear" shouldn't
    // mean reselecting "Rear" from the dropdown three times. Only falls
    // back to pickOrCreateSection (which prompts for a brand-new elevation)
    // when this group has no prior run to copy from.
    const sameGroupRuns = isDownspout ? downspoutRuns : eaveRuns;
    const lastSectionId = sameGroupRuns.length ? sameGroupRuns[sameGroupRuns.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id,
      section_id: sectionId,
      unit: service.unit,
      quantity: 0,
      label: isDownspout ? `${DOWNSPOUT_PREFIX}Run` : 'Eave run',
      sort_order: measurements.length + 1
    });
    if (created) {
      for (const group of modifierGroupsFor(refs, service.id)) {
        const def = group.options.find((o) => o.is_default);
        if (def) await api.setMeasurementModifier(created.id, [], def.id);
      }
    }
    onChange();
  }

  /** Valleys/corners: a stepper over a single job_measurements row per
   *  child service, not a free-text count -- counting up/down is also
   *  how a tech corrects a miscount on site, per the field-UX brief.
   *  These child services carry no pricing_rules row yet (Phase 2/3
   *  decision: approved rate pending, never invented), so every create/
   *  update here also sets review_required -- never a silent $0. */
  function childStepper(label, childKey) {
    const childId = childIds[childKey];
    if (!childId) return null; // the migration that adds this child service hasn't landed -- degrade quietly
    // `let`, not `const` -- reassigned below after a create/delete so a
    // second click in the same render (before the next full reload()
    // refreshes `measurements`) updates/deletes the row it just made,
    // instead of reading the original (now stale) "nothing exists yet"
    // snapshot and creating a duplicate every time.
    let existing = measurements.find((m) => m.service_id === childId);
    const priced = pricedByService.get(childId);
    let count = existing?.quantity || 0;

    const countLabel = el('strong', { text: String(count) });
    const minus = el('button', { class: 'btn btn--sm', text: '−', type: 'button', 'aria-label': `Fewer ${label}` });
    const plus = el('button', { class: 'btn btn--sm', text: '+', type: 'button', 'aria-label': `More ${label}` });

    async function apply(next) {
      next = Math.max(0, next);
      count = next; // the +/- handlers below close over `count`, not `next` -- without this every click recomputes from the original value instead of the last one
      countLabel.textContent = String(next);
      // Disabled for the round trip, not just visually mid-count: a second
      // tap landing before the first create resolves is exactly how a
      // stepper would otherwise fire two creates instead of a create then
      // an update. This does not fully close that gap offline (a queued
      // create resolves with no row id to update next time, so a second
      // offline tap before the first ever syncs still creates a second
      // row) -- a real, narrow, documented limitation, not solved here.
      minus.disabled = true; plus.disabled = true;
      try {
        if (next === 0 && existing) {
          await api.deleteMeasurement(existing.id);
          existing = null;
        } else if (existing) {
          await api.updateMeasurement(existing.id, { quantity: next });
        } else if (next > 0) {
          const created = await createMeasurement(job.id, {
            service_id: childId, section_id: null, unit: 'each', quantity: next,
            label, review_required: true,
            review_reason: 'No approved rate configured for this component yet -- price manually.',
            sort_order: measurements.length + 1
          });
          // offline-queued creates (field console, no connection) return
          // null -- there is no row id yet to attach the next tap's update
          // to, so this stays in the "create" branch until the next full
          // reload() brings back the synced row (same queued-create
          // handoff every other measurement already uses).
          if (created) existing = created;
          else toast('Offline — saved locally, will sync automatically');
        }
      } finally {
        minus.disabled = false; plus.disabled = false;
        onChange();
      }
    }

    minus.addEventListener('click', () => apply(count - 1));
    plus.addEventListener('click', () => apply(count + 1));

    return el('div', { class: 'row-item', style: 'margin:0 0 6px' }, [
      el('div', { class: 'row-item__main' }, [
        el('strong', { text: label }),
        priced && Number(priced.amount) > 0
          ? el('div', { class: 'row-item__meta', text: money(priced.amount) })
          : el('div', { class: 'row-item__meta', text: 'Not priced yet' })
      ]),
      el('div', { style: 'display:flex;align-items:center;gap:10px' }, [minus, countLabel, plus])
    ]);
  }

  // Bracket repair: an authorization, not a priced line -- the price-book
  // has no bracket-replacement rate, so this only ever flags the job for
  // review (the existing manual-pricing mechanism), never computes a
  // number. Tracked on the first eave run, since there's no "whole
  // service" row to hang a flag on in this data model.
  const primaryRun = eaveRuns[0] || downspoutRuns[0];
  const bracketAuthorized = !!primaryRun?.notes?.includes('bracket-repair-authorized');
  const bracketCheckbox = el('input', { type: 'checkbox', checked: bracketAuthorized });
  const bracketLabel = el('label', { class: `check ${bracketAuthorized ? 'is-on' : ''}` }, [
    bracketCheckbox,
    el('span', { text: 'Authorize bracket repairs if found on site (price confirmed after inspection)' })
  ]);
  bracketCheckbox.addEventListener('change', async () => {
    if (!primaryRun) { toast('Add an eave or downspout run first', 'error'); bracketCheckbox.checked = false; return; }
    const on = bracketCheckbox.checked;
    bracketLabel.className = `check ${on ? 'is-on' : ''}`;
    const notes = (primaryRun.notes || '').replace('bracket-repair-authorized', '').trim();
    await api.updateMeasurement(primaryRun.id, {
      notes: on ? `${notes} bracket-repair-authorized`.trim() : (notes || null),
      review_required: on ? true : primaryRun.review_required,
      review_reason: on ? (primaryRun.review_reason || 'Bracket repair authorized -- confirm final count/price on site.') : primaryRun.review_reason
    });
    onChange();
  });

  // Pure display aggregation (sum of already-entered footage, zero price
  // math) so a tech can sanity-check "that's 142 ft" against what they
  // measured without re-adding each row mentally -- not a substitute for
  // the card's own total above, just a faster way to see whether THIS
  // group of rows looks right before trusting the dollar figure that sums
  // off of it.
  function sectionHeading(text, runs) {
    const feet = runs.reduce((sum, m) => sum + Number(m.quantity || 0), 0);
    return el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px' }, [
      el('h3', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0', text }),
      runs.length
        ? el('span', { class: 'hint', style: 'margin:0', text: `${feet} ft total across ${runs.length} run${runs.length === 1 ? '' : 's'}` })
        : null
    ]);
  }

  return el('div', {}, [
    sectionHeading('Eave / gutter sections', eaveRuns),
    ...eaveRuns.map((m) => cableRunRow(m)),
    el('div', { class: 'btn-row', style: 'margin-bottom:16px' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add eave section', onClick: () => addCableRun(false) })
    ]),

    sectionHeading('Downspout drops', downspoutRuns),
    ...downspoutRuns.map((m) => cableRunRow(m)),
    el('div', { class: 'btn-row', style: 'margin-bottom:16px' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add downspout drop', onClick: () => addCableRun(true) })
    ]),

    el('h3', { style: 'margin:0 0 8px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)',
      text: 'Roof features' }),
    el('div', { style: 'margin-bottom:16px' }, [
      childStepper('Valley — 1st floor', 'valley1st'),
      childStepper('Valley — 2nd floor', 'valley2nd'),
      childStepper('Corner — 1st floor', 'corner1st'),
      childStepper('Corner — 2nd floor', 'corner2nd')
    ].filter(Boolean)),

    el('h3', { style: 'margin:0 0 8px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)',
      text: 'Pre-fitting assessment' }),
    el('div', { class: 'btn-row', style: 'margin-bottom:10px' }, [bracketLabel]),
    el('p', { class: 'hint', style: 'margin:0 0 16px',
      text: 'Gutter condition (good / older / poor) is set per run above -- "poor" is where guard removal or ' +
            'other pre-fitting work gets assessed on site.' })
  ]);
}
