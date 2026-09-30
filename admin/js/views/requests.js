import * as api from '../lib/api.js';
import { el, clear, toast, select } from '../../../shared/dom.js';
import { date, humanise } from '../../../shared/format.js';

const FILTERS = [
  { value: 'new', label: 'New' },
  { value: 'converted', label: 'Converted' },
  { value: 'spam', label: 'Spam' },
  { value: 'all', label: 'All' }
];

export async function renderRequests({ mount, navigate }) {
  let status = 'new';

  const list = el('div', {});
  const filter = select(FILTERS, status, async e => {
    status = e.target.value;
    await load();
  });

  async function load() {
    clear(list).append(el('div', { class: 'loading', text: 'Loading…' }));
    const rows = await api.listRequests(status);

    if (!rows.length) {
      clear(list).append(el('div', { class: 'empty', text: 'Nothing here.' }));
      return;
    }

    clear(list).append(...rows.map(renderRow));
  }

  function renderRow(r) {
    const services = (r.quote_request_services || [])
      .map(s => s.services?.name || (s.other_label ? `${s.other_label} (other)` : null))
      .filter(Boolean);

    const convertBtn = el('button', {
      class: 'btn btn--sm btn--primary',
      text: r.status === 'converted' ? 'Open job' : 'Convert to job',
      onClick: async () => {
        convertBtn.disabled = true;
        convertBtn.textContent = 'Working…';
        try {
          const jobId = await api.convertRequestToJob(r.id);
          toast('Job created');
          navigate(`/jobs/${jobId}`);
        } catch (err) {
          toast(err.message, 'error');
          convertBtn.disabled = false;
          convertBtn.textContent = 'Convert to job';
        }
      }
    });

    const contact = [r.customers?.phone, r.customers?.email].filter(Boolean).join(' · ');

    return el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: r.customers?.name || 'Unnamed' }),
          el('p', { text: contact || 'No contact details' })
        ]),
        el('span', {
          class: `badge ${r.status === 'new' ? 'badge--warn' : 'badge--muted'}`,
          text: humanise(r.status)
        })
      ]),
      el('p', { class: 'row-item__meta',
        text: [r.properties?.address_line1, r.properties?.city, r.properties?.postal_code]
          .filter(Boolean).join(', ') || 'No address given' }),
      services.length
        ? el('p', { style: 'margin:8px 0 0' }, services.map(s =>
            el('span', { class: 'badge', style: 'margin:0 6px 6px 0', text: s })))
        : null,
      r.customer_message
        ? el('p', { style: 'margin:10px 0 0', text: r.customer_message })
        : null,
      r.preferred_schedule
        ? el('p', { class: 'hint', style: 'margin:6px 0 0',
                    text: `Prefers: ${r.preferred_schedule}` })
        : null,
      el('div', { class: 'btn-row', style: 'margin-top:12px' }, [
        convertBtn,
        r.status === 'new'
          ? el('button', {
              class: 'btn btn--sm', text: 'Mark spam',
              onClick: async () => {
                await api.markRequestStatus(r.id, 'spam');
                toast('Marked as spam');
                await load();
              }
            })
          : null
      ]),
      el('p', { class: 'hint', style: 'margin:10px 0 0',
                text: `Submitted ${date(r.submitted_at)}` })
    ]);
  }

  clear(mount).append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Quote requests' }),
      el('p', { text: 'What customers asked for, exactly as they sent it.' })
    ]),
    el('div', { class: 'card' }, [
      el('label', { class: 'field', style: 'margin:0;max-width:220px' }, [
        el('span', { text: 'Show' }), filter
      ])
    ]),
    list
  );

  await load();
}
