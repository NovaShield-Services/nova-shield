import * as api from '../lib/api.js';
import { el, fill, numberInput, confirmAction, toast } from '../../../shared/dom.js';
import { money, qty, num, unitLabel } from '../../../shared/format.js';
import { trySave } from '../lib/save.js';

/* Batch 8.1 -- the materials a job needs, derived from its measurements.
 *
 * LOADED ON DEMAND, not with the job. The estimate is a four-table
 * aggregate and most visits to a job screen are about scheduling, photos or
 * the quote; making every one of them pay for it would slow the screen that
 * the field actually opens in a driveway. The button says what it is going
 * to do, and the result is cached until the operator asks again.
 *
 * NOT PRICING. Every figure here is a quantity, plus a purchasing cost
 * basis where one has been recorded. Nothing on this panel reaches the
 * quote, and the quote does not read it.
 *
 * CONSUMPTION IS EXPLICIT. "Take off stock" posts ledger movements against
 * this job, and is never triggered by accepting a quote: a job's real parts
 * usage is rarely exactly the estimate, and a quote that is never accepted
 * must not draw down the shelf. The amounts are editable before posting for
 * the same reason. */

export function createJobMaterialsPanel({ jobId }) {
  const root = el('div', { class: 'card' });
  let estimate = null;
  let loading = false;

  async function load() {
    loading = true;
    paint();
    try {
      estimate = await api.estimateJobMaterials(jobId);
    } catch (err) {
      estimate = { error: err.message };
    } finally {
      loading = false;
      paint();
    }
  }

  function head() {
    return el('div', { class: 'card__head' }, [
      el('div', {}, [
        el('h2', { text: 'Materials' }),
        el('p', { text: 'Worked out from this job’s measurements and what each service consumes. ' +
                        'Quantities only — nothing here affects the quote.' })
      ]),
      el('button', {
        class: 'btn btn--sm', type: 'button',
        text: loading ? 'Working…' : estimate ? 'Recalculate' : 'Work out materials',
        disabled: loading,
        onClick: load
      })
    ]);
  }

  function paint() {
    if (!estimate) {
      fill(root, [head(),
        loading
          ? el('p', { class: 'hint', text: 'Reading measurements and stock…' })
          : el('p', { class: 'hint',
              text: 'Not calculated yet. It is not loaded automatically because it reads every ' +
                    'measurement on the job plus the whole stock ledger.' })]);
      return;
    }

    if (estimate.error) {
      fill(root, [head(), el('p', { class: 'error-text', text: estimate.error })]);
      return;
    }

    const lines = estimate.lines || [];
    const unmapped = estimate.unmapped_services || [];
    const short = lines.filter((l) => Number(l.shortfall) > 0);
    const flagged = lines.filter((l) => l.from_flagged_measurement);
    const costed = lines.filter((l) => l.estimated_cost != null);
    const totalCost = costed.reduce((sum, l) => sum + Number(l.estimated_cost), 0);

    fill(root, [
      head(),

      lines.length === 0 && unmapped.length === 0
        ? el('p', { class: 'hint',
            text: 'No measurements with a quantity on this job yet, so there is nothing to work out.' })
        : null,

      flagged.length
        ? el('p', { class: 'warn', style: 'margin:0 0 10px',
            text: flagged.length === 1
              ? 'One requirement comes from a measurement flagged for review, so the quantity is not confirmed yet.'
              : `${flagged.length} requirements come from measurements flagged for review, ` +
                'so those quantities are not confirmed yet.' })
        : null,

      lines.length
        ? el('div', {}, lines.map((line) => lineRow(line, load)))
        : null,

      costed.length
        ? el('p', { class: 'hint', style: 'margin-top:10px' }, [
            el('span', { text: `Material cost basis ${money(totalCost)}` }),
            costed.length < lines.length
              ? el('span', { text: ` — excludes ${lines.length - costed.length} part(s) with no cost recorded, ` +
                                   'so the real figure is higher.' })
              : null,
            el('span', { text: ' This is a purchasing cost, not a price.' })
          ].filter(Boolean))
        : null,

      short.length
        ? el('p', { class: 'warn', style: 'margin-top:10px',
            text: `${short.length} part${short.length === 1 ? '' : 's'} short of what this job needs. ` +
                  'Raise a purchase order from the Inventory screen.' })
        : null,

      unmapped.length
        ? el('div', { class: 'section-box', style: 'margin-top:12px' }, [
            el('div', { class: 'section-box__head', style: 'flex-wrap:wrap' }, [
              el('strong', { text: 'Services with no parts mapped' })
            ]),
            el('p', { class: 'hint', style: 'margin:0',
              text: unmapped.map((s) => `${s.service_name} (${qty(s.measured_quantity)} ${unitLabel(s.service_unit)})`)
                .join(', ') }),
            el('p', { class: 'hint', style: 'margin:6px 0 0',
              text: 'These contribute nothing above because nobody has told the app what they consume — ' +
                    'which is not the same as needing no parts. Map them under Inventory → Service parts.' })
          ])
        : null,

      el('p', { class: 'hint', style: 'margin-top:10px' }, [
        el('a', { href: '#/inventory', text: 'Open Inventory' })
      ])
    ]);
  }

  function lineRow(line, reload) {
    const required = Number(line.required);
    const onHand = Number(line.on_hand);
    const shortfall = Number(line.shortfall);

    /* Pre-filled with the estimate, editable before posting: what actually
       came off the van is the number that belongs in the ledger. */
    const useInput = numberInput(required, null, {
      step: '0.01', min: '0',
      'aria-label': `Quantity of ${line.name} used on this job`
    });

    return el('div', { class: 'section-box', style: 'margin:8px 0' }, [
      el('div', { class: 'section-box__head', style: 'flex-wrap:wrap' }, [
        el('div', { style: 'flex:1;min-width:140px' }, [
          el('strong', { text: line.name }),
          el('span', { class: 'row-item__meta',
            text: [line.sku,
                   `needs ${qty(required)} ${unitLabel(line.unit)}`,
                   `${qty(onHand)} on hand`].filter(Boolean).join(' · ') })
        ]),
        shortfall > 0
          ? el('span', { class: 'badge badge--warn',
              text: `${qty(shortfall)} short · ${qty(line.packs_to_order)} pack(s)` })
          : el('span', { class: 'badge badge--ok', text: 'In stock' })
      ]),

      el('p', { class: 'hint', style: 'margin:6px 0 0',
        text: (line.from_services || [])
          .map((s) => `${s.service_name}: ${qty(s.measured_quantity)} ${unitLabel(s.service_unit)} ` +
                      `× ${qty(s.quantity_per_unit)}` +
                      (Number(s.waste_factor) > 0
                        ? ` + ${Math.round(Number(s.waste_factor) * 100)}% waste`
                        : ''))
          .join('   ·   ') }),

      el('div', { class: 'grid grid--2', style: 'margin-top:8px' }, [
        el('div', { style: 'margin:0' }, [
          el('label', { class: 'field', style: 'margin:0' }, [
            el('span', { text: `Used on this job (${unitLabel(line.unit)})` }),
            useInput
          ]),
          el('p', { class: 'hint', style: 'margin:4px 0 0',
            text: 'Edit before posting if the real usage differed.' })
        ]),
        el('div', { class: 'btn-row', style: 'align-items:flex-end' }, [
          el('button', {
            class: 'btn btn--sm', type: 'button', text: 'Take off stock',
            onClick: async () => {
              const used = num(useInput.value, 0);
              if (!(used > 0)) { toast('Enter how much was used.', 'error'); return; }
              if (!confirmAction(
                `Take ${qty(used)} ${unitLabel(line.unit)} of ${line.name} off stock for this job? ` +
                'This posts a ledger movement and is undone by posting a correction, not by deleting it.')) return;

              await trySave(() => api.postStockMove({
                materialId: line.material_id,
                delta: -Math.abs(used),
                reason: 'consumed',
                jobId,
                note: `Used on job`
              }), {
                success: `${qty(used)} ${unitLabel(line.unit)} taken off stock`,
                after: reload
              });
            }
          })
        ])
      ])
    ]);
  }

  paint();
  return { root, reload: load };
}
