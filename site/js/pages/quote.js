import { supabase } from '../../../shared/supabase.js';
import { el, clear } from '../../../shared/dom.js';
import { money, date } from '../../../shared/format.js';

/* Customer-facing quote. Reads through get_customer_quote(), which returns a
   curated payload — internal notes, inspection findings, modifier factors and
   unit rates are never sent to this page, so they cannot leak from it. */

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

function render(q) {
  const company = q.company || {};
  const isOpen = q.status === 'sent';

  const statusBanner =
    q.status === 'accepted' ? el('div', { class: 'state state--ok',
      text: 'You accepted this quote. We will be in touch to book it in.' }) :
    q.status === 'declined' ? el('div', { class: 'state state--warn',
      text: 'This quote was declined. If that was a mistake, just call or text us.' }) :
    q.status === 'superseded' ? el('div', { class: 'state state--warn',
      text: 'A newer version of this quote has been issued.' }) :
    q.status === 'expired' ? el('div', { class: 'state state--warn',
      text: 'This quote has expired. Get in touch and we will refresh it.' }) : null;

  const actions = el('div', { class: 'actions' });
  if (isOpen) {
    const accept = el('button', { class: 'btn btn--accept', text: 'Accept this quote' });
    const decline = el('button', { class: 'btn', text: 'Decline' });

    async function respond(kind, btn) {
      if (kind === 'declined' &&
          !window.confirm('Decline this quote? You can always ask us to re-quote.')) return;
      accept.disabled = decline.disabled = true;
      btn.textContent = 'Sending…';
      const { error } = await supabase.rpc('respond_to_quote',
        { p_quote_id: q.__id, p_response: kind });
      if (error) {
        accept.disabled = decline.disabled = false;
        btn.textContent = kind === 'accepted' ? 'Accept this quote' : 'Decline';
        actions.after(el('div', { class: 'state state--warn',
          text: error.message || 'That did not go through — please call or text us.' }));
        return;
      }
      load();  // re-read so the page reflects the stored state, not a guess
    }

    accept.addEventListener('click', () => respond('accepted', accept));
    decline.addEventListener('click', () => respond('declined', decline));
    actions.append(accept, decline);
  }
  actions.append(el('button', { class: 'btn no-print', text: 'Print / save as PDF',
                                onClick: () => window.print() }));

  clear(doc).append(
    el('div', { class: 'sheet' }, [
      el('div', { class: 'sheet-head' }, [
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
      ]),

      el('div', { class: 'parties' }, [
        el('div', {}, [el('h2', { text: 'Prepared for' }),
                       el('p', { text: q.customer_name || '' })]),
        el('div', {}, [el('h2', { text: 'Property' }),
                       el('p', { text: q.property || '' })])
      ]),

      el('div', { class: 'lines' }, [
        ...(q.lines || []).map(l => el('div', { class: 'line' }, [
          el('span', { text: l.description }),
          el('span', { text: money(l.amount) })
        ])),

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
        ])
      ]),

      statusBanner,
      actions,

      q.customer_notes
        ? el('div', { class: 'notes' }, [
            el('h3', { text: 'About this quote' }), el('p', { text: q.customer_notes })])
        : null,
      q.terms
        ? el('div', { class: 'notes' }, [
            el('h3', { text: 'Terms' }), el('p', { text: q.terms })])
        : null
    ])
  );
}

async function load() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return message('Quote not found', 'This link is missing its quote reference.');

  const { data, error } = await supabase.rpc('get_customer_quote', { p_quote_id: id });

  if (error || !data) {
    return message('Quote not available',
      'This quote could not be found. It may not have been sent yet, or the link may be ' +
      'incomplete. Please call or text us on 437-436-3360.');
  }

  data.__id = id;
  render(data);
}

load();
