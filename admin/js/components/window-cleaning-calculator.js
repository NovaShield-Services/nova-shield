import * as api from '../lib/api.js';
import { el, select, confirmAction, toast } from '../../../shared/dom.js';
import { qty } from '../../../shared/format.js';
import { reviewFlag } from './review-flag.js';
import { modifierGroupsFor } from './modifier-groups.js';

/** Window Cleaning's own calculator -- the one count-based (unit='each')
 *  service seen so far, so this is the first calculator whose PRIMARY
 *  measurement is a stepper, not a typed number. A job_measurements row
 *  here is one counted group -- "Front ground-floor standard windows: 6" --
 *  not one row per physical window; the real price book has no modifier
 *  that varies window-by-window finely enough to need that, and nobody
 *  wants to tap "+" seventy times for a big house.
 *
 *  Real configured modifiers for this service: height (section-driven,
 *  same convention as every other service), "Scope" (Exterior only --
 *  the DEFAULT, at a 30% discount off interior+exterior -- vs Interior +
 *  exterior) and "Window type" (Standard / Many panes-divided / Storm-
 *  difficult). There is no separate access-difficulty group for this
 *  service -- the closest real equivalent to "difficult access" is the
 *  Window type group's "Storm / difficult" option, so that's what a
 *  difficult-to-reach or awkward window gets counted under; inventing a
 *  parallel access dimension the price book doesn't have would be
 *  exactly the kind of made-up category this phase was built to avoid.
 *
 *  Scope gets the same one-control-for-the-whole-card treatment Gutter
 *  Brightening's Scope got, for the same reason: "exterior only" vs
 *  "interior + exterior" describes what service is being performed this
 *  visit, not a property of one group of windows -- there's no coherent
 *  price for doing interiors on the front windows but not the back ones
 *  in the same visit. Window type stays per-row, because it genuinely
 *  does vary group to group (some windows really are storm windows,
 *  others aren't).
 *
 *  Deliberately NO duplicate button, unlike Siding and Gutter: a wall's
 *  square footage or a gutter run's length is a real starting estimate
 *  worth copying to a neighbouring area. A window COUNT is discovered by
 *  counting -- copying a stale count from one bucket into a new one
 *  wouldn't save real work, it would just be a wrong number sitting
 *  there until someone notices. Count from zero every time. */

