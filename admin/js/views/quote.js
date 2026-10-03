import * as api from '../lib/api.js';
import { el, clear, toast, select, numberInput, confirmAction } from '../../../shared/dom.js';
import { money, num, date, humanise, unitLabel, qty } from '../../../shared/format.js';

const ADJUSTMENT_KINDS = [
  { value: 'discount_pct',   label: 'Discount %' },
  { value: 'discount_flat',  label: 'Discount $' },
  { value: 'surcharge_flat', label: 'Surcharge $' },
  { value: 'surcharge_pct',  label: 'Surcharge %' },
  { value: 'travel',         label: 'Travel charge' },
  { value: 'difficulty',     label: 'Difficulty charge' },
  { value: 'custom',         label: 'Custom line' }
];

export function createQuotePanel({ job, onChange }) {
  const root = el('div', {});

  function adjustmentRow(adj, quote, editable) {
    const isCredit = Number(adj.amount) < 0;
    return el('div', { class: `qline ${isCredit ? 'qline--credit' : ''}` }, [
      el('span', {}, [
        adj.label,
        el('span', { class: 'qline__sub',
          text: adj.kind.endsWith('_pct') ? `${adj.kind.startsWith('discount') ? '−' : '+'}${adj.value}%`
                                          : humanise(adj.kind) })
      ]),
      el('span', { style: 'display:flex;gap:10px;align-items:center' }, [
        el('span', { class: 'money', text: money(adj.amount) }),
        editable
          ? el('button', {
              class: 'btn btn--sm', text: '×', 'aria-label': `Remove ${adj.label}`,
              onClick: async () => { await api.deleteAdjustment(adj.id, quote.id); onChange(); }
            })
          : null
      ])
    ]);
  }

  function lineRow(line, quote, editable) {
    return el('div', { class: 'qline' }, [
      el('span', {}, [
        line.description,
        el('span', { class: 'qline__sub',
          text: `${qty(line.quantity)} ${unitLabel(line.unit)} @ ${money(line.unit_rate)}` +
                (Number(line.modifier_factor) !== 1 ? ` × ${Number(line.modifier_factor).toFixed(2)}` : '') +
                (Number(line.addons_amount) ? ` + ${money(line.addons_amount)} extras` : '') +
                (line.minimum_applied ? ' · minimum applied' : '') })
      ]),
      el('span', { style: 'display:flex;gap:10px;align-items:center' }, [
        el('span', { class: 'money', text: money(line.amount) }),
        editable && line.source === 'manual'
          ? el('button', {
              class: 'btn btn--sm', text: '×', 'aria-label': `Remove ${line.description}`,
              onClick: async () => { await api.deleteLine(line.id, quote.id); onChange(); }
            })
          : null
      ])
    ]);
  }

  function addAdjustmentForm(quote) {
    let kind = 'discount_pct';
    const labelInput = el('input', { placeholder: 'Shown to the customer', maxlength: '120' });
    const valueInput = numberInput(0, null, { step: '1', 'aria-label': 'Value' });

    return el('div', { class: 'section-box' }, [
      el('h3', { text: 'Add an adjustment' }),
      el('div', { class: 'grid grid--3', style: 'margin-top:10px' }, [
        el('label', { class: 'field', style: 'margin:0' }, [
          el('span', { text: 'Type' }),
          select(ADJUSTMENT_KINDS, kind, e => {
            kind = e.target.value;
            if (!labelInput.value) {
              labelInput.value = ADJUSTMENT_KINDS.find(k => k.value === kind)?.label || '';
            }
          })
        ]),
        el('label', { class: 'field', style: 'margin:0' }, [
          el('span', { text: 'Label' }), labelInput
        ]),
        el('label', { class: 'field', style: 'margin:0' }, [
          el('span', { text: 'Amount' }), valueInput
        ])
      ]),
      el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
        el('button', {
          class: 'btn', text: 'Add to quote',
          onClick: async () => {
            const value = num(valueInput.value);
            const label = labelInput.value.trim()
              || ADJUSTMENT_KINDS.find(k => k.value === kind)?.label || 'Adjustment';
            if (value <= 0) return toast('Enter an amount greater than zero', 'error');
            await api.addAdjustment(quote.id, { kind, label, value });
            toast('Adjustment added');
            onChange();
          }
        })
      ]),
      el('p', { class: 'hint',
        text: 'Percentages are calculated against the services subtotal, before other charges.' })
    ]);
  }

  function renderQuote(quote) {
    const editable = quote.status === 'draft';
    const lines = (quote.quote_line_items || []).sort((a, b) => a.sort_order - b.sort_order);
    const adjustments = (quote.quote_adjustments || []).sort((a, b) => a.sort_order - b.sort_order);

    return el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: `${humanise(quote.kind)} · v${quote.version}` }),
          el('p', { text: quote.sent_at ? `Sent ${date(quote.sent_at)}`
                                        : `Valid until ${date(quote.valid_until)}` })
        ]),
        el('span', {
          class: `badge ${quote.status === 'draft' ? 'badge--warn'
                        : quote.status === 'sent' ? 'badge--ok' : 'badge--muted'}`,
          text: humanise(quote.status)
        })
      ]),

      lines.length
        ? el('div', {}, lines.map(l => lineRow(l, quote, editable)))
        : el('div', { class: 'empty', text: 'No line items.' }),

      el('div', { class: 'qline' }, [
        el('span', { text: 'Subtotal' }),
        el('span', { class: 'money', text: money(quote.subtotal) })
      ]),

      ...adjustments.map(a => adjustmentRow(a, quote, editable)),

      Number(quote.tax_total) > 0
        ? el('div', { class: 'qline' }, [
            el('span', { text: 'Tax' }),
            el('span', { class: 'money', text: money(quote.tax_total) })
          ])
        : null,

      el('div', { class: 'qline qline--total' }, [
        el('span', { text: 'Final quote' }),
        el('span', { class: 'money', text: money(quote.total) })
      ]),

      editable ? addAdjustmentForm(quote) : null,

      el('div', { class: 'btn-row', style: 'margin-top:14px' }, [
        editable
          ? el('button', {
              class: 'btn btn--primary', text: 'Send quote',
              onClick: async () => {
                if (!confirmAction(
                  `Send this quote for ${money(quote.total)}? It is locked once sent — ` +
                  'changes after this need a new version.')) return;
                try {
                  await api.sendQuote(quote.id);
                  // The send itself is synchronous (status + queue row), but
                  // delivery through Resend happens on the next worker pass,
                  // so "sent" here means queued, not "landed in their inbox".
                  toast('Quote sent — the customer email is queued for delivery');
                  onChange();
                } catch (err) {
                  toast(err.message, 'error');
                }
              }
            })
          : null,
        el('a', {
          // the customer-facing document lives on the public site, not in here
          class: 'btn', href: `../site/quote.html?id=${quote.id}`,
          target: '_blank', rel: 'noopener',
          text: quote.status === 'draft' ? 'Preview customer view' : 'Customer view'
        })
      ]),
      editable
        ? el('p', { class: 'hint', style: 'margin-top:8px',
            text: 'Nothing is sent to the customer automatically — you review the number first.' })
        : null
    ]);
  }

  function render({ quotes }) {
    const current = quotes[0];

    clear(root).append(
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'Quotes' }),
          el('p', { text: current ? `${quotes.length} version${quotes.length === 1 ? '' : 's'}`
                                  : 'No quote built yet' })
        ]),
        el('div', { class: 'btn-row' }, [
          el('button', {
            class: 'btn btn--sm', text: 'New estimate',
            onClick: () => build('preliminary_estimate')
          }),
          el('button', {
            class: 'btn btn--sm btn--primary', text: current ? 'New version' : 'Build quote',
            onClick: () => build('final')
          })
        ])
      ]),
      ...quotes.map(renderQuote)
    );

    async function build(kind) {
      try {
        await api.createQuoteFromCalculation(job.id, kind);
        toast(kind === 'final' ? 'Draft quote built' : 'Preliminary estimate built');
        onChange();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  }

  return { root, render };
}
