import * as api from '../lib/api.js';
import { el, select, numberInput, confirmAction, toast } from '../../../shared/dom.js';
import { fill } from '../lib/admin-dom.js';
import { money, qty, num, date, dateTime, unitLabel, humanise } from '../../../shared/format.js';
import { trySave } from '../lib/save.js';
import { signedDelta, packsToUnits } from '../lib/inventory-math.js';

/* Batch 8.1 -- Inventory.
 *
 * Four surfaces behind one route, selected by ?tab=:
 *
 *   stock      the parts catalogue with its derived on-hand figure, and the
 *              movement ledger behind any one part
 *   purchasing purchase orders, counted in PACKS because that is what the
 *              supplier sells, with receiving that converts to units once
 *   mapping    what each service consumes per measured unit, which is what
 *              makes a job's requirement derivable from measurements that
 *              already exist instead of a second round of data entry
 *   sets       Christmas rental sets as tracked physical assets
 *
 * Tabs rather than four nav entries: these are one job ("what do we have,
 * what do we owe, what is out") and a top-level entry each would push the
 * other five nav links off a phone. The tab rides in the query string via
 * replaceQuery, so it survives a reload and can be linked, without putting
 * a history entry between the operator and Android Back -- same choice the
 * jobs filters make.
 *
 * WHAT THIS SCREEN DOES NOT DO
 *
 * It does not price anything. ns_materials.unit_cost is a purchasing cost
 * basis; no figure here reaches a quote, and the materials estimate is
 * quantities plus that cost basis, never a customer total.
 *
 * It does not decrement stock when a quote is accepted. Consumption is an
 * explicit act from this screen, because a quote that is never accepted
 * must not draw down the shelf, and a job's parts are rarely exactly what
 * was estimated.
 *
 * It never edits or deletes a stock movement. A mistake is corrected by
 * posting its reverse, which is the only way a disputed shelf count stays
 * explainable. */

const TABS = [
  ['stock',      'Stock'],
  ['purchasing', 'Purchasing'],
  ['mapping',    'Service parts'],
  ['sets',       'Rental sets']
];

const CATEGORIES = ['track', 'light', 'controller', 'power_supply', 'connector',
                    'clip', 'wire', 'rental_set', 'consumable', 'tool', 'other'];
const UNITS = ['each', 'linear_ft', 'box', 'roll', 'kit', 'set'];
const SET_STATUSES = ['in_storage', 'assigned', 'installed', 'in_repair', 'retired', 'lost'];
const PO_STATUSES = ['draft', 'ordered', 'partial', 'received', 'cancelled'];

/* Which movement reasons an operator may post by hand, and the sign each
   one carries. The database enforces this pairing too (a negative receipt
   or a positive consumption is refused); this table is here so the form
   cannot offer a combination the database would reject. 'received' is
   absent on purpose: a receipt belongs to a purchase order, which posts it
   with the pack conversion applied. */
const MANUAL_REASONS = [
  ['opening',    'Opening count',    +1],
  ['consumed',   'Used on a job',    -1],
  ['damaged',    'Damaged / wasted', -1],
  ['returned',   'Returned to shelf', +1],
  ['adjustment', 'Correction',         0]
];

/* The caption span has to be a DIRECT child of `.field`, because the only
   rule that styles it is `.field > span`. And the hint has to sit OUTSIDE
   the <label>: `.field > span` is more specific than `.hint`, so a nested
   hint span would be painted as a second field caption, and <p> is not
   phrasing content so it cannot live inside a <label> at all. Same shape as
   settings-form.js's settingField, for the same two reasons. */
function labelled(text, control, hint) {
  return el('div', { style: 'margin:0' }, [
    el('label', { class: 'field', style: 'margin:0' }, [
      el('span', { text }),
      control
    ]),
    hint ? el('p', { class: 'hint', style: 'margin:4px 0 0', text: hint }) : null
  ].filter(Boolean));
}

/** A number input that saves on change (blur / commit), not on every
 *  keystroke. numberInput()'s second argument binds `input`, which would
 *  fire a write per digit typed -- three writes to store "180". */
function savingNumber(value, onCommit, attrs = {}) {
  return numberInput(value, null, { ...attrs, onChange: onCommit });
}

/* ------------------------------------------------------------------ stock -- */

function stockTab() {
  const host = el('div', {});

  async function load() {
    const materials = await api.listMaterials({ includeInactive: true });
    const suppliers = await api.listSuppliers({ includeInactive: true });
    const low = materials.filter((m) => m.active && m.needs_reorder);

    fill(host, [
      materials.length === 0 ? emptyCatalogue(suppliers, load) : null,

      low.length
        ? el('div', { class: 'card' }, [
            el('div', { class: 'card__head' }, [
              el('div', {}, [
                el('h2', { text: `${low.length} part${low.length === 1 ? '' : 's'} at or below the reorder point` }),
                el('p', { text: 'Counted from the stock ledger, not a stored total.' })
              ])
            ]),
            el('div', {}, low.map((m) => el('div', { class: 'row-item' }, [
              el('div', { class: 'row-item__main' }, [
                el('strong', { text: m.name }),
                el('span', { class: 'row-item__meta',
                  text: `${qty(m.on_hand)} ${unitLabel(m.unit)} on hand · reorder at ` +
                        `${qty(m.reorder_point)} · ${m.ns_suppliers?.name || 'no supplier'}` })
              ])
            ])))
          ])
        : null,

      materials.length ? catalogueCard(materials, suppliers, load) : null,
      materials.length ? newMaterialCard(suppliers, load) : null
    ]);
  }

  load();
  return host;
}

