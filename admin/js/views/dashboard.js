import * as api from '../lib/api.js';
import { el, clear } from '../../../shared/dom.js';
import { date } from '../../../shared/format.js';

/* Operational home screen: "what needs me next", not analytics.
 *
 * One round trip (admin_dashboard_summary), so a failed load is one honest
 * error rather than a screen of plausible zeros -- the old version fetched
 * every job row to tally in JS and had no way to tell "nothing to do" from
 * "the query failed".
 *
 * Every tile links at the records it counted, and the filter it links to is
 * evaluated by the same RPC family that produced the count, so a tile saying
 * "3 scheduled today" and the jobs list it opens cannot disagree.
 *
 * Nothing here is decorative. There is no revenue chart, no conversion rate
 * and no total-jobs vanity number: none of them tell an operator what to do,
 * and a couple of them would need data the schema does not record.
 */

/* key           -> summary field
   label/hint    -> what the operator is being asked to do
   href          -> the exact filtered view behind the number
   tone          -> 'warn' when it represents work waiting on us, 'ok' when
                    it is good news, 'muted' for neutral context. Never a
                    colour that makes a loss look like a win.
   urgent        -> sorts to the front when non-zero */
const TILES = [
  { key: 'requests_new', label: 'New requests', tone: 'warn', urgent: true,
    hint: 'Straight from the website, not yet triaged',
    href: '#/requests?status=new' },

  { key: 'requests_reviewed_unconverted', label: 'Reviewed, not converted', tone: 'warn', urgent: true,
    hint: 'Triaged but no job created yet',
    href: '#/requests?status=reviewed' },

  { key: 'overdue_scheduled', label: 'Overdue on site', tone: 'warn', urgent: true,
    hint: 'Scheduled date has passed and the job is not complete',
    href: '#/jobs?bucket=overdue' },

  { key: 'jobs_accepted_unscheduled', label: 'Accepted, needs booking', tone: 'warn', urgent: true,
    hint: 'Customer said yes — these will not reach the field until a date is set',
    href: '#/jobs?bucket=unscheduled&status=accepted' },

  { key: 'jobs_with_review_flags', label: 'Flagged for review', tone: 'warn', urgent: true,
    hint: 'A measurement or elevation someone marked as needing a second look',
    href: '#/jobs?needs_review=1' },

  { key: 'scheduled_today', label: 'On today', tone: 'muted',
    hint: 'Booked in for today',
    href: '#/jobs?bucket=today' },

  { key: 'scheduled_next_7_days', label: 'Next 7 days', tone: 'muted',
    hint: 'Coming up',
    href: '#/jobs?bucket=upcoming' },

  { key: 'jobs_awaiting_customer', label: 'Awaiting customer', tone: 'muted',
    hint: 'A quote is out; nothing to do until they reply',
    href: '#/jobs?status=quote_sent' },

  { key: 'completed_last_14_days', label: 'Completed (14 days)', tone: 'ok',
    hint: 'Recently finished',
    href: '#/jobs?status=completed' }
];

/* Activity kinds admin_dashboard_summary can emit. Same discipline as the
   job timeline: only real, dated events. */
const ACTIVITY_LABELS = {
  request_received: 'Request received',
  quote_sent: 'Quote sent',
  quote_accepted: 'Quote accepted',
  quote_declined: 'Quote declined',
  job_completed: 'Job completed',
  note_added: 'Note added'
};

