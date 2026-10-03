import * as api from '../lib/api.js';
import { el, clear, toast, select, confirmAction } from '../../../shared/dom.js';
import { money, date, humanise } from '../../../shared/format.js';

const SEASONAL_CATEGORY = 'lighting'; // Christmas + permanent outdoor lighting
const CURRENT_YEAR = new Date().getFullYear();

/** One row per customer+service: their most recent quote for a seasonal
 *  service, so "renew for this season" has one obvious candidate to clone
 *  rather than the admin having to hunt through quote history themselves. */
function seasonalCandidates(allQuotes) {
  const byKey = new Map();
  for (const q of allQuotes) {
    const job = q.ns_jobs;
    if (!job) continue;
    const seasonalLines = (q.quote_line_items || [])
      .filter((li) => li.services?.category === SEASONAL_CATEGORY);
    if (!seasonalLines.length) continue;

    for (const serviceName of new Set(seasonalLines.map((li) => li.services.name))) {
      const key = `${job.customer_id}::${serviceName}`;
      const existing = byKey.get(key);
      if (!existing || new Date(q.created_at) > new Date(existing.created_at)) {
        byKey.set(key, { ...q, serviceName, customer: job.customers, property: job.properties });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renewalsCard(onChange) {
  const host = el('div', { class: 'card' });

  async function load() {
    const quotes = await api.listSeasonalQuoteHistory();
    const candidates = seasonalCandidates(quotes);
    const lastYearOrOlder = candidates.filter((c) => new Date(c.created_at).getFullYear() < CURRENT_YEAR);

    clear(host).append(
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'Seasonal renewals' }),
          el('p', { text: 'Customers with a past Christmas or permanent lighting quote, due for this season.' })
        ])
      ]),
      lastYearOrOlder.length
        ? el('div', {}, lastYearOrOlder.map((c) => el('div', { class: 'row-item' }, [
            el('div', { class: 'row-item__main' }, [
              el('strong', { text: c.customer?.name || 'Unnamed customer' }),
              el('span', { class: 'row-item__meta',
                text: `${c.serviceName} · last quoted ${date(c.created_at)} · ${money(c.total)} · ` +
                      `${c.property?.address_line1 || ''}` })
            ]),
            el('button', {
              class: 'btn btn--sm btn--primary', text: 'Generate Renewal Quote',
              onClick: async () => {
                if (!confirmAction(
                  `Clone ${c.customer?.name}'s ${c.serviceName} quote into a new draft for this season?`)) return;
                try {
                  await api.duplicateQuote(c.id);
                  toast('Renewal quote created as a new draft on that job');
                  onChange?.();
                } catch (err) { toast(err.message, 'error'); }
              }
            })
          ])))
        : el('div', { class: 'empty', text: 'No seasonal renewals due — nothing from a prior year found yet.' })
    );
  }

  load();
  return { root: host, reload: load };
}