function emptyCatalogue(suppliers, reload) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('div', {}, [
        el('h2', { text: 'No parts in the catalogue yet' }),
        el('p', { text: 'Nothing is pre-loaded: the supplier catalogue has never been read by this app, ' +
                        'so every part, pack size and cost here is one somebody has checked.' })
      ])
    ]),
    el('p', { class: 'hint' }, [
      el('span', { text: 'Add parts from the supplier you order from — ' }),
      suppliers[0]?.website
        ? el('a', { href: suppliers[0].website, target: '_blank', rel: 'noopener noreferrer',
                    text: suppliers[0].website })
        : el('span', { text: 'set a supplier website first' }),
      el('span', { text: '. Enter the pack size the supplier sells (a 150 ft roll is 150 linear ft, pack size 150).' })
    ]),
    newMaterialCard(suppliers, reload, { bare: true })
  ]);
}

function catalogueCard(materials, suppliers, reload) {
  const host = el('div', { class: 'card' });
  const byCategory = new Map();
  for (const m of materials) {
    if (!byCategory.has(m.category)) byCategory.set(m.category, []);
    byCategory.get(m.category).push(m);
  }

  fill(host, [
    el('div', { class: 'card__head' }, [
      el('div', {}, [
        el('h2', { text: 'Parts catalogue' }),
        el('p', { text: `${materials.length} part${materials.length === 1 ? '' : 's'}. ` +
                        'On hand is the sum of the movement ledger.' })
      ])
    ]),
    ...[...byCategory.entries()].map(([category, rows]) => el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head', style: 'flex-wrap:wrap' }, [el('strong', { text: humanise(category) })]),
      ...rows.map((m) => materialRow(m, suppliers, reload))
    ]))
  ]);
  return host;
}

function materialRow(m, suppliers, reload) {
  const host = el('div', { class: 'section-box', style: 'margin:8px 0' });
  let movesOpen = false;

  function paint() {
    fill(host, [
      el('div', { class: 'section-box__head', style: 'flex-wrap:wrap' }, [
        el('div', { style: 'flex:1;min-width:140px' }, [
          el('strong', { text: m.name }),
          el('span', { class: 'row-item__meta',
            text: [m.sku, m.ns_suppliers?.name, `pack of ${qty(m.pack_quantity)}`]
              .filter(Boolean).join(' · ') })
        ]),
        el('span', {
          class: `badge ${m.needs_reorder ? 'badge--warn' : 'badge--ok'}`,
          text: `${qty(m.on_hand)} ${unitLabel(m.unit)}`
        }),
        m.active ? null : el('span', { class: 'badge badge--muted', text: 'Inactive' }),
        el('button', {
          class: 'btn btn--sm', type: 'button',
          text: movesOpen ? 'Hide movements' : 'Movements',
          onClick: () => { movesOpen = !movesOpen; paint(); }
        })
      ].filter(Boolean)),

      el('div', { class: 'grid grid--3', style: 'margin-top:8px' }, [
        labelled('Unit cost', savingNumber(m.unit_cost ?? '', async (e) => {
          const raw = e.target.value.trim();
          const next = raw === '' ? null : num(raw, 0);
          await trySave(() => api.updateMaterial(m.id, { unit_cost: next }), {
            revert: () => { e.target.value = m.unit_cost ?? ''; },
            after: () => { m.unit_cost = next; }
          });
        }, { step: '0.01', min: '0', 'aria-label': `${m.name} unit cost` }),
          m.unit_cost == null ? 'Blank means unknown, not free.' : `${money(m.unit_cost)} per ${unitLabel(m.unit)}`),

        labelled('Reorder at', savingNumber(m.reorder_point, async (e) => {
          const next = num(e.target.value, 0);
          await trySave(() => api.updateMaterial(m.id, { reorder_point: next }), {
            revert: () => { e.target.value = m.reorder_point; },
            after: reload
          });
        }, { step: '1', min: '0', 'aria-label': `${m.name} reorder point` })),

        labelled('Pack size', savingNumber(m.pack_quantity, async (e) => {
          const next = num(e.target.value, 1);
          if (!(next > 0)) { e.target.value = m.pack_quantity; toast('A pack size must be more than zero.', 'error'); return; }
          await trySave(() => api.updateMaterial(m.id, { pack_quantity: next }), {
            revert: () => { e.target.value = m.pack_quantity; },
            after: reload
          });
        }, { step: '1', min: '1', 'aria-label': `${m.name} pack size` }),
          `How many ${unitLabel(m.unit)} the supplier sells in one pack.`)
      ]),

      movementForm(m, reload),

      el('div', { class: 'btn-row', style: 'margin-top:8px' }, [
        el('button', {
          class: 'btn btn--sm', type: 'button',
          text: m.active ? 'Mark inactive' : 'Mark active',
          onClick: async () => {
            await trySave(() => api.updateMaterial(m.id, { active: !m.active }), {
              success: m.active ? 'Part marked inactive' : 'Part marked active',
              after: reload
            });
          }
        })
      ]),

      movesOpen ? movementList(m) : null
    ]);
  }

  paint();
  return host;
}