export async function renderDashboard({ mount }) {
  clear(mount).append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Dashboard' }),
      el('p', { text: 'What needs you next.' })
    ]),
    el('div', { class: 'loading', text: 'Loading…' })
  );

  let summary;
  try {
    summary = await api.dashboardSummary();
  } catch (err) {
    // Never show zeros for a failed request -- that reads as "nothing to do".
    clear(mount).append(
      el('div', { class: 'page-head' }, [
        el('h1', { text: 'Dashboard' }),
        el('p', { text: 'What needs you next.' })
      ]),
      el('div', { class: 'card' }, [
        el('h2', { text: 'Could not load the dashboard' }),
        el('p', { class: 'error-text', text: err.message }),
        el('p', { class: 'hint', text: 'No counts are shown rather than showing zeros, ' +
                                       'which would read as "nothing needs attention".' }),
        el('div', { class: 'btn-row', style: 'margin-top:12px' }, [
          el('button', { class: 'btn', text: 'Retry', onClick: () => renderDashboard({ mount }) })
        ])
      ])
    );
    return;
  }

  const count = (key) => Number(summary?.[key] ?? 0);

  // Anything actionable and non-zero comes first; the rest keep their order.
  const ordered = [
    ...TILES.filter(t => t.urgent && count(t.key) > 0),
    ...TILES.filter(t => !t.urgent),
    ...TILES.filter(t => t.urgent && count(t.key) === 0)
  ];

  const tiles = el('div', { class: 'stat-grid' }, ordered.map(t => {
    const n = count(t.key);
    const tone = n === 0 ? 'muted' : t.tone;
    return el('a', { class: 'stat', href: t.href, title: t.hint }, [
      el('span', { class: 'stat__n', text: String(n) }),
      el('span', { class: 'stat__l', text: t.label }),
      tone === 'warn' && n > 0
        ? el('span', { class: 'badge badge--warn', style: 'margin-top:6px', text: 'Needs action' })
        : null
    ]);
  }));

  const needsAction = TILES.filter(t => t.urgent && count(t.key) > 0);

  const activity = Array.isArray(summary.recent_activity) ? summary.recent_activity : [];
  const activityList = activity.length
    ? el('div', {}, activity.slice(0, 8).map(a => {
        const label = ACTIVITY_LABELS[a.kind] || String(a.kind || 'Activity').replace(/_/g, ' ');
        const bits = [a.customer, a.version ? `v${a.version}` : null,
                      a.visibility === 'customer' ? 'customer-visible' : null]
          .filter(Boolean).join(' · ');
        const row = el('div', { class: 'row-item' }, [
          el('div', { class: 'row-item__main' }, [
            el('strong', { text: label }),
            el('span', { class: 'row-item__meta', text: [bits, date(a.at)].filter(Boolean).join(' — ') })
          ]),
          a.job_id ? el('a', { class: 'btn btn--sm', href: `#/jobs/${a.job_id}`, text: 'Open' }) : null
        ]);
        return row;
      }))
    : el('div', { class: 'empty', text: 'No recent activity recorded yet.' });

  clear(mount).append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Dashboard' }),
      el('p', { text: needsAction.length
        ? `${needsAction.length} thing${needsAction.length === 1 ? '' : 's'} need attention.`
        : 'Nothing is waiting on you.' })
    ]),

    tiles,

    // A plain-language restatement of the urgent tiles, so the operator does
    // not have to read nine numbers to find the one that matters.
    needsAction.length
      ? el('div', { class: 'card', style: 'margin-top:14px' }, [
          el('div', { class: 'card__head' }, [
            el('div', {}, [
              el('h2', { text: 'Needs attention' }),
              el('p', { text: 'Each of these links to the exact records behind it.' })
            ])
          ]),
          el('div', {}, needsAction.map(t => el('div', { class: 'row-item' }, [
            el('div', { class: 'row-item__main' }, [
              el('strong', { text: `${count(t.key)} · ${t.label}` }),
              el('span', { class: 'row-item__meta', text: t.hint })
            ]),
            el('a', { class: 'btn btn--sm btn--primary', href: t.href, text: 'Open' })
          ])))
        ])
      : null,

    el('div', { class: 'card', style: 'margin-top:14px' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'Recent activity' }),
          el('p', { text: 'Real recorded events only — requests, quotes, completions and notes.' })
        ]),
        el('a', { class: 'btn btn--sm', href: '#/jobs', text: 'All jobs' })
      ]),
      activityList
    ]),

    summary.generated_at
      ? el('p', { class: 'hint', style: 'margin-top:10px',
                  text: `Counts as of ${date(summary.generated_at)}.` })
      : null
  );
}