export function createWindowCleaningCalculator({ job, service, refs, measurements, onChange, createMeasurement, saveQuantity }) {
  const rows = measurements.filter((m) => m.service_id === service.id);

  const allGroups = modifierGroupsFor(refs.modifiers, service.id);
  const scopeGroup = allGroups.find((g) => g.key === 'scope') || null;
  const typeGroup = allGroups.find((g) => g.key !== 'scope') || null;

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
        text: 'Applies to every window group below -- this describes the visit, not one group of windows.' })
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
          const name = window.prompt('Name this elevation (e.g. "Garage"):');
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

  function windowGroupRow(measurement) {
    const section = refs.sections.find((s) => s.id === measurement.section_id);
    const selectedIds = new Set((measurement.measurement_modifiers || []).map((r) => r.modifier_id));

    const typeControl = typeGroup ? (() => {
      const groupIds = typeGroup.options.map((o) => o.id);
      const current = typeGroup.options.find((o) => selectedIds.has(o.id));
      const defaultOpt = typeGroup.options.find((o) => o.is_default);
      return el('label', { class: 'field', style: 'margin:0' }, [
        el('span', { text: typeGroup.label }),
        select(
          typeGroup.options.map((o) => ({ value: o.id, label: o.label })),
          current?.id || defaultOpt?.id || '',
          async (e) => { await api.setMeasurementModifier(measurement.id, groupIds, e.target.value); onChange(); }
        )
      ]);
    })() : null;

    const notesInput = el('input', {
      value: measurement.notes || '',
      placeholder: 'Notes (e.g. "2 upper rear windows blocked by deck roof")',
      'aria-label': 'Notes',
      onChange: async (e) => { await api.updateMeasurement(measurement.id, { notes: e.target.value.trim() || null }); }
    });

    // The row already exists (created by "+ Add window group" below) and
    // keeps existing even at a count of zero -- unlike heating wire's
    // valley/corner steppers, this row carries its own label/section/type/
    // notes/review state that a tech may set before counting a single
    // window, so there's no "nothing to represent yet" moment to delete
    // back to. Only the explicit Remove button deletes the row.
    let count = measurement.quantity || 0;
    const countLabel = el('strong', { text: String(count) });
    const minus = el('button', { class: 'btn btn--sm', text: '−', type: 'button', 'aria-label': 'Fewer' });
    const plus = el('button', { class: 'btn btn--sm', text: '+', type: 'button', 'aria-label': 'More' });

    async function apply(next) {
      next = Math.max(0, next);
      count = next; // close over the last value, not the stale initial one -- see heating wire's stepper for why this matters
      countLabel.textContent = String(next);
      minus.disabled = true; plus.disabled = true;
      if (!await saveQuantity(measurement, next)) {
        count = measurement.quantity || 0;
        countLabel.textContent = String(count);
      }
      minus.disabled = false; plus.disabled = false;
    }
    minus.addEventListener('click', () => apply(count - 1));
    plus.addEventListener('click', () => apply(count + 1));

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('input', {
          // flex:1 rather than a fixed max-width: this row only ever has
          // three elements (name, stepper, Remove), so unlike the other
          // calculators' more crowded headers there's no reason to cap
          // this one -- a fixed cap just truncated every real label
          // ("Front ground standard" etc) even with the rest of a 1400px
          // desktop row sitting empty, found by actually screenshotting at
          // multiple widths rather than assuming the same number that
          // worked for a 4-element header applies here too.
          value: measurement.label || '', style: 'flex:1;min-width:120px',
          placeholder: 'e.g. Front ground floor', 'aria-label': 'Group name',
          onChange: async (e) => { await api.updateMeasurement(measurement.id, { label: e.target.value.trim() || 'Window group' }); }
        }),
        el('div', { style: 'display:flex;align-items:center;gap:10px' }, [minus, countLabel, plus]),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Remove', type: 'button',
          onClick: async () => {
            if (!confirmAction('Remove this window group?')) return;
            await api.deleteMeasurement(measurement.id);
            onChange();
          }
        })
      ]),
      el('div', { class: 'grid grid--2' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Elevation' }), sectionSelectFor(measurement)]),
        typeControl
      ].filter(Boolean)),
      section ? el('p', { class: 'hint', style: 'margin:4px 0 0',
        text: `Height comes from "${section.name}" (${(section.storeys || '1_storey').replace('_', ' ')}) -- ` +
              'edit that in Property Layout, not here.' }) : null,
      el('label', { class: 'field', style: 'margin-top:10px' }, [el('span', { text: 'Notes' }), notesInput]),
      reviewFlag({
        required: measurement.review_required, reason: measurement.review_reason,
        label: 'Flag this group for review',
        save: (patch) => api.updateMeasurement(measurement.id, patch)
      })
    ]);
  }

  async function addWindowGroup() {
    const lastSectionId = rows.length ? rows[rows.length - 1].section_id : null;
    const sectionId = lastSectionId || await pickOrCreateSection(null);
    const created = await createMeasurement(job.id, {
      service_id: service.id, section_id: sectionId, unit: service.unit,
      quantity: 0, label: 'Window group', sort_order: measurements.length + 1
    });
    if (created) {
      if (typeGroup) {
        const def = typeGroup.options.find((o) => o.is_default);
        if (def) await api.setMeasurementModifier(created.id, typeGroup.options.map((o) => o.id), def.id);
      }
      const scopeId = currentScopeModifierId();
      if (scopeGroup && scopeId) await api.setMeasurementModifier(created.id, scopeGroup.options.map((o) => o.id), scopeId);
    } else {
      toast('Offline — saved locally, will sync automatically');
    }
    onChange();
  }

  const totalCount = rows.reduce((sum, m) => sum + Number(m.quantity || 0), 0);

  return el('div', {}, [
    scopeControl(),
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin:14px 0 8px' }, [
      el('h3', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0',
        text: 'Window groups' }),
      rows.length
        // "windows", not unitLabel(service.unit) ("each") -- a measurement
        // summary should read the way a tech would actually say it; "23
        // each" isn't that, "23 windows" is.
        ? el('span', { class: 'hint', style: 'margin:0',
            text: `${qty(totalCount)} window${totalCount === 1 ? '' : 's'} total across ${rows.length} group${rows.length === 1 ? '' : 's'}` })
        : null
    ]),
    ...rows.map((m) => windowGroupRow(m)),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--sm', text: '+ Add window group', onClick: addWindowGroup })
    ])
  ].filter(Boolean));
}