function movementForm(material, reload) {
  let reason = MANUAL_REASONS[0][0];
  // No placeholder: a unit word sitting in an empty NUMBER box reads as if
  // it were the value. The caption already carries the unit.
  const amount = numberInput('', null, {
    step: '1', min: '0', 'aria-label': `Quantity for ${material.name}`
  });
  const noteInput = el('input', { placeholder: 'Note (optional)', 'aria-label': 'Movement note' });
  const signHint = el('p', { class: 'hint', style: 'margin:4px 0 0' });

  function describeSign() {
    const sign = MANUAL_REASONS.find(([k]) => k === reason)?.[2] ?? 0;
    signHint.textContent = sign > 0
      ? 'Adds to the shelf.'
      : sign < 0
        ? 'Takes off the shelf.'
        : 'A correction may go either way — enter a negative number to take stock off.';
  }
  describeSign();

  return el('div', { style: 'margin-top:10px' }, [
    el('div', { class: 'grid grid--3' }, [
      labelled('Movement', select(
        MANUAL_REASONS.map(([value, label]) => ({ value, label })), reason,
        (e) => { reason = e.target.value; describeSign(); })),
      labelled(`Quantity (${unitLabel(material.unit)})`, amount),
      labelled('Note', noteInput)
    ]),
    signHint,
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [
      el('button', {
        class: 'btn btn--sm btn--primary', type: 'button', text: 'Post movement',
        onClick: async () => {
          const entered = num(amount.value, NaN);
          if (!Number.isFinite(entered) || entered === 0) {
            toast('Enter a quantity other than zero.', 'error');
            return;
          }
          // A correction keeps the sign the operator typed; everything else
          // takes the sign its reason implies, so "used 40" cannot be
          // entered as +40 and quietly add stock. See signedDelta.
          const sign = MANUAL_REASONS.find(([k]) => k === reason)?.[2] ?? 0;
          const delta = signedDelta(sign, entered);

          const ok = await trySave(() => api.postStockMove({
            materialId: material.id, delta, reason, note: noteInput.value.trim() || null
          }), { success: 'Movement posted' });
          if (ok) { amount.value = ''; noteInput.value = ''; await reload(); }
        }
      })
    ])
  ]);
}

function movementList(material) {
  const host = el('div', { style: 'margin-top:10px' },
    [el('p', { class: 'hint', text: 'Loading movements…' })]);

  api.listStockMoves(material.id).then((moves) => {
    fill(host, [
      el('h3', { style: 'margin:0 0 6px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)',
        text: 'Movement ledger' }),
      moves.length === 0
        ? el('p', { class: 'hint', text: 'No movements yet, so this part reads as zero on hand.' })
        : el('div', {}, moves.map((mv) => el('div', { class: 'row-item' }, [
            el('div', { class: 'row-item__main' }, [
              el('strong', {
                text: `${Number(mv.delta) > 0 ? '+' : ''}${qty(mv.delta)} ${unitLabel(material.unit)}`
              }),
              el('span', { class: 'row-item__meta',
                text: [humanise(mv.reason), dateTime(mv.occurred_at), mv.note].filter(Boolean).join(' · ') })
            ])
          ]))),
      el('p', { class: 'hint', style: 'margin-top:8px',
        text: 'Movements are never edited or deleted. Correct a mistake by posting a correction for the opposite amount.' })
    ]);
  }).catch((err) => {
    fill(host, [el('p', { class: 'error-text', text: err.message })]);
  });

  return host;
}

function newMaterialCard(suppliers, reload, { bare = false } = {}) {
  const name = el('input', { placeholder: 'e.g. 150 ft channel', 'aria-label': 'Part name' });
  const sku = el('input', { placeholder: 'Supplier code (optional)', 'aria-label': 'SKU' });
  const packQty = numberInput(1, null, { step: '1', min: '1', 'aria-label': 'Pack size' });
  const cost = numberInput('', null, { step: '0.01', min: '0', 'aria-label': 'Unit cost' });
  const reorder = numberInput(0, null, { step: '1', min: '0', 'aria-label': 'Reorder point' });
  let category = 'track';
  let unit = 'linear_ft';
  let supplierId = suppliers[0]?.id || '';

  const form = el('div', {}, [
    el('div', { class: 'grid grid--2' }, [
      labelled('Part name', name),
      labelled('Supplier code', sku, 'Unique per supplier. Leave blank if the supplier has none.')
    ]),
    el('div', { class: 'grid grid--3', style: 'margin-top:8px' }, [
      labelled('Category', select(
        CATEGORIES.map((c) => ({ value: c, label: humanise(c) })), category,
        (e) => { category = e.target.value; })),
      labelled('Counted in', select(
        UNITS.map((u) => ({ value: u, label: unitLabel(u) })), unit,
        (e) => { unit = e.target.value; })),
      labelled('Supplier', select(
        [{ value: '', label: 'No supplier' },
         ...suppliers.map((s) => ({ value: s.id, label: s.name }))],
        supplierId, (e) => { supplierId = e.target.value; }))
    ]),
    el('div', { class: 'grid grid--3', style: 'margin-top:8px' }, [
      labelled('Pack size', packQty, 'How many of the unit above come in one pack.'),
      labelled('Unit cost', cost, 'Leave blank if unknown — blank is not zero.'),
      labelled('Reorder at', reorder)
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
      el('button', {
        class: 'btn btn--primary', type: 'button', text: 'Add part',
        onClick: async () => {
          if (!name.value.trim()) { toast('A part needs a name.', 'error'); return; }
          const pack = num(packQty.value, 1);
          if (!(pack > 0)) { toast('A pack size must be more than zero.', 'error'); return; }

          const ok = await trySave(() => api.createMaterial({
            name: name.value.trim(),
            sku: sku.value.trim() || null,
            category, unit,
            supplier_id: supplierId || null,
            pack_quantity: pack,
            unit_cost: cost.value.trim() === '' ? null : num(cost.value, 0),
            reorder_point: num(reorder.value, 0)
          }), { success: 'Part added' });

          if (ok) {
            name.value = ''; sku.value = ''; cost.value = '';
            packQty.value = 1; reorder.value = 0;
            await reload();
          }
        }
      })
    ])
  ]);

  if (bare) return form;

  return el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('div', {}, [
        el('h2', { text: 'Add a part' }),
        el('p', { text: 'Entered by hand from the supplier’s own listing.' })
      ])
    ]),
    form
  ]);
}

