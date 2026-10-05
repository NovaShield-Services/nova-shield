import { supabase } from '../../../shared/supabase.js';
import { el, clear } from '../../../shared/dom.js';
import { money, date } from '../../../shared/format.js';

/* job-photos is a private bucket; getPublicUrl() only actually resolves for
   the one prefix (signatures/) a storage policy opens to anon readers --
   see the "public reads quote signatures" policy and signature_url's own
   comment on ns_quotes. Every other path in that bucket stays admin-only. */
function signatureUrl(path) {
  return supabase.storage.from('job-photos').getPublicUrl(path).data.publicUrl;
}

/* Customer-facing quote. Reads through get_customer_quote(), which returns a
   curated payload — internal notes, inspection findings, modifier factors and
   unit rates are never sent to this page, so they cannot leak from it.

   Phase C: a quote's own doc now additively carries `option_group` (null for
   an ordinary quote). The customer URL is still exactly one quote UUID --
   for an option-group member, ANY sibling's id resolves the whole group,
   since every sibling's own get_customer_quote() call returns the same
   group summary. There is still only one page/template; which view it shows
   (the option list, or one option's full detail) is just a client-side
   branch on whether `option_group` is present. */

const doc = document.getElementById('doc');

function message(title, body) {
  clear(doc).append(el('div', { class: 'sheet' }, [
    el('h1', { style: 'margin-top:0', text: title }),
    el('p', { style: 'color:#6c7772', text: body }),
    el('p', { style: 'margin-top:18px' }, [
      el('a', { href: 'index.html', style: 'color:#1d5f7a', text: '← Back to Nova Shield' })
    ])
  ]));
}

async function fetchQuote(id) {
  const { data, error } = await supabase.rpc('get_customer_quote', { p_quote_id: id });
  if (error || !data) return null;
  data.__id = id;
  return data;
}

function notFound() {
  message('Quote not available',
    'This quote could not be found. It may not have been sent yet, or the link may be ' +
    'incomplete. Please call or text us on 437-436-3360.');
}

function sheetHead(q) {
  const company = q.company || {};
  return el('div', { class: 'sheet-head' }, [
    el('div', {}, [
      el('span', { class: 'qlockup', role: 'img',
                   'aria-label': 'Nova Shield Maintenance Services' }),
      el('p', { style: 'margin:10px 0 0;font-size:.84rem;color:#6c7772' }, [
        company.phone || '', el('br'), company.email || ''
      ])
    ]),
    el('div', { class: 'meta' }, [
      el('strong', { text: `Quote ${q.reference || ''}` }),
      q.version > 1 ? el('div', { text: `Version ${q.version}` }) : null,
      el('div', { text: `Issued ${date(q.issued_on)}` }),
      q.valid_until ? el('div', { text: `Valid until ${date(q.valid_until)}` }) : null
    ])
  ]);
}

/** The financial breakdown shared by both the single-option detail view and
 *  the printable multi-option view -- lines, adjustments, tax, total,
 *  change orders. Never the status banner or actions; those are specific
 *  to the interactive detail view. */
function linesBlock(q) {
  return el('div', { class: 'lines' }, [
    ...(q.lines || []).flatMap(l => [
      el('div', { class: 'line' }, [
        el('span', { text: l.description }),
        el('span', { text: money(l.amount) })
      ]),
      // pricing_approved is never silently dropped here -- a rate the
      // owner hasn't signed off on yet never reads as an ordinary,
      // finalized line on a document a customer can accept.
      l.pricing_approved === false
        ? el('p', { style: 'margin:-6px 0 10px;font-size:.78rem;color:#8a6414',
            text: 'Estimate — final pricing pending confirmation' })
        : null
    ].filter(Boolean)),

    (q.adjustments || []).length
      ? el('div', { class: 'line' }, [
          el('span', { style: 'color:#8a948f', text: 'Subtotal' }),
          el('span', { style: 'color:#8a948f', text: money(q.subtotal) })
        ])
      : null,

    ...(q.adjustments || []).map(a => el('div', {
      class: `line ${Number(a.amount) < 0 ? 'line--credit' : ''}` }, [
      el('span', { text: a.label }),
      el('span', { text: money(a.amount) })
    ])),

    Number(q.tax_total) > 0
      ? el('div', { class: 'line' }, [
          el('span', { text: 'Tax' }), el('span', { text: money(q.tax_total) })
        ])
      : null,

    el('div', { class: 'line line--total' }, [
      el('span', { text: 'Total' }), el('span', { text: money(q.total) })
    ]),

    (q.change_orders || []).length
      ? el('div', { class: 'notes' }, [
          el('h3', { text: 'Approved changes since this quote' }),
          el('div', { class: 'lines' }, [
            ...q.change_orders.map(co => el('div', { class: 'line' }, [
              el('span', { text: co.description }), el('span', { text: money(co.amount) })
            ])),
            el('div', { class: 'line line--total', style: 'font-size:1rem' }, [
              el('span', { text: 'Quote + approved changes' }),
              el('span', { text: money(Number(q.total) + q.change_orders.reduce((s, c) => s + Number(c.amount), 0)) })
            ])
          ])
        ])
      : null
  ]);
}

