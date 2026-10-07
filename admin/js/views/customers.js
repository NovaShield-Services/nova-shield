import * as api from '../lib/api.js';
import { el, clear, select } from '../../../shared/dom.js';
import { date, humanise } from '../../../shared/format.js';
import { trySave } from '../lib/save.js';

/* Customers and their properties -- the persistent layer underneath jobs.
 *
 * WHAT IS SHOWN IS EXACTLY WHAT THE SCHEMA HOLDS. customers has
 * (name, email, phone, preferred_contact, notes, created_at, updated_at)
 * and nothing else. There is no last_contacted, no lifetime value, no
 * communication log, and no engagement score, because none of those are
 * recorded anywhere -- so none of them appear here. The counts that do
 * appear (properties, jobs, last job) are computed server-side by
 * search_customers from real rows.
 */

/* Shared with the jobs list: accepted is the ONLY ok tone, so a declined or
   superseded quote can never read as a win. */
const QUOTE_TONE = {
  draft: 'badge--muted', sent: 'badge--warn', accepted: 'badge--ok',
  declined: 'badge--muted', expired: 'badge--muted', superseded: 'badge--muted'
};

const SORTS = [
  { value: 'name_asc',     label: 'Name A–Z' },
  { value: 'recent_job',   label: 'Most recent job' },
  { value: 'created_desc', label: 'Newest customer' }
];

/* The one CHECK the database enforces on this column. Offering anything
   else would produce a save that fails at the constraint. */
const CONTACT_METHODS = [
  { value: '',       label: 'Not stated' },
  { value: 'phone',  label: 'Phone' },
  { value: 'email',  label: 'Email' },
  { value: 'text',   label: 'Text' },
  { value: 'either', label: 'Either' }
];

function addressLine(p) {
  return [p?.address_line1, p?.city, p?.postal_code].filter(Boolean).join(', ');
}

/* ------------------------------------------------------------- the list -- */

export async function renderCustomers({ mount, params, replaceQuery }) {
  const state = {
    query: params?.get('q') || '',
    sort: params?.get('sort') || 'name_asc'
  };

  const searchInput = el('input', {
    type: 'search', value: state.query, 'aria-label': 'Search customers',
    placeholder: 'Name, email, phone, or any of their property addresses'
  });
  const sortSelect = select(SORTS, state.sort, () => { state.sort = sortSelect.value; load(); });

  let typingTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { state.query = searchInput.value; load(); }, 250);
  });

  const summaryLine = el('p', { class: 'hint', style: 'margin:0 0 10px' });
  const list = el('div', {});

  function syncUrl() {
    if (!replaceQuery) return;
    const qs = new URLSearchParams();
    if (state.query) qs.set('q', state.query);
    if (state.sort && state.sort !== 'name_asc') qs.set('sort', state.sort);
    replaceQuery(qs.toString());
  }

  function row(c) {
    const props = Array.isArray(c.properties) ? c.properties : [];
    const contact = [c.phone, c.email].filter(Boolean).join(' · ');

    return el('div', { class: 'row-item' }, [
      el('div', { class: 'row-item__main' }, [
        el('strong', { text: c.name || 'Unnamed customer' }),
        el('span', { class: 'row-item__meta', text: contact || 'No contact details on file' }),
        props.length
          ? el('span', { class: 'row-item__meta',
                         text: props.map(addressLine).filter(Boolean).join(' · ') +
                               (Number(c.property_count) > props.length
                                 ? ` +${Number(c.property_count) - props.length} more`
                                 : '') })
          : el('span', { class: 'row-item__meta', text: 'No property on file' }),
        c.last_job_at
          ? el('span', { class: 'row-item__meta', text: `Last job ${date(c.last_job_at)}` })
          : null
      ]),
      el('span', { class: 'row-item__badges' }, [
        el('span', { class: 'badge badge--muted',
                     text: `${c.property_count} ${Number(c.property_count) === 1 ? 'property' : 'properties'}` }),
        el('span', { class: 'badge badge--muted',
                     text: `${c.job_count} ${Number(c.job_count) === 1 ? 'job' : 'jobs'}` }),
        c.preferred_contact
          ? el('span', { class: 'badge badge--muted', text: `Prefers ${humanise(c.preferred_contact)}` })
          : null
      ]),
      el('a', { class: 'btn btn--sm', href: `#/customers/${c.id}`, text: 'Open' })
    ]);
  }

  async function load() {
    syncUrl();
    clear(list).append(el('div', { class: 'loading', text: 'Loading…' }));
    summaryLine.textContent = '';

    let result;
    try {
      result = await api.searchCustomers({ query: state.query, sort: state.sort, limit: 50 });
    } catch (err) {
      clear(list).append(
        el('div', { class: 'card' }, [
          el('h2', { text: 'Could not load customers' }),
          el('p', { class: 'error-text', text: err.message }),
          el('div', { class: 'btn-row', style: 'margin-top:12px' }, [
            el('button', { class: 'btn', text: 'Retry', onClick: load })
          ])
        ])
      );
      return;
    }

    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const total = Number(result?.total || 0);

    summaryLine.textContent = total
      ? `${total} customer${total === 1 ? '' : 's'}` +
        (rows.length < total ? ` · showing the first ${rows.length}` : '')
      : '';

    if (!rows.length) {
      clear(list).append(
        state.query
          ? el('div', { class: 'card' }, [
              el('div', { class: 'empty', text: 'No customers match that search.' }),
              el('div', { class: 'btn-row', style: 'margin-top:12px;justify-content:center' }, [
                el('button', {
                  class: 'btn btn--sm', text: 'Clear search',
                  onClick: () => { state.query = ''; searchInput.value = ''; load(); }
                })
              ])
            ])
          : el('div', { class: 'empty',
                        text: 'No customers yet. They are created automatically when ' +
                              'a quote request comes in from the website.' })
      );
      return;
    }

    clear(list).append(...rows.map(row));
  }

  clear(mount).append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Customers' }),
      el('p', { text: 'Everyone on file, and the properties they own. Searching covers ' +
                      'their details and their property addresses.' })
    ]),
    el('div', { class: 'card' }, [
      el('label', { class: 'field' }, [el('span', { text: 'Search' }), searchInput]),
      el('label', { class: 'field', style: 'margin:0;max-width:260px' }, [
        el('span', { text: 'Sort by' }), sortSelect
      ])
    ]),
    summaryLine,
    list
  );

  await load();
}

