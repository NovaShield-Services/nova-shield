import * as api from '../lib/api.js';
import { el, clear } from '../../../shared/dom.js';
import { humanise, date } from '../../../shared/format.js';

/* Which job states deserve their own tile. Kept short on purpose -- the
   dashboard answers "what needs me today", not "show me everything". */
const TILES = [
  { key: 'reviewing',            label: 'To review' },
  { key: 'site_visit_scheduled', label: 'Visit booked' },
  { key: 'assessed',             label: 'Ready to quote' },
  { key: 'quote_sent',           label: 'Quote sent' },
  { key: 'accepted',             label: 'Accepted' },
  { key: 'scheduled',            label: 'Scheduled' },
  { key: 'in_progress',          label: 'In progress' },
  { key: 'completed',            label: 'Completed' }
];

export async function renderDashboard({ mount }) {
  const [counts, requests] = await Promise.all([
    api.dashboardCounts(),
    api.listRequests('new')
  ]);

  const tiles = el('div', { class: 'stat-grid' }, [
    el('a', { class: 'stat', href: '#/requests' }, [
      el('span', { class: 'stat__n', text: String(counts.newRequests) }),
      el('span', { class: 'stat__l', text: 'New requests' })
    ]),
    ...TILES
      .filter(t => counts.jobsByStatus[t.key])
      .map(t => el('a', { class: 'stat', href: '#/jobs' }, [
        el('span', { class: 'stat__n', text: String(counts.jobsByStatus[t.key]) }),
        el('span', { class: 'stat__l', text: t.label })
      ]))
  ]);

  const requestList = requests.length
    ? el('div', {}, requests.slice(0, 8).map(r => {
        const services = (r.quote_request_services || [])
          .map(s => s.services?.name || s.other_label).filter(Boolean).join(', ');
        return el('div', { class: 'row-item' }, [
          el('div', { class: 'row-item__main' }, [
            el('strong', { text: r.customers?.name || 'Unnamed' }),
            el('span', { class: 'row-item__meta',
              text: [r.properties?.address_line1, services].filter(Boolean).join(' · ') })
          ]),
          el('span', { class: 'badge badge--warn', text: date(r.submitted_at) }),
          el('a', { class: 'btn btn--sm', href: `#/requests`, text: 'Open' })
        ]);
      }))
    : el('div', { class: 'empty', text: 'No new requests. Everything is triaged.' });

  clear(mount).append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Dashboard' }),
      el('p', { text: `${counts.totalJobs} job${counts.totalJobs === 1 ? '' : 's'} on the books` })
    ]),
    tiles,
    el('div', { class: 'card', style: 'margin-top:14px' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'New requests' }),
          el('p', { text: 'Straight from the website — not yet reviewed.' })
        ]),
        el('a', { class: 'btn btn--sm', href: '#/requests', text: 'See all' })
      ]),
      requestList
    ])
  );
}