/** One option's full detail -- lines, status, accept/decline, signature.
 *  Whether to show a "back to all options" link, and what it leads back
 *  to, is read straight off q.option_group -- never a separately-passed
 *  flag -- so it is always as fresh as q itself: after an accept/decline,
 *  this function re-renders with the just-refetched q, and that doc's own
 *  option_group already reflects the siblings' just-updated statuses.
 *  Functionally identical to how an ordinary (non-grouped) quote has
 *  always rendered -- q.option_group is simply null for those. */
function renderDetail(q) {
  const isOpen = q.status === 'sent';
  // respond_to_quote() blocks accepting this too (public RPC, so the real
  // enforcement has to live there) -- this just avoids a round-trip for the
  // case we can already see from the lines we rendered.
  const hasUnapprovedPricing = (q.lines || []).some((l) => l.pricing_approved === false);
  const isOption = !!q.option_group;

  const thing = isOption ? 'option' : 'quote';

  const statusBanner =
    q.status === 'accepted' ? el('div', { class: 'state state--ok',
      text: `You accepted this ${thing}. We will be in touch to book it in.` }) :
    q.status === 'declined' ? el('div', { class: 'state state--warn',
      text: `This ${thing} was declined. If that was a mistake, just call or text us.` }) :
    q.status === 'superseded' ? el('div', { class: 'state state--warn',
      text: isOption ? 'This option is no longer available.' : 'A newer version of this quote has been issued.' }) :
    q.status === 'expired' ? el('div', { class: 'state state--warn',
      text: 'This quote has expired. Get in touch and we will refresh it.' }) : null;

  const actions = el('div', { class: 'actions' });
  if (isOpen) {
    const accept = el('button', { class: 'btn btn--accept', text: `Accept this ${thing}` });
    const decline = el('button', { class: 'btn', text: 'Decline' });

    async function respond(kind, btn) {
      if (kind === 'declined' &&
          !window.confirm(`Decline this ${thing}? You can always ask us to re-quote.`)) return;
      accept.disabled = decline.disabled = true;
      btn.textContent = 'Sending…';
      const { error } = await supabase.rpc('respond_to_quote',
        { p_quote_id: q.__id, p_response: kind });
      if (error) {
        accept.disabled = decline.disabled = false;
        btn.textContent = kind === 'accepted' ? `Accept this ${thing}` : 'Decline';
        actions.after(el('div', { class: 'state state--warn',
          text: error.message || 'That did not go through — please call or text us.' }));
        return;
      }
      // Re-read this exact option so the page reflects the stored state,
      // not a guess -- the fresh doc's own option_group (if any) already
      // reflects the siblings' just-updated statuses too.
      const fresh = await fetchQuote(q.__id);
      if (!fresh) return notFound();
      renderDetail(fresh);
    }

    accept.addEventListener('click', () => respond('accepted', accept));
    decline.addEventListener('click', () => respond('declined', decline));
    // Declining a provisional price is always fine; only accepting it is
    // the risk, so only the accept button is held back.
    if (hasUnapprovedPricing) {
      actions.append(el('p', { class: 'state state--warn', style: 'margin:0 0 10px',
        text: `Final pricing is still pending confirmation. We will confirm your pricing before accepting this ${thing}.` }));
    } else {
      actions.append(accept);
    }
    actions.append(decline);
  }
  actions.append(el('button', { class: 'btn no-print', text: 'Print / save as PDF',
                                onClick: () => window.print() }));

  clear(doc).append(
    el('div', { class: 'sheet' }, [
      sheetHead(q),

      isOption ? el('button', { class: 'btn no-print', style: 'margin-bottom:18px',
        text: '← Back to all options', onClick: () => renderOptionList(q) }) : null,

      isOption ? el('p', { style: 'margin:-4px 0 18px;font-size:.8rem;' +
        'letter-spacing:.08em;text-transform:uppercase;color:#6c7772',
        text: q.option_group.options.find(o => o.id === q.__id)?.option_label || '' }) : null,

      el('div', { class: 'parties' }, [
        el('div', {}, [el('h2', { text: 'Prepared for' }),
                       el('p', { text: q.customer_name || '' })]),
        el('div', {}, [el('h2', { text: 'Property' }),
                       el('p', { text: q.property || '' })])
      ]),

      linesBlock(q),
      statusBanner,
      actions,

      q.customer_notes
        ? el('div', { class: 'notes' }, [
            el('h3', { text: 'About this quote' }), el('p', { text: q.customer_notes })])
        : null,
      q.terms
        ? el('div', { class: 'notes' }, [
            el('h3', { text: 'Terms' }), el('p', { text: q.terms })])
        : null,

      q.signature_path
        ? el('div', { class: 'notes' }, [
            el('h3', { text: 'Signature' }),
            el('img', {
              src: signatureUrl(q.signature_path), alt: `Signature of ${q.signed_by_name || 'the customer'}`,
              style: 'max-width:260px;width:100%;display:block;margin:4px 0 8px;' +
                     'border:1px solid #e6e1d6;border-radius:8px;background:#fff'
            }),
            el('p', { style: 'margin:0',
              text: `Signed by ${q.signed_by_name || 'the customer'} · ${date(q.signed_at)}` })
          ])
        : null
    ])
  );
}