/* ------------------------------------------------------------- purchasing -- */

function purchasingTab() {
  const host = el('div', {});

  async function load() {
    const [orders, suppliers, materials] = await Promise.all([
      api.listPurchaseOrders(), api.listSuppliers(), api.listMaterials()
    ]);

    fill(host, [
      newOrderCard(suppliers, load),
      orders.length === 0
        ? el('div', { class: 'card' }, [
            el('h2', { text: 'No purchase orders yet' }),
            el('p', { class: 'hint',
              text: 'Orders are counted in packs, because that is what the supplier sells. ' +
                    'Receiving converts packs to shelf units once, using the part’s pack size.' })
          ])
        : el('div', {}, orders.map((po) => orderCard(po, materials, load)))
    ]);
  }

  load();
  return host;
}

function newOrderCard(suppliers, reload) {
  const reference = el('input', { placeholder: 'Supplier order number (optional)', 'aria-label': 'Reference' });
  let supplierId = suppliers[0]?.id || '';

  return el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('div', {}, [
        el('h2', { text: 'Start a purchase order' }),
        el('p', { text: 'A draft needs no dates. It becomes an order when you mark it ordered.' })
      ])
    ]),
    suppliers.length === 0
      ? el('p', { class: 'warn', text: 'Add a supplier before raising an order.' })
      : el('div', {}, [
          el('div', { class: 'grid grid--2' }, [
            labelled('Supplier', select(
              suppliers.map((s) => ({ value: s.id, label: s.name })), supplierId,
              (e) => { supplierId = e.target.value; })),
            labelled('Reference', reference)
          ]),
          el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
            el('button', {
              class: 'btn btn--primary', type: 'button', text: 'Create draft order',
              onClick: async () => {
                const ok = await trySave(() => api.createPurchaseOrder({
                  supplier_id: supplierId || suppliers[0].id,
                  reference: reference.value.trim() || null
                }), { success: 'Draft order created' });
                if (ok) { reference.value = ''; await reload(); }
              }
            })
          ])
        ])
  ]);
}

function orderCard(po, materials, reload) {
  const lines = (po.ns_purchase_order_lines || [])
    .slice().sort((a, b) => (a.sort_order - b.sort_order) || 0);

  const outstanding = lines.filter(
    (l) => Number(l.packs_received || 0) < Number(l.packs_ordered));

  const estimated = lines.reduce((sum, l) => {
    const unitCost = l.unit_cost ?? l.ns_materials?.unit_cost;
    if (unitCost == null) return sum;
    return sum + Number(l.packs_ordered) *
      Number(l.ns_materials?.pack_quantity || 1) * Number(unitCost);
  }, 0);

  const anyUnknownCost = lines.some(
    (l) => (l.unit_cost ?? l.ns_materials?.unit_cost) == null);

  return el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('div', {}, [
        el('h2', { text: `${po.ns_suppliers?.name || 'Supplier'}${po.reference ? ` · ${po.reference}` : ''}` }),
        el('p', { text: [humanise(po.status),
                         po.ordered_at ? `ordered ${date(po.ordered_at)}` : 'not ordered yet',
                         `${lines.length} line${lines.length === 1 ? '' : 's'}`]
          .filter(Boolean).join(' · ') })
      ]),
      el('span', {
        class: `badge ${po.status === 'received' ? 'badge--ok'
          : po.status === 'cancelled' ? 'badge--muted' : 'badge--warn'}`,
        text: humanise(po.status)
      })
    ]),

    lines.length === 0
      ? el('p', { class: 'hint', text: 'No lines on this order yet.' })
      : el('div', {}, lines.map((line) => orderLineRow(line, po, reload))),

    estimated > 0
      ? el('p', { class: 'hint', style: 'margin-top:8px' }, [
          el('span', { text: `Estimated order value ${money(estimated)}` }),
          anyUnknownCost
            ? el('span', { text: ' — excludes lines with no cost recorded, so the real total is higher.' })
            : null
        ].filter(Boolean))
      : null,

    addOrderLineForm(po, materials, reload),

    el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
      ...PO_STATUSES
        .filter((s) => s !== po.status && s !== 'partial')
        .map((s) => el('button', {
          class: 'btn btn--sm', type: 'button', text: `Mark ${humanise(s).toLowerCase()}`,
          onClick: async () => {
            if (s === 'cancelled' && !confirmAction(
              'Cancel this order? Stock already received against it stays on the shelf.')) return;
            const patch = { status: s };
            // The CHECK constraint requires ordered_at once the status
            // leaves draft/cancelled, so supply it here rather than letting
            // the database reject the click.
            if (s !== 'draft' && s !== 'cancelled' && !po.ordered_at) {
              patch.ordered_at = new Date().toISOString();
            }
            if (s === 'received' && !po.received_at) patch.received_at = new Date().toISOString();
            await trySave(() => api.updatePurchaseOrder(po.id, patch), {
              success: `Order marked ${humanise(s).toLowerCase()}`, after: reload
            });
          }
        })),
      outstanding.length === 0 && lines.length > 0 && po.status !== 'received'
        ? el('span', { class: 'hint', style: 'margin:0 0 0 8px',
            text: 'Everything on this order has been received.' })
        : null
    ].filter(Boolean))
  ].filter(Boolean));
}

