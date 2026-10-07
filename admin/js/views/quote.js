import * as api from '../lib/api.js';
import { el, clear, toast, select, numberInput, confirmAction } from '../../../shared/dom.js';
import { money, num, date, humanise, unitLabel, qty } from '../../../shared/format.js';
import { createSignaturePad } from '../components/signature-pad.js';
import { createChangeOrdersPanel } from '../components/change-orders.js';
import { isNative, shareOrFallback, hapticLight } from '../lib/native.js';

/** Phase C: splits a job's full version history into the ordinary
 *  (option_group_id null) lineage and one array per option group --
 *  quotes is already ordered by version desc (see api.listQuotes), and
 *  filtering preserves that relative order within each bucket. */
function splitByOptionGroup(quotes) {
  const ungrouped = [];
  const groups = new Map();
  for (const q of quotes) {
    if (q.option_group_id) {
      if (!groups.has(q.option_group_id)) groups.set(q.option_group_id, []);
      groups.get(q.option_group_id).push(q);
    } else {
      ungrouped.push(q);
    }
  }
  return { ungrouped, groups };
}

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

export function createQuotePanel({ job, onChange, saveSignatureFn }) {
  const root = el('div', {});
  // Desktop saves a signature directly (always online). The field console
  // passes a wrapped version that goes through its offline outbox instead.
  const saveSignature = saveSignatureFn ||
    (async (jobId, quoteId, pngBlob, signerName) => {
      const path = await api.uploadSignature(jobId, pngBlob);
      await api.saveQuoteSignature(quoteId, path, signerName);
      return { queued: false };
    });

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
        line.pricing_approved === false
          ? el('span', { class: 'badge badge--warn', style: 'margin-left:6px', text: 'Not yet approved' })
          : null,
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
            hapticLight();
            toast('Adjustment added');
            onChange();
          }
        })
      ]),
      el('p', { class: 'hint',
        text: 'Percentages are calculated against the services subtotal, before other charges.' })
    ]);
  }

  function renderQuote(quote, isLatest) {
    const editable = quote.status === 'draft';
    const lines = (quote.quote_line_items || []).sort((a, b) => a.sort_order - b.sort_order);
    const adjustments = (quote.quote_adjustments || []).sort((a, b) => a.sort_order - b.sort_order);
    const unapprovedServices = [...new Set(
      lines.filter(l => l.pricing_approved === false).map(l => l.description)
    )];

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

      unapprovedServices.length ? el('div', { class: 'warn', style: 'margin-bottom:10px' }, [
        el('strong', { style: 'display:block;margin-bottom:4px', text: 'Includes pricing that is not yet commercially approved' }),
        el('span', { text: `${unapprovedServices.join(', ')} — configured in the price book, but the owner hasn’t ` +
              'signed off on these rates yet. Fine to prepare internally; think twice before sending as-is.' })
      ]) : null,

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

      !editable && isLatest ? revisionPrompt(quote) : null,

      deliveryActions(quote, editable, unapprovedServices),
      signatureSection(quote, unapprovedServices),
      !editable ? changeOrdersSection(quote) : null,
      internalNotesBox(quote)
    ]);
  }

  /** draft/sent -> a pad to capture an on-site approval right now, instead
   *  of (or ahead of) emailing. accepted-with-a-signature -> what was
   *  captured, read back. Nothing is shown for declined/expired/superseded
   *  -- there is nothing left to sign. */
  function signatureSection(quote, unapprovedServices = []) {
    if (quote.signature_url) {
      const img = el('img', {
        alt: `Signature of ${quote.signed_by_name}`,
        style: 'max-width:280px;width:100%;display:block;margin-top:10px;' +
               'border:1px solid var(--line);border-radius:8px;background:#fff'
      });
      api.signedPhotoUrl(quote.signature_url, 900, 'job-photos')
        .then((url) => { img.src = url; }).catch(() => {});

      return el('div', { class: 'card' }, [
        el('div', { class: 'card__head' }, [
          el('div', {}, [
            el('h2', { text: 'Customer signature' }),
            el('p', { text: `Signed by ${quote.signed_by_name} · ${date(quote.signed_at)}` })
          ])
        ]),
        img
      ]);
    }

    if (quote.status !== 'draft' && quote.status !== 'sent') return null;

    const pad = createSignaturePad({
      unapprovedServices,
      onSave: async (pngBlob, signerName) => {
        const { queued } = await saveSignature(job.id, quote.id, pngBlob, signerName);
        toast(queued
          ? 'Offline — signature queued, will save automatically once back online'
          : 'Signature saved — quote marked accepted');
        onChange();
      }
    });

    return el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'Customer signature' }),
          el('p', { text: 'For an on-site approval, instead of emailing the quote.' })
        ])
      ]),
      pad.root
    ]);
  }

  function changeOrdersSection(quote) {
    return createChangeOrdersPanel({ quote, onChange }).root;
  }

  /** Phase C: one option group's wrapper -- every option's own version
   *  history renders through the SAME renderQuote() used for an ordinary
   *  quote (so line items, signing, internal notes etc. all keep working
   *  identically); isLatest is computed per option slot (option_sort_order),
   *  not across the whole job, so "Create New Revision" only ever appears
   *  on the one truly-current version of each slot. */
  function renderOptionGroup(groupId, groupQuotes) {
    const slots = new Map();
    for (const q of groupQuotes) {
      if (!slots.has(q.option_sort_order)) slots.set(q.option_sort_order, []);
      slots.get(q.option_sort_order).push(q);
    }
    const slotOrder = [...slots.keys()].sort((a, b) => a - b);
    const allDraft = groupQuotes.every(q => q.status === 'draft');

    return el('div', { class: 'section-box', style: 'margin-top:14px;border:1px solid var(--line)' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h3', { text: `Option group · ${slotOrder.length} option${slotOrder.length === 1 ? '' : 's'}` }),
          el('p', { text: allDraft ? 'Draft -- not yet sent to the customer' : 'Sent to the customer' })
        ]),
        allDraft ? el('button', {
          class: 'btn btn--sm btn--primary', text: 'Send Option Group',
          onClick: async () => {
            if (!confirmAction(
              `Send all ${slotOrder.length} options to the customer in one email? ` +
              'Each option is locked once sent -- further changes need a new revision of that option.')) return;
            try {
              await api.sendOptionGroup(groupId);
              toast('Option group sent — the customer email is queued for delivery');
              onChange();
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        }) : null
      ]),
      ...slotOrder.map(key => {
        const versions = slots.get(key).slice().sort((a, b) => b.version - a.version);
        return el('div', {}, versions.map((q, i) => renderQuote(q, i === 0)));
      })
    ]);
  }

  /** Phase C: minimal, synthetic/manual option-group creation pathway --
   *  no tier-pricing logic, just an explicit measurement checklist per
   *  option so the architecture (shared measurements, independent
   *  pricing, one group) can be proven and tested end to end. */
  function optionGroupBuilder({ measurements, services }) {
    if (!measurements || !measurements.length) return null;

    const serviceName = (id) => services?.find(s => s.id === id)?.name || 'Unknown service';
    const measurementLabel = (m) =>
      `${serviceName(m.service_id)}${m.label ? ' — ' + m.label : ''} (${qty(m.quantity)} ${unitLabel(m.unit)})`;

    const DEFAULTS = ['Essential', 'Complete', 'Full Home'];
    const columns = DEFAULTS.map((defaultLabel) => {
      const labelInput = el('input', { 'aria-label': 'Option label', maxlength: '60' });
      labelInput.value = defaultLabel;
      const checks = measurements.map((m) => ({
        measurement: m,
        checkbox: el('input', { type: 'checkbox' })
      }));
      return { labelInput, checks };
    });

    return el('div', { class: 'section-box', style: 'margin-top:14px' }, [
      el('h3', { text: 'Create option group' }),
      el('p', { class: 'hint', style: 'margin:0 0 10px',
        text: 'Pick which of this job’s measurements belong to each option, then create all of ' +
              'them at once. This is manual, synthetic composition — tier-pricing logic comes later.' }),
      el('div', { class: 'grid grid--3' }, columns.map((col, i) => el('div', { class: 'field' }, [
        el('span', { text: `Option ${i + 1} label` }),
        col.labelInput,
        el('div', { style: 'margin-top:8px;max-height:220px;overflow:auto' },
          col.checks.map(({ measurement, checkbox }) => el('label', {
            style: 'display:flex;align-items:flex-start;gap:6px;font-size:.85rem;padding:3px 0'
          }, [checkbox, measurementLabel(measurement)]))
        )
      ]))),
      el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
        el('button', {
          class: 'btn btn--primary', text: 'Create Option Group',
          onClick: async () => {
            const groupId = crypto.randomUUID();
            const picks = columns
              .map((col, i) => ({
                label: col.labelInput.value.trim() || DEFAULTS[i],
                ids: col.checks.filter(c => c.checkbox.checked).map(c => c.measurement.id)
              }))
              .filter(p => p.ids.length > 0);
            if (picks.length < 2) return toast('Select measurements for at least 2 options', 'error');
            try {
              for (let i = 0; i < picks.length; i++) {
                await api.createOptionQuote(job.id, groupId, picks[i].label, i + 1, picks[i].ids);
              }
              toast(`Option group created with ${picks.length} options`);
              onChange();
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      ])
    ]);
  }

  /** A sent/accepted/declined/expired/superseded quote is never edited in
   *  place -- the number a customer saw stays exactly what they saw, for
   *  dispute prevention. Changing anything means a new version, cloned from
   *  this one via duplicate_quote() (parent_quote_id stamped), left as an
   *  editable draft with its own id and so its own canonical quote.html
   *  link, while this record stays on file untouched. */
  function revisionPrompt(quote) {
    return el('div', { class: 'warn', style: 'margin-top:14px' }, [
      el('strong', { style: 'display:block;margin-bottom:4px', text: 'This quote is locked.' }),
      el('span', { text: `Version ${quote.version} was ${quote.status === 'sent' ? 'sent to the customer' : humanise(quote.status).toLowerCase()} ` +
            'and is kept exactly as they saw it. To change anything, create a new revision.' }),
      el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
        el('button', {
          class: 'btn btn--primary', text: `Create New Revision (v${quote.version + 1})`,
          onClick: async () => {
            if (!confirmAction(
              `Create a new revision of this quote? Version ${quote.version} stays on file ` +
              'unchanged, and the new version opens as an editable draft.')) return;
            try {
              await api.duplicateQuote(quote.id);
              toast(`Revision v${quote.version + 1} created as a new draft`);
              onChange();
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      ])
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
  function deliveryActions(quote, editable, unapprovedServices = []) {
    const hasEmail = !!(job.customers && job.customers.email);
    // ?print=1 tells the customer-quote page (the one document, no
    // duplicate template) to trigger window.print() once it has rendered --
    // the native browser Save-as-PDF flow, not a generated file.
    const quoteUrl = `../site/quote.html?id=${quote.id}`;
    const publicUrl = `${canonicalBase()}/quote.html?id=${quote.id}`;
    // quoteUrl is relative to this admin page (../site/...) -- correct for
    // the web admin, which is served from the same site root as site/, but
    // the native wrapper only bundles admin/ + shared/ (see
    // scripts/sync-mobile.js), so that path doesn't exist inside it. Native
    // uses the absolute publicUrl instead, same URL Copy Link already hands
    // out, which resolves over the real network like any other link.
    const previewUrl = isNative() ? publicUrl : quoteUrl;
    const printUrl = `${previewUrl}&print=1`;

    // An option-group member is sent as a whole group (one customer email,
    // all siblings at once) via the "Send Option Group" button on its
    // group wrapper -- mark_quote_sent itself now refuses to send one
    // directly, so this button simply doesn't offer the wrong action.
    const sendButton = editable && !quote.option_group_id ? el('button', {
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
        const warning = unapprovedServices.length
          ? `\n\nHeads up: ${unapprovedServices.join(', ')} ${unapprovedServices.length === 1 ? 'is' : 'are'} priced ` +
            'from a rate the owner hasn’t commercially approved yet. Sending anyway tells the customer this is a real number.'
          : '';
        if (!confirmAction(
          `Send this quote for ${money(quote.total)}? It is locked once sent — ` +
          `changes after this need a new version.${warning}`)) return;
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
      class: 'btn btn--sm', text: isNative() ? 'Text Quote' : 'Copy SMS Text',
      onClick: async () => {
        const text = smsText(quote, publicUrl);
        // Native: skip the copy-then-paste round trip and open the SMS
        // composer directly, body prefilled -- same sms: scheme the
        // existing "Text"/"Call" buttons elsewhere already rely on to
        // reach the OS, just with a body param added.
        if (isNative()) {
          const phone = job.customers?.phone || '';
          window.location.href = `sms:${phone}?body=${encodeURIComponent(text)}`;
          return;
        }
        const ok = await copyToClipboard(text);
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
          class: 'btn', href: previewUrl,
          ...(isNative() ? {} : { target: '_blank', rel: 'noopener' }),
          text: 'Preview Quote'
        }),
        el('a', {
          class: 'btn', href: printUrl,
          ...(isNative() ? {} : { target: '_blank', rel: 'noopener' }),
          text: isNative() ? 'Share / Print' : 'Download PDF',
          onClick: (e) => {
            // Web keeps the plain navigation that already works (new tab,
            // ?print=1 autoprints). Native has no tab to open and no OS
            // print sheet, so this hands the link to the share sheet
            // instead -- whatever the tech picks (Mail, Messages, the
            // system browser) lands on the same autoprinting page.
            if (!isNative()) return;
            e.preventDefault();
            shareOrFallback(
              { title: 'Nova Shield Quote', url: printUrl },
              async () => { window.open(printUrl, '_blank', 'noopener'); }
            );
          }
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
              hapticLight();
              toast('Note saved');
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      ])
    ]);
  }

  function render({ quotes, measurements, services }) {
    const current = quotes[0];
    const { ungrouped, groups } = splitByOptionGroup(quotes);

    // .filter(Boolean) for the same reason measurements.js does it:
    // Element.append() stringifies any non-Node argument, so the trailing
    // conditional below rendered the literal text "null" in the field
    // console, which never passes measurements/services.
    clear(root).append(...[
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
      ...ungrouped.map((q, i) => renderQuote(q, i === 0)),
      ...[...groups.entries()].map(([groupId, groupQuotes]) => renderOptionGroup(groupId, groupQuotes)),
      // measurements/services are only passed from the desk admin view
      // (job.js) -- the field console (field-workspace.js) doesn't pass
      // them, so this simply doesn't render there. Measurement-subset
      // selection is a desk task, not a field one.
      measurements && services ? optionGroupBuilder({ measurements, services }) : null
    ].filter(Boolean));

    async function build(kind) {
      try {
        await api.createQuoteFromCalculation(job.id, kind);
        hapticLight();
        toast(kind === 'final' ? 'Draft quote built' : 'Preliminary estimate built');
        onChange();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  }

  return { root, render };
}