/** A plain-language status note next to each option in the list -- never
 *  bare DB status words like "superseded". */
function optionStatusNote(opt) {
  if (opt.status === 'accepted') return { text: 'Accepted', cls: 'state--ok' };
  if (opt.status === 'declined') return { text: 'Declined', cls: 'state--warn' };
  if (opt.status === 'superseded' || opt.status === 'expired') return { text: 'No longer available', cls: 'state--warn' };
  return null;
}

/** The sibling summary -- option_group.options is already ordered by
 *  option_sort_order (then version) from the RPC itself, never re-sorted
 *  here by anything incidental like id or fetch order. */
function renderOptionList(q) {
  const options = q.option_group.options;
  const anyAccepted = options.some(o => o.status === 'accepted');

  clear(doc).append(
    el('div', { class: 'sheet' }, [
      sheetHead(q),
      el('h1', { style: 'margin:22px 0 6px', text: 'Choose your option' }),
      el('p', { style: 'color:#6c7772;margin:0 0 22px', text: anyAccepted
        ? 'Here is a summary of the options you were offered.'
        : 'Review each option, then accept the one that works best for you. Only one can be accepted.' }),

      el('div', {}, options.map((opt) => {
        const note = optionStatusNote(opt);
        return el('div', {
          style: 'display:flex;justify-content:space-between;align-items:center;gap:16px;' +
                 'padding:16px 0;border-bottom:1px solid #e6e1d6'
        }, [
          el('div', {}, [
            el('strong', { style: 'font-size:1.05rem', text: opt.option_label }),
            opt.pricing_approved === false
              ? el('p', { style: 'margin:4px 0 0;font-size:.78rem;color:#8a6414',
                  text: 'Estimate — final pricing pending confirmation' })
              : null,
            note ? el('p', { class: `state ${note.cls}`, style: 'display:inline-block;margin:6px 0 0;padding:4px 10px;font-size:.78rem', text: note.text }) : null
          ]),
          el('div', { style: 'display:flex;align-items:center;gap:14px' }, [
            el('span', { class: 'money', style: 'font-size:1.1rem', text: money(opt.total) }),
            el('button', { class: 'btn', text: 'View details', onClick: () => showOption(opt.id) })
          ])
        ]);
      })),

      el('button', { class: 'btn no-print', style: 'margin-top:20px', text: 'Print / save as PDF',
        onClick: () => window.print() })
    ])
  );
}

async function showOption(id) {
  const data = await fetchQuote(id);
  if (!data) return notFound();
  renderDetail(data);
}

/** Printing an option-group link prints ALL options as one proposal (per
 *  the Phase C PDF requirement), stacked on the single existing template --
 *  never a second PDF engine or a second page. */
async function renderPrintableGroup(anchor) {
  const docs = await Promise.all(anchor.option_group.options.map(o => fetchQuote(o.id)));
  clear(doc).append(
    el('div', { class: 'sheet' }, [
      sheetHead(anchor),
      el('h1', { style: 'margin:22px 0 18px', text: 'Your options' }),
      ...docs.filter(Boolean).map((d, i) => {
        const opt = anchor.option_group.options.find(o => o.id === d.__id);
        return el('div', { style: i > 0 ? 'margin-top:28px;border-top:1px solid #e6e1d6;padding-top:20px' : '' }, [
          el('h2', { style: 'margin:0 0 10px', text: opt?.option_label || `Option ${i + 1}` }),
          linesBlock(d)
        ]);
      })
    ])
  );
}

function printWhenReady() {
  const go = () => requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  if (document.fonts && document.fonts.status !== 'loaded') {
    document.fonts.ready.then(go).catch(go);
  } else {
    go();
  }
}

async function load() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const autoprint = params.get('print') === '1';
  if (!id) return message('Quote not found', 'This link is missing its quote reference.');

  const anchor = await fetchQuote(id);
  if (!anchor) return notFound();

  if (anchor.option_group) {
    if (autoprint) {
      await renderPrintableGroup(anchor);
      printWhenReady();
    } else {
      renderOptionList(anchor);
    }
  } else {
    renderDetail(anchor);
    if (autoprint) printWhenReady();
  }
}

load();