function orderLineRow(line, po, reload) {
  const material = line.ns_materials || {};
  const packQty = Number(material.pack_quantity || 1);
  const ordered = Number(line.packs_ordered);
  const received = Number(line.packs_received || 0);
  const remaining = Math.max(ordered - received, 0);

  const receiveInput = numberInput(remaining || '', null, {
    step: '1', min: '0', 'aria-label': `Packs to receive for ${material.name || 'part'}`
  });

  return el('div', { class: 'section-box', style: 'margin:8px 0' }, [
    el('div', { class: 'section-box__head', style: 'flex-wrap:wrap' }, [
      el('div', { style: 'flex:1;min-width:140px' }, [
        el('strong', { text: material.name || 'Unknown part' }),
        el('span', { class: 'row-item__meta',
          text: `${qty(ordered)} pack(s) of ${qty(packQty)} ${unitLabel(material.unit)} · ` +
                `${qty(received)} received` })
      ]),
      remaining === 0
        ? el('span', { class: 'badge badge--ok', text: 'Received' })
        : el('span', { class: 'badge badge--warn', text: `${qty(remaining)} outstanding` })
    ]),

    remaining > 0
      ? el('div', { class: 'grid grid--2', style: 'margin-top:8px' }, [
          labelled('Packs arriving', receiveInput,
            `${qty(packQty)} ${unitLabel(material.unit)} per pack.`),
          el('div', { class: 'btn-row', style: 'align-items:flex-end' }, [
            el('button', {
              class: 'btn btn--sm btn--primary', type: 'button', text: 'Receive',
              onClick: async () => {
                const packs = num(receiveInput.value, 0);
                if (!(packs > 0)) { toast('Enter how many packs arrived.', 'error'); return; }
                if (packs > remaining && !confirmAction(
                  `That is more than the ${qty(remaining)} pack(s) still outstanding. Receive anyway?`)) return;
                await trySave(() => api.receivePurchaseOrderLine(line, packs), {
                  success: `Received ${qty(packsToUnits(material, packs))} ${unitLabel(material.unit)}`,
                  after: reload
                });
              }
            })
          ])
        ])
      : null,

    po.status === 'draft'
      ? el('div', { class: 'btn-row', style: 'margin-top:8px' }, [
          el('button', {
            class: 'btn btn--sm btn--danger', type: 'button', text: 'Remove line',
            onClick: async () => {
              if (!confirmAction('Remove this line from the draft order?')) return;
              await trySave(() => api.deletePurchaseOrderLine(line.id), { after: reload });
            }
          })
        ])
      : null
  ].filter(Boolean));
}

function addOrderLineForm(po, materials, reload) {
  const alreadyOn = new Set((po.ns_purchase_order_lines || []).map((l) => l.material_id));
  const available = materials.filter((m) => !alreadyOn.has(m.id));
  const packs = numberInput(1, null, { step: '1', min: '1', 'aria-label': 'Packs to order' });
  let materialId = available[0]?.id || '';

  if (available.length === 0) {
    return el('p', { class: 'hint', style: 'margin-top:8px',
      text: materials.length === 0
        ? 'Add parts to the catalogue before putting lines on an order.'
        : 'Every active part is already on this order.' });
  }

  return el('div', { style: 'margin-top:10px' }, [
    el('div', { class: 'grid grid--2' }, [
      labelled('Part', select(
        available.map((m) => ({
          value: m.id,
          label: `${m.name} (pack of ${qty(m.pack_quantity)} ${unitLabel(m.unit)})`
        })), materialId, (e) => { materialId = e.target.value; })),
      labelled('Packs', packs)
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:8px' }, [
      el('button', {
        class: 'btn btn--sm', type: 'button', text: '+ Add line',
        onClick: async () => {
          const n = num(packs.value, 0);
          if (!(n > 0)) { toast('Order at least one pack.', 'error'); return; }
          await trySave(() => api.addPurchaseOrderLine(po.id, {
            material_id: materialId || available[0].id,
            packs_ordered: n,
            sort_order: (po.ns_purchase_order_lines || []).length + 1
          }), { success: 'Line added', after: reload });
        }
      })
    ])
  ]);
}

/* ---------------------------------------------------------------- mapping -- */