function snowEventsCard(onSelectEvent) {
  const host = el('div', { class: 'card' });
  const dateInput = el('input', { type: 'date' });
  const accumInput = el('input', { type: 'number', step: '0.5', min: '0', placeholder: 'cm' });
  const notesInput = el('input', { placeholder: 'Optional notes' });

  async function load() {
    const events = await api.listSnowEvents();

    clear(host).append(
      el('div', { class: 'card__head' }, [
        el('div', {}, [el('h2', { text: 'Snow events' }), el('p', { text: 'Log each storm once, then clear properties against it.' })])
      ]),
      el('div', { class: 'grid grid--3' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Date' }), dateInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Accumulation (cm)' }), accumInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Notes' }), notesInput])
      ]),
      el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
        el('button', {
          class: 'btn btn--sm btn--primary', text: '+ Log snow event',
          onClick: async () => {
            if (!dateInput.value) return toast('Pick a date', 'error');
            try {
              await api.addSnowEvent({
                eventDate: dateInput.value,
                accumulationCm: accumInput.value ? Number(accumInput.value) : null,
                notes: notesInput.value.trim()
              });
              dateInput.value = ''; accumInput.value = ''; notesInput.value = '';
              toast('Snow event logged');
              await load();
            } catch (err) { toast(err.message, 'error'); }
          }
        })
      ]),
      events.length ? el('div', { style: 'margin-top:14px' }, events.map((ev) => el('div', { class: 'row-item' }, [
        el('div', { class: 'row-item__main' }, [
          el('strong', { text: date(ev.event_date) }),
          el('span', { class: 'row-item__meta',
            text: [ev.accumulation_cm != null ? `${ev.accumulation_cm} cm` : null, ev.notes].filter(Boolean).join(' · ') })
        ]),
        el('button', { class: 'btn btn--sm', text: 'Log clears for this event', onClick: () => onSelectEvent(ev) }),
        el('button', {
          class: 'btn btn--sm btn--danger', text: 'Delete',
          onClick: async () => {
            if (!confirmAction('Delete this snow event? Clears already logged against it stay on file.')) return;
            await api.deleteSnowEvent(ev.id); await load();
          }
        })
      ]))) : el('div', { class: 'empty', text: 'No snow events logged yet.' })
    );
  }

  load();
  return { root: host, reload: load };
}

function clearsCard() {
  const host = el('div', { class: 'card' });
  let selectedEvent = null;
  let properties = [];

  async function setEvent(ev) {
    selectedEvent = ev;
    await render();
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function render() {
    if (!properties.length) properties = await api.listWinterProperties();
    const clears = await api.listPropertyClears(selectedEvent?.id);

    const propertySelect = select(
      properties.map((p) => ({ value: p.id, label: `${p.address_line1}${p.customers?.name ? ' — ' + p.customers.name : ''}` })),
      properties[0]?.id || '', () => {}
    );
    const saltInput = el('input', { type: 'number', step: '0.5', min: '0', placeholder: 'kg' });
    const notesInput = el('input', { placeholder: 'Optional notes' });

    clear(host).append(
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'Property clears' }),
          el('p', { text: selectedEvent ? `Logging against ${date(selectedEvent.event_date)}` : 'Showing all logged clears.' })
        ]),
        selectedEvent ? el('button', { class: 'btn btn--sm', text: 'Show all', onClick: () => setEvent(null) }) : null
      ]),
      el('div', { class: 'grid grid--3' }, [
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Property' }), propertySelect]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Salt applied' }), saltInput]),
        el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Notes' }), notesInput])
      ]),
      el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
        el('button', {
          class: 'btn btn--sm btn--primary', text: '+ Log a clear',
          onClick: async () => {
            if (!propertySelect.value) return toast('Pick a property', 'error');
            try {
              await api.logPropertyClear({
                propertyId: propertySelect.value, eventId: selectedEvent?.id || null,
                saltAppliedKg: saltInput.value ? Number(saltInput.value) : null, notes: notesInput.value.trim()
              });
              toast('Clear logged');
              await render();
            } catch (err) { toast(err.message, 'error'); }
          }
        })
      ]),
      clears.length ? el('div', { style: 'margin-top:14px' }, clears.map((c) => el('div', { class: 'row-item' }, [
        el('div', { class: 'row-item__main' }, [
          el('strong', { text: c.properties?.address_line1 || 'Unknown property' }),
          el('span', { class: 'row-item__meta',
            text: [date(c.cleared_at), c.salt_applied_kg != null ? `${c.salt_applied_kg} kg salt` : null, c.notes]
              .filter(Boolean).join(' · ') })
        ])
      ]))) : el('div', { class: 'empty', text: 'No clears logged yet.' })
    );
  }

  render();
  return { root: host, setEvent };
}

export async function renderWinter({ mount }) {
  clear(mount).append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Winter & seasonal operations' }),
      el('p', { text: 'Snow event tracking, per-property clears, and seasonal renewal quotes.' })
    ])
  );

  const renewals = renewalsCard();
  const clears = clearsCard();
  const events = snowEventsCard((ev) => clears.setEvent(ev));

  mount.append(renewals.root, events.root, clears.root);
}
