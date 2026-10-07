import * as api from '../lib/api.js';
import { el, clear, toast, select } from '../../../shared/dom.js';
import { date, humanise } from '../../../shared/format.js';
import { trySave, describeWriteError } from '../lib/save.js';

/* The full request lifecycle, which is its own vocabulary -- deliberately
   NOT mixed with job or quote status. quote_requests.status is a CHECK of
   new | reviewed | converted | spam | archived; the UI previously exposed
   only three of them and could set only 'spam', so 'reviewed' and
   'archived' were unreachable even though markRequestStatus supported them. */
const FILTERS = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed, not converted' },
  { value: 'converted', label: 'Converted' },
  { value: 'spam', label: 'Spam' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' }
];

const EMPTY_BY_STATUS = {
  new: 'No new requests. Everything is triaged.',
  reviewed: 'Nothing reviewed and waiting. Reviewed requests appear here until a job is created.',
  converted: 'No requests have been converted into jobs yet.',
  spam: 'Nothing marked as spam.',
  archived: 'Nothing archived.',
  all: 'No requests yet.'
};

export async function renderRequests({ mount, navigate, params }) {
  // Deep-linked from the dashboard, e.g. #/requests?status=new
  const wanted = params?.get('status');
  let status = FILTERS.some(f => f.value === wanted) ? wanted : 'new';

  const list = el('div', {});
  const filter = select(FILTERS, status, async e => {
    status = e.target.value;
    await load();
  });

  async function load() {
    clear(list).append(el('div', { class: 'loading', text: 'Loading…' }));

    let rows;
    try {
      rows = await api.listRequests(status);
    } catch (err) {
      clear(list).append(
        el('div', { class: 'card' }, [
          el('h2', { text: 'Could not load requests' }),
          el('p', { class: 'error-text', text: err.message }),
          el('div', { class: 'btn-row', style: 'margin-top:12px' }, [
            el('button', { class: 'btn', text: 'Retry', onClick: load })
          ])
        ])
      );
      return;
    }

    if (!rows.length) {
      clear(list).append(
        el('div', { class: 'empty', text: EMPTY_BY_STATUS[status] || 'Nothing here.' })
      );
      return;
    }

    clear(list).append(...rows.map(renderRow));
  }

  function renderRow(r) {
    const services = (r.quote_request_services || [])
      .map(s => s.services?.name || (s.other_label ? `${s.other_label} (other)` : null))
      .filter(Boolean);

    // create_job_from_request is idempotent -- it returns the existing job
    // when one already exists -- so this button is safe to press on an
    // already-converted request. The label and the toast say which of the
    // two actually happened rather than always claiming a creation.
    const alreadyConverted = r.status === 'converted';
    const convertLabel = alreadyConverted ? 'Open job' : 'Convert to job';
    const convertBtn = el('button', {
      class: 'btn btn--sm btn--primary',
      text: convertLabel,
      onClick: async () => {
        convertBtn.disabled = true;
        convertBtn.textContent = 'Working…';
        try {
          const jobId = await api.convertRequestToJob(r.id);
          toast(alreadyConverted ? 'Opening the existing job' : 'Job created');
          navigate(`/jobs/${jobId}`);
        } catch (err) {
          toast(describeWriteError(err), 'error');
          convertBtn.disabled = false;
          // Restore the label it actually had; this used to always reset to
          // "Convert to job", relabelling an Open-job button after a failure.
          convertBtn.textContent = convertLabel;
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
        // 'reviewed' means triaged but not yet turned into a job. The
        // dashboard counts exactly this bucket, so without a way to set it
        // that tile could only ever read zero.
        r.status === 'new'
          ? el('button', {
              class: 'btn btn--sm', text: 'Mark reviewed',
              onClick: async (e) => {
                const btn = e.target;
                btn.disabled = true;
                await trySave(() => api.markRequestStatus(r.id, 'reviewed'),
                              { success: 'Marked reviewed', after: load });
                btn.disabled = false;
              }
            })
          : null,
        r.status === 'new' || r.status === 'reviewed'
          ? el('button', {
              class: 'btn btn--sm', text: 'Mark spam',
              onClick: async (e) => {
                const btn = e.target;
                btn.disabled = true;
                await trySave(() => api.markRequestStatus(r.id, 'spam'),
                              { success: 'Marked as spam', after: load });
                btn.disabled = false;
              }
            })
          : null,
        r.status === 'spam'
          ? el('button', {
              class: 'btn btn--sm', text: 'Not spam',
              onClick: async (e) => {
                const btn = e.target;
                btn.disabled = true;
                await trySave(() => api.markRequestStatus(r.id, 'new'),
                              { success: 'Back in the new queue', after: load });
                btn.disabled = false;
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