function mappingTab() {
  const host = el('div', {});

  async function load() {
    const [usage, services, materials] = await Promise.all([
      api.listServiceMaterialUsage(),
      api.listServices(),
      api.listMaterials()
    ]);

    const byService = new Map();
    for (const u of usage) {
      const key = u.service_id;
      if (!byService.has(key)) byService.set(key, []);
      byService.get(key).push(u);
    }

    const unmapped = services.filter((s) => s.quotable && !byService.has(s.id));

    fill(host, [
      el('div', { class: 'card' }, [
        el('div', { class: 'card__head' }, [
          el('div', {}, [
            el('h2', { text: 'What each service consumes' }),
            el('p', { text: 'One row per service and part: how much of that part one measured unit uses, ' +
                            'plus a waste allowance. A job’s requirement is worked out from this and the ' +
                            'measurements the field already captured.' })
          ])
        ]),
        materials.length === 0
          ? el('p', { class: 'warn', text: 'Add parts to the catalogue first — there is nothing to map to yet.' })
          : null,
        ...services
          .filter((s) => byService.has(s.id))
          .map((s) => el('div', { class: 'section-box' }, [
            el('div', { class: 'section-box__head', style: 'flex-wrap:wrap' }, [
              el('strong', { text: s.name }),
              el('span', { class: 'row-item__meta', text: `measured in ${unitLabel(s.unit)}` })
            ]),
            ...byService.get(s.id).map((u) => usageRow(u, s, load))
          ]))
      ].filter(Boolean)),

      materials.length ? addUsageCard(services, materials, load) : null,

      unmapped.length
        ? el('div', { class: 'card' }, [
            el('div', { class: 'card__head' }, [
              el('div', {}, [
                el('h2', { text: `${unmapped.length} quotable service${unmapped.length === 1 ? '' : 's'} consume nothing yet` }),
                el('p', { text: 'A job measuring one of these reports it as unmapped rather than as needing no parts.' })
              ])
            ]),
            el('p', { class: 'hint', text: unmapped.map((s) => s.name).join(', ') })
          ])
        : null
    ]);
  }

  load();
  return host;
}

function usageRow(u, service, reload) {
  const material = u.ns_materials || {};
  const perUnit = savingNumber(u.quantity_per_unit, async (e) => {
    const next = num(e.target.value, 0);
    if (!(next > 0)) { e.target.value = u.quantity_per_unit; toast('Use more than zero per unit.', 'error'); return; }
    await trySave(() => api.updateServiceMaterialUsage(u.id, { quantity_per_unit: next }), {
      revert: () => { e.target.value = u.quantity_per_unit; }, after: reload
    });
  }, { step: '0.01', min: '0', 'aria-label': `${material.name} per ${unitLabel(service.unit)}` });

  const wastePct = savingNumber(Math.round(Number(u.waste_factor) * 100), async (e) => {
    const pct = num(e.target.value, 0);
    if (pct < 0 || pct > 100) {
      e.target.value = Math.round(Number(u.waste_factor) * 100);
      toast('A waste allowance is between 0 and 100 per cent.', 'error');
      return;
    }
    await trySave(() => api.updateServiceMaterialUsage(u.id, { waste_factor: pct / 100 }), {
      revert: () => { e.target.value = Math.round(Number(u.waste_factor) * 100); }, after: reload
    });
  }, { step: '1', min: '0', max: '100', 'aria-label': `${material.name} waste allowance` });

  return el('div', { style: 'margin:8px 0' }, [
    el('div', { class: 'grid grid--3' }, [
      labelled('Part', el('p', { style: 'margin:0;padding-top:6px;font-weight:600',
        text: `${material.name || 'Unknown'} (${unitLabel(material.unit)})` })),
      labelled(`${unitLabel(material.unit)} per ${unitLabel(service.unit)}`, perUnit),
      labelled('Waste %', wastePct, 'Capped at 100%.')
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:6px' }, [
      el('button', {
        class: 'btn btn--sm btn--danger', type: 'button', text: 'Remove mapping',
        onClick: async () => {
          if (!confirmAction(`Stop counting ${material.name} against ${service.name}?`)) return;
          await trySave(() => api.deleteServiceMaterialUsage(u.id), {
            success: 'Mapping removed', after: reload
          });
        }
      })
    ])
  ]);
}

function addUsageCard(services, materials, reload) {
  const perUnit = numberInput(1, null, { step: '0.01', min: '0', 'aria-label': 'Quantity per unit' });
  const wastePct = numberInput(0, null, { step: '1', min: '0', max: '100', 'aria-label': 'Waste percentage' });
  let serviceId = services[0]?.id || '';
  let materialId = materials[0]?.id || '';

  return el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('div', {}, [el('h2', { text: 'Map a part to a service' })])
    ]),
    el('div', { class: 'grid grid--2' }, [
      labelled('Service', select(
        services.map((s) => ({ value: s.id, label: `${s.name} (${unitLabel(s.unit)})` })),
        serviceId, (e) => { serviceId = e.target.value; })),
      labelled('Part', select(
        materials.map((m) => ({ value: m.id, label: `${m.name} (${unitLabel(m.unit)})` })),
        materialId, (e) => { materialId = e.target.value; }))
    ]),
    el('div', { class: 'grid grid--2', style: 'margin-top:8px' }, [
      labelled('Quantity per measured unit', perUnit),
      labelled('Waste %', wastePct)
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
      el('button', {
        class: 'btn btn--primary', type: 'button', text: 'Add mapping',
        onClick: async () => {
          const q = num(perUnit.value, 0);
          if (!(q > 0)) { toast('Use more than zero per unit.', 'error'); return; }
          const pct = num(wastePct.value, 0);
          if (pct < 0 || pct > 100) { toast('A waste allowance is between 0 and 100 per cent.', 'error'); return; }
          await trySave(() => api.setServiceMaterialUsage({
            service_id: serviceId || services[0].id,
            material_id: materialId || materials[0].id,
            quantity_per_unit: q,
            waste_factor: pct / 100
          }), { success: 'Mapping added', after: reload });
        }
      })
    ])
  ]);
}

