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

/** Best-effort clipboard copy with a fallback for contexts where the async
 *  Clipboard API is unavailable (older WebViews, non-secure contexts). */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) { /* fall through to the legacy path below */ }
  try {
    // <textarea> has no `value` attribute -- only the JS property actually
    // sets its content, so it is assigned explicitly rather than through el()'s
    // generic setAttribute path.
    const ta = el('textarea', { style: 'position:fixed;top:0;left:0;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (err) {
    return false;
  }
}

export function createQuotePanel({ job, onChange }) {
  const root = el('div', {});

  // Fetched once per panel for the absolute, customer-facing link that Copy
  // Link / Copy SMS Text need (unlike the admin's own "Preview quote" tab,
  // which can stay relative). company.website is the same setting the
  // send-notifications Edge Function already reads for its quote_ready
  // email link, so this introduces no second place the production URL lives.
  let company = {};
  api.getSettings().then(s => { company = s.company || {}; }).catch(() => {});

  function canonicalBase() {
    return (company.website || window.location.origin).replace(/\/$/, '');
  }

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

      deliveryActions(quote, editable),
      internalNotesBox(quote)
    ]);
  }

  function smsText(quote, publicUrl) {
    const firstName = (job.customers?.name || '').trim().split(/\s+/)[0] || 'there';
    const address = job.properties?.address_line1 || 'your property';
    return `Hi ${firstName}, here is your Nova Shield quote for ${address}: ` +
           `${publicUrl} - Please let us know if you have any questions!`;
  }

  /** Delivery (email / PDF / link / SMS) is independent of quote status:
   *  a quote with no customer email on file is just as "finished" as one
   *  with an email, it is only delivered differently. Only Send Email
   *  changes quote.status -- Download PDF, Copy Link, Copy SMS Text and
   *  Duplicate Quote never do, regardless of whether an email exists. */
  function deliveryActions(quote, editable) {
    const hasEmail = !!(job.customers && job.customers.email);
    // ?print=1 tells the customer-quote page (the one document, no
    // duplicate template) to trigger window.print() once it has rendered --
    // the native browser Save-as-PDF flow, not a generated file.
    const quoteUrl = `../site/quote.html?id=${quote.id}`;
    const publicUrl = `${canonicalBase()}/quote.html?id=${quote.id}`;

    const sendButton = editable ? el('button', {
      class: 'btn btn--primary', text: 'Send Email',
      disabled: !hasEmail ? true : undefined,
      onClick: async () => {
        if (!hasEmail) {
          // No RPC round-trip and no exception to catch: this is not a
          // failed send, it is a channel that is not available for this
          // customer, and the UI says exactly that.
          toast('No email address on file. Please copy the link or download ' +
                'the PDF to deliver manually.', 'error');
          return;
        }
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
    }) : null;

    const duplicateButton = el('button', {
      class: 'btn btn--sm', text: 'Duplicate Quote',
      onClick: async () => {
        try {
          await api.duplicateQuote(quote.id);
          toast('Quote duplicated as a new draft');
          onChange();
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    });

    const copyLinkButton = el('button', {
      class: 'btn btn--sm', text: 'Copy Link',
      onClick: async () => {
        const ok = await copyToClipboard(publicUrl);
        toast(ok ? 'Quote URL copied to clipboard' : `Could not copy — here is the link: ${publicUrl}`,
          ok ? 'info' : 'error');
      }
    });

    const copySmsButton = el('button', {
      class: 'btn btn--sm', text: 'Copy SMS Text',
      onClick: async () => {
        const ok = await copyToClipboard(smsText(quote, publicUrl));
        toast(ok ? 'SMS text copied to clipboard' : 'Could not copy the SMS text', ok ? 'info' : 'error');
      }
    });

    const phone = job.customers?.phone;
    const address = [job.properties?.address_line1, job.properties?.city, job.properties?.postal_code]
      .filter(Boolean).join(', ');

    return el('div', {}, [
      el('div', { class: 'btn-row', style: 'margin-top:14px' }, [
        el('a', {
          // the customer-facing document lives on the public site, not in
          // here -- an authenticated admin can open any status, a customer
          // only ever sees one that has actually been sent
          class: 'btn', href: quoteUrl, target: '_blank', rel: 'noopener', text: 'Preview Quote'
        }),
        el('a', {
          class: 'btn', href: `${quoteUrl}&print=1`, target: '_blank', rel: 'noopener',
          text: 'Download PDF'
        }),
        copyLinkButton,
        copySmsButton,
        sendButton,
        duplicateButton
      ]),
      !hasEmail
        ? el('p', { class: 'hint', style: 'margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, [
            el('span', { class: 'badge badge--warn', text: 'No Email On File' }),
            el('span', { text: 'Copy the link or download the PDF to deliver this quote manually.' })
          ])
        : (editable ? el('p', { class: 'hint', style: 'margin-top:8px',
            text: 'Nothing is sent to the customer automatically — you review the number first.' }) : null),
      (phone || address)
        ? el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
            phone ? el('a', { class: 'btn btn--sm', href: `tel:${phone}`, text: 'Call' }) : null,
            address ? el('a', {
              class: 'btn btn--sm', target: '_blank', rel: 'noopener',
              href: `https://maps.google.com/?q=${encodeURIComponent(address)}`, text: 'Navigate'
            }) : null
          ])
        : null
    ]);
  }

  /** Private, staff-only scratch notes stored on this specific quote version.
   *  get_customer_quote() never selects internal_notes, so there is no path
   *  by which this can reach the customer page or a printed PDF. */
  function internalNotesBox(quote) {
    // <textarea> has no `value` attribute -- the JS property is what
    // actually sets its content.
    const textarea = el('textarea', {
      rows: '3',
      placeholder: 'Private notes about this quote — never shown to the customer.',
      style: 'width:100%;resize:vertical;font:inherit;padding:8px;' +
             'border:1px solid var(--line);border-radius:8px;box-sizing:border-box'
    });
    textarea.value = quote.internal_notes || '';

    return el('div', { class: 'section-box', style: 'margin-top:14px' }, [
      el('h3', { text: 'Internal admin notes' }),
      el('p', { class: 'hint', style: 'margin:0 0 8px',
        text: 'Private — never shown on the customer quote page or PDF.' }),
      textarea,
      el('div', { class: 'btn-row', style: 'margin-top:8px' }, [
        el('button', {
          class: 'btn btn--sm', text: 'Save note',
          onClick: async () => {
            try {
              await api.updateQuote(quote.id, { internal_notes: textarea.value.trim() || null });
              toast('Note saved');
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      ])
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