/* ----------------------------------------------------------- the detail -- */

export async function renderCustomer({ mount, navigate, setContextParent }, customerId) {
  setContextParent?.('/customers');

  const [customer, jobs, requests] = await Promise.all([
    api.getCustomer(customerId),
    api.listCustomerJobs(customerId),
    api.listCustomerRequests(customerId)
  ]);

  const properties = Array.isArray(customer.properties) ? customer.properties : [];
  const detailsHost = el('div', {});

  /* ------------------------------------------------------------ details -- */

  function renderDetails() {
    const nameInput  = el('input', { value: customer.name || '', 'aria-label': 'Customer name' });
    const emailInput = el('input', { type: 'email', value: customer.email || '', 'aria-label': 'Email' });
    const phoneInput = el('input', { type: 'tel', value: customer.phone || '', 'aria-label': 'Phone' });
    const contactSel = select(CONTACT_METHODS, customer.preferred_contact || '', () => {});
    const notesInput = el('textarea', { rows: '3', 'aria-label': 'Internal notes' });
    notesInput.value = customer.notes || '';

    const errorEl = el('p', { class: 'error-text', style: 'margin:8px 0 0', hidden: true });
    const saveBtn = el('button', { class: 'btn btn--primary', text: 'Save changes' });
    const cancelBtn = el('button', { class: 'btn', text: 'Cancel' });

    function showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    }

    /* Validation mirrors what submit_quote_request already enforces, so the
       admin cannot save a shape the public form would have refused. */
    function validate() {
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const phone = phoneInput.value.trim();

      if (name.length < 2) return 'A name of at least two characters is required.';
      if (!email && !phone) return 'Keep at least one of email or phone — ' +
                                   'both are how a customer is recognised next time.';
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return 'That email address does not look valid.';
      }
      if (phone && phone.replace(/[^0-9+]/g, '').length < 7) {
        return 'That phone number does not look valid.';
      }
      return null;
    }

    cancelBtn.addEventListener('click', () => {
      nameInput.value = customer.name || '';
      emailInput.value = customer.email || '';
      phoneInput.value = customer.phone || '';
      contactSel.value = customer.preferred_contact || '';
      notesInput.value = customer.notes || '';
      showError('');
    });

    saveBtn.addEventListener('click', async () => {
      const problem = validate();
      if (problem) { showError(problem); return; }
      showError('');

      // Disable for the whole round trip: a second click would issue a
      // second UPDATE against the row this one is still writing.
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      const label = saveBtn.textContent;
      saveBtn.textContent = 'Saving…';

      const patch = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim() || null,
        phone: phoneInput.value.trim() || null,
        preferred_contact: contactSel.value || null,
        notes: notesInput.value.trim() || null
      };

      const ok = await trySave(
        async () => { Object.assign(customer, await api.updateCustomer(customer.id, patch)); },
        { success: 'Customer updated' }
      );

      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = label;
      if (ok) renderDetails();
    });

    clear(detailsHost).append(
      el('div', { class: 'card' }, [
        el('div', { class: 'card__head' }, [
          el('div', {}, [
            el('h2', { text: 'Details' }),
            el('p', { text: 'Only the fields this system actually stores.' })
          ])
        ]),
        el('div', { class: 'grid grid--2' }, [
          el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Name' }), nameInput]),
          el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Preferred contact' }), contactSel])
        ]),
        el('div', { class: 'grid grid--2', style: 'margin-top:10px' }, [
          el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Email' }), emailInput]),
          el('label', { class: 'field', style: 'margin:0' }, [el('span', { text: 'Phone' }), phoneInput])
        ]),
        el('label', { class: 'field', style: 'margin-top:10px' }, [
          el('span', { text: 'Internal notes' }), notesInput
        ]),
        /* Email, phone and address are the keys the public request form
           matches on when deciding whether a submission belongs to an
           existing customer. Changing them is allowed and sometimes
           necessary -- but saying so beats a silent duplicate later. */
        el('p', { class: 'hint', style: 'margin:0' },
          ['Email and phone are how a new website request is matched to this ' +
           'customer. Changing them means a future request using the old ' +
           'details will create a separate customer.']),
        errorEl,
        el('div', { class: 'btn-row', style: 'margin-top:12px' }, [saveBtn, cancelBtn])
      ])
    );
  }

  /* -------------------------------------------------------- collections -- */

  function propertiesCard() {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'Properties' }),
          el('p', { text: 'Each one keeps its own Property Passport across every visit.' })
        ]),
        el('span', { class: 'badge badge--muted', text: String(properties.length) })
      ]),
      properties.length
        ? el('div', {}, properties.map(p => el('div', { class: 'row-item' }, [
            el('div', { class: 'row-item__main' }, [
              el('strong', { text: p.address_line1 || 'Address not recorded' }),
              el('span', { class: 'row-item__meta',
                           text: [p.city, p.province, p.postal_code].filter(Boolean).join(', ') ||
                                 'No city or postcode on file' }),
              p.access_note
                ? el('span', { class: 'row-item__meta', text: `Access: ${p.access_note}` })
                : null
            ]),
            el('span', { class: 'row-item__badges' }, [
              p.property_type
                ? el('span', { class: 'badge badge--muted', text: humanise(p.property_type) })
                : null
            ]),
            el('a', { class: 'btn btn--sm', href: `#/properties/${p.id}`, text: 'Passport' })
          ])))
        : el('div', { class: 'empty',
                      text: 'No property on file. A property is created with the ' +
                            'customer’s first website request.' })
    ]);
  }

  function jobsCard() {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [el('h2', { text: 'Jobs' })]),
        el('span', { class: 'badge badge--muted', text: String(jobs.length) })
      ]),
      jobs.length
        ? el('div', {}, jobs.map(j => {
            const quotes = Array.isArray(j.ns_quotes) ? j.ns_quotes : [];
            const latest = quotes.slice().sort((a, b) => (b.version || 0) - (a.version || 0))[0];
            return el('div', { class: 'row-item' }, [
              el('div', { class: 'row-item__main' }, [
                el('strong', { text: j.reference || j.title || 'Job' }),
                el('span', { class: 'row-item__meta',
                             text: addressLine(j.properties) || 'No address on file' }),
                el('span', { class: 'row-item__meta', text: `Created ${date(j.created_at)}` })
              ]),
              el('span', { class: 'row-item__badges' }, [
                el('span', { class: 'badge badge--muted', text: humanise(j.status) }),
                latest
                  ? el('span', { class: `badge ${QUOTE_TONE[latest.status] || 'badge--muted'}`,
                                 text: `Quote v${latest.version} ${humanise(latest.status)}` })
                  : null
              ]),
              el('a', { class: 'btn btn--sm', href: `#/jobs/${j.id}`, text: 'Open' })
            ]);
          }))
        : el('div', { class: 'empty', text: 'No jobs for this customer yet.' })
    ]);
  }

  function requestsCard() {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'Request history' }),
          el('p', { text: 'What they asked for on the website, kept as sent.' })
        ]),
        el('a', { class: 'btn btn--sm', href: '#/requests', text: 'All requests' })
      ]),
      requests.length
        ? el('div', {}, requests.map(r => el('div', { class: 'row-item' }, [
            el('div', { class: 'row-item__main' }, [
              el('strong', { text: date(r.submitted_at) }),
              el('span', { class: 'row-item__meta',
                           text: addressLine(r.properties) || 'No address given' }),
              r.customer_message
                ? el('span', { class: 'row-item__meta', text: r.customer_message })
                : null
            ]),
            el('span', { class: 'row-item__badges' }, [
              el('span', { class: 'badge badge--muted', text: humanise(r.status) })
            ])
          ])))
        : el('div', { class: 'empty', text: 'No website requests from this customer.' })
    ]);
  }

  renderDetails();

  clear(mount).append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: customer.name || 'Customer' }),
      el('p', { text: [customer.phone, customer.email].filter(Boolean).join(' · ') ||
                      'No contact details on file' })
    ]),
    el('div', { class: 'btn-row', style: 'margin-bottom:12px' }, [
      el('a', { class: 'btn btn--sm', href: '#/customers', text: '← All customers' })
    ]),
    detailsHost,
    propertiesCard(),
    jobsCard(),
    requestsCard()
  );
}