/* ----------------------------------------------------------- rental sets -- */

function setsTab() {
  const host = el('div', {});
  let statusFilter = '';

  async function load() {
    const sets = await api.listRentalSets(statusFilter ? { status: statusFilter } : {});
    const counts = new Map();
    for (const s of sets) counts.set(s.status, (counts.get(s.status) || 0) + 1);

    fill(host, [
      el('div', { class: 'card' }, [
        el('div', { class: 'card__head' }, [
          el('div', {}, [
            el('h2', { text: 'Christmas rental sets' }),
            el('p', { text: 'Sets are owned by the business and rented out, with storage included, ' +
                            'so each one is tracked as a physical asset rather than a stock count.' })
          ]),
          labelled('Status', select(
            [{ value: '', label: 'All statuses' },
             ...SET_STATUSES.map((s) => ({ value: s, label: humanise(s) }))],
            statusFilter, async (e) => { statusFilter = e.target.value; await load(); }))
        ]),
        sets.length === 0
          ? el('p', { class: 'hint',
              text: statusFilter
                ? 'No sets with that status.'
                : 'No sets recorded yet. Add one for each physical set in storage.' })
          : el('div', {}, sets.map((s) => rentalSetRow(s, load)))
      ]),
      newRentalSetCard(load)
    ]);
  }

  load();
  return host;
}

function rentalSetRow(set, reload) {
  const host = el('div', { class: 'section-box', style: 'margin:8px 0' });
  let historyOpen = false;

  function paint() {
    fill(host, [
      el('div', { class: 'section-box__head', style: 'flex-wrap:wrap' }, [
        el('div', { style: 'flex:1;min-width:140px' }, [
          el('strong', { text: set.set_code }),
          el('span', { class: 'row-item__meta',
            text: [set.customers?.name,
                   set.properties?.address_line1,
                   set.linear_ft ? `${qty(set.linear_ft)} ft` : null,
                   set.season_year ? `season ${set.season_year}` : null,
                   set.storage_location].filter(Boolean).join(' · ') || 'unassigned' })
        ]),
        el('span', {
          class: `badge ${set.status === 'installed' ? 'badge--ok'
            : set.status === 'lost' || set.status === 'in_repair' ? 'badge--warn' : 'badge--muted'}`,
          text: humanise(set.status)
        }),
        el('button', {
          class: 'btn btn--sm', type: 'button',
          text: historyOpen ? 'Hide history' : 'History',
          onClick: () => { historyOpen = !historyOpen; paint(); }
        })
      ]),

      el('div', { class: 'btn-row', style: 'margin-top:8px' }, transitionButtons(set, reload)),

      set.condition_note
        ? el('p', { class: 'hint', style: 'margin:6px 0 0', text: `Condition: ${set.condition_note}` })
        : null,

      historyOpen ? setHistory(set) : null
    ]);
  }

  paint();
  return host;
}

/* Only the transitions that make sense FROM the set's current status are
   offered, driven by an explicit table rather than a pile of negations.
 *
 * Two different reasons a button must not appear:
 *
 *   1. The database would refuse it. "Installed" requires a customer and a
 *      date, "assigned" requires a customer, so neither belongs on an
 *      unassigned set -- the click would raise a CHECK violation that reads
 *      to the operator as a bug in the app.
 *
 *   2. It is nonsense even though the database would accept it. A set
 *      recorded as LOST or RETIRED is not something to install at a
 *      customer's house, and one at the repair shop is not either. The first
 *      version of this function tested `set.customer_id && status !==
 *      'installed'`, which offered "Mark installed" on a lost set -- caught
 *      by looking at a screenshot, not by any assertion, because every
 *      individual condition in it was true.
 *
 * A lost set gets one way back ("Found") rather than the full set, because
 * recovering one is a specific event worth logging as such. */
const CAN_INSTALL = new Set(['in_storage', 'assigned']);
const CAN_REPAIR  = new Set(['in_storage', 'assigned', 'installed']);
const CAN_UNASSIGN = new Set(['in_storage', 'assigned', 'in_repair']);

