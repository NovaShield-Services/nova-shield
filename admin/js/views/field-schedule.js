import * as api from '../lib/api.js';
import { el, clear, toast } from '../../../shared/dom.js';
import { money, humanise } from '../../../shared/format.js';

function timeOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null
    : d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

function latestQuoteTotal(job) {
  const quotes = job.ns_quotes || [];
  if (!quotes.length) return null;
  return quotes.reduce((a, b) => (b.version > a.version ? b : a)).total;
}

/** Today's Schedule Overview: every job booked for today, each with its own
 *  one-tap action bar. This is the field console's home screen. */
export async function renderSchedule({ mount, navigate }) {
  const visits = await api.listTodaysVisits();

  function actionBar(job) {
    const phone = job.customers?.phone;
    const address = [job.properties?.address_line1, job.properties?.city, job.properties?.postal_code]
      .filter(Boolean).join(', ');

    return el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
      el('button', {
        class: 'btn btn--primary', text: 'Start Site Visit',
        onClick: async (e) => {
          e.preventDefault();
          try {
            if (job.status !== 'in_progress') await api.updateJob(job.id, { status: 'in_progress' });
          } catch (err) { /* non-fatal -- still open the workspace */ }
          navigate(`/visit/${job.id}`);
        }
      }),
      address ? el('a', {
        class: 'btn btn--sm', target: '_blank', rel: 'noopener',
        href: `https://maps.google.com/?q=${encodeURIComponent(address)}`,
        onClick: (e) => e.stopPropagation(), text: 'Navigate'
      }) : null,
      phone ? el('a', { class: 'btn btn--sm', href: `tel:${phone}`,
        onClick: (e) => e.stopPropagation(), text: 'Call' }) : null,
      phone ? el('a', { class: 'btn btn--sm', href: `sms:${phone}`,
        onClick: (e) => e.stopPropagation(), text: 'Text' }) : null
    ]);
  }

  function visitCard(job) {
    const time = timeOnly(job.scheduled_for);
    const address = [job.properties?.address_line1, job.properties?.city].filter(Boolean).join(', ');
    const total = latestQuoteTotal(job);

    return el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: job.customers?.name || 'Unnamed customer' }),
          el('p', { text: address || 'No address on file' })
        ]),
        el('span', { class: 'badge badge--muted', text: humanise(job.status) })
      ]),
      el('p', { style: 'margin:0;display:flex;gap:14px;flex-wrap:wrap' }, [
        time ? el('span', { class: 'visit-card__time', text: time }) : null,
        total != null ? el('span', { class: 'money', text: `Quoted ${money(total)}` }) : null
      ]),
      actionBar(job)
    ]);
  }

  clear(mount).append(
    el('div', { class: 'page-head', style: 'padding:0 0 10px' }, [
      el('h1', { text: "Today's schedule" }),
      el('p', { text: visits.length
        ? `${visits.length} visit${visits.length === 1 ? '' : 's'} booked for today`
        : 'Nothing booked for today' })
    ]),
    visits.length
      ? el('div', {}, visits.map(visitCard))
      : el('div', { class: 'empty', text: 'No visits scheduled for today. Set a job’s "Scheduled for" date in the desktop field tool to see it here.' })
  );
}