function transitionButtons(set, reload) {
  const buttons = [];
  const go = (label, { event, status, patch, note }) => el('button', {
    class: 'btn btn--sm', type: 'button', text: label,
    onClick: async () => {
      await trySave(() => api.moveRentalSet(set, { event, status, patch, note }), {
        success: `${set.set_code} — ${label.toLowerCase()}`, after: reload
      });
    }
  });

  if (set.customer_id && CAN_INSTALL.has(set.status)) {
    buttons.push(go('Mark installed', {
      event: 'installed', status: 'installed',
      patch: { installed_at: new Date().toISOString(), removed_at: null }
    }));
  }
  if (set.status === 'installed') {
    buttons.push(go('Mark removed', {
      event: 'removed', status: 'in_storage',
      patch: { removed_at: new Date().toISOString() }
    }));
  }
  if (CAN_REPAIR.has(set.status)) {
    buttons.push(go('Send for repair', { event: 'repaired', status: 'in_repair' }));
  }
  if (set.status === 'in_repair') {
    buttons.push(go('Back in storage', { event: 'stored', status: 'in_storage' }));
  }
  if (set.status === 'lost') {
    buttons.push(go('Found — back in storage', { event: 'received', status: 'in_storage' }));
  }
  if (set.status !== 'lost' && set.status !== 'retired') {
    buttons.push(el('button', {
      class: 'btn btn--sm btn--danger', type: 'button', text: 'Mark lost',
      onClick: async () => {
        if (!confirmAction(`Mark ${set.set_code} lost? Record what happened in the note.`)) return;
        const note = window.prompt('What happened to it?') || null;
        await trySave(() => api.moveRentalSet(set, { event: 'lost', status: 'lost', note }), {
          success: `${set.set_code} marked lost`, after: reload
        });
      }
    }));
  }
  if (set.customer_id && CAN_UNASSIGN.has(set.status)) {
    buttons.push(el('button', {
      class: 'btn btn--sm', type: 'button', text: 'Unassign',
      onClick: async () => {
        if (!confirmAction(`Release ${set.set_code} from ${set.customers?.name || 'this customer'}?`)) return;
        await trySave(() => api.moveRentalSet(set, {
          event: 'unassigned', status: 'in_storage',
          patch: { customer_id: null, property_id: null }
        }), { success: 'Set released', after: reload });
      }
    }));
  }
  return buttons;
}

function setHistory(set) {
  const host = el('div', { style: 'margin-top:10px' },
    [el('p', { class: 'hint', text: 'Loading history…' })]);

  api.listRentalSetEvents(set.id).then((events) => {
    fill(host, [
      el('h3', { style: 'margin:0 0 6px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)',
        text: 'History' }),
      events.length === 0
        ? el('p', { class: 'hint', text: 'Nothing logged for this set yet.' })
        : el('div', {}, events.map((ev) => el('div', { class: 'row-item' }, [
            el('div', { class: 'row-item__main' }, [
              el('strong', { text: humanise(ev.event) }),
              el('span', { class: 'row-item__meta',
                text: [dateTime(ev.occurred_at), ev.note].filter(Boolean).join(' · ') })
            ])
          ])))
    ]);
  }).catch((err) => {
    fill(host, [el('p', { class: 'error-text', text: err.message })]);
  });

  return host;
}

function newRentalSetCard(reload) {
  const code = el('input', { placeholder: 'e.g. SET-014', 'aria-label': 'Set code' });
  const linearFt = numberInput('', null, { step: '1', min: '1', 'aria-label': 'Linear feet' });
  const location = el('input', { placeholder: 'e.g. Bay 3, shelf 2', 'aria-label': 'Storage location' });

  return el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('div', {}, [
        el('h2', { text: 'Add a rental set' }),
        el('p', { text: 'A new set starts in storage and unassigned. Assign it to a customer from their job.' })
      ])
    ]),
    el('div', { class: 'grid grid--3' }, [
      labelled('Set code', code, 'Must be unique.'),
      labelled('Linear feet', linearFt, 'Leave blank if not measured yet.'),
      labelled('Storage location', location)
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
      el('button', {
        class: 'btn btn--primary', type: 'button', text: 'Add set',
        onClick: async () => {
          if (!code.value.trim()) { toast('A set needs a code.', 'error'); return; }
          const ft = linearFt.value.trim() === '' ? null : num(linearFt.value, 0);
          if (ft !== null && !(ft > 0)) { toast('Linear feet must be more than zero.', 'error'); return; }
          const ok = await trySave(() => api.createRentalSet({
            set_code: code.value.trim(),
            linear_ft: ft,
            storage_location: location.value.trim() || null
          }), { success: 'Set added' });
          if (ok) { code.value = ''; linearFt.value = ''; location.value = ''; await reload(); }
        }
      })
    ])
  ]);
}

/* ------------------------------------------------------------------ view -- */

export async function renderInventory(ctx) {
  const { mount, params, replaceQuery } = ctx;
  const requested = params?.get('tab');
  let tab = TABS.some(([key]) => key === requested) ? requested : 'stock';

  const body = el('div', {});

  function paintTabs() {
    return el('div', { class: 'btn-row', style: 'margin:0 0 14px;flex-wrap:wrap' },
      TABS.map(([key, label]) => el('button', {
        class: `btn btn--sm${key === tab ? ' btn--primary' : ''}`,
        type: 'button',
        text: label,
        'aria-pressed': key === tab ? 'true' : 'false',
        onClick: () => {
          if (key === tab) return;
          tab = key;
          // replaceQuery, not a hash assignment: switching tab must not put
          // an entry between the operator and Android Back.
          replaceQuery?.(`tab=${key}`);
          render();
        }
      })));
  }

  function render() {
    fill(mount, [
      el('div', { class: 'page-head' }, [
        el('div', {}, [
          el('h1', { text: 'Inventory' }),
          el('p', { class: 'hint',
            text: 'Parts, purchasing and Christmas rental sets. Nothing here affects quote pricing.' })
        ])
      ]),
      paintTabs(),
      body
    ]);

    fill(body, [
      tab === 'stock'      ? stockTab()
      : tab === 'purchasing' ? purchasingTab()
      : tab === 'mapping'    ? mappingTab()
      : setsTab()
    ]);
  }

  render();
}
