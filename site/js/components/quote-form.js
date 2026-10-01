import { el, clear } from '../../../shared/dom.js';
import { listPublicServices, submitQuoteRequest, uploadRequestPhoto } from '../lib/site-api.js';
import { mountTurnstile } from '../lib/turnstile.js';

const PROPERTY_TYPES = [
  '', 'Detached house', 'Semi-detached', 'Townhouse', 'Bungalow',
  'Multi-unit / duplex', 'Commercial', 'Other'
];

const CONTACT_METHODS = [
  { value: '',       label: 'No preference' },
  { value: 'phone',  label: 'Phone call' },
  { value: 'text',   label: 'Text message' },
  { value: 'email',  label: 'Email' },
  { value: 'either', label: 'Either is fine' }
];

const TIMING = [
  '', 'As soon as possible', 'Within the next month', 'Weekday mornings',
  'Weekday afternoons', 'Weekends', 'Just planning ahead'
];

const CATEGORY_LABELS = { lighting: 'Lighting', cleaning: 'Exterior cleaning' };

function labelled(text, control, extraClass = '') {
  return el('label', { class: `field ${extraClass}` }, [el('span', { text }), control]);
}

function selectFrom(values, attrs = {}) {
  const node = el('select', attrs);
  for (const v of values) {
    const isObj = typeof v === 'object';
    node.append(el('option', {
      value: isObj ? v.value : v,
      text: isObj ? v.label : (v || 'Please choose…')
    }));
  }
  return node;
}

/**
 * The quote form. Used on every page.
 * @param {string[]} preselect service keys to tick on load
 */
export async function createQuoteForm({ preselect = [] } = {}) {
  const services = await listPublicServices();
  const quotable = services.filter(s => s.quotable);

  const byCategory = new Map();
  for (const s of quotable) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category).push(s);
  }

  const root = el('div', {});
  const errorEl = el('p', { class: 'form-error', hidden: true });

  /* ------------------------------------------------------------- fields -- */
  const nameInput   = el('input', { required: true, autocomplete: 'name', maxlength: '120' });
  const phoneInput  = el('input', { type: 'tel', autocomplete: 'tel' });
  const emailInput  = el('input', { type: 'email', autocomplete: 'email' });
  const contactSel  = selectFrom(CONTACT_METHODS);
  const addressInput= el('input', { required: true, autocomplete: 'street-address',
                                    placeholder: 'Street address' });
  const cityInput   = el('input', { autocomplete: 'address-level2', value: 'Sault Ste. Marie' });
  const postalInput = el('input', { autocomplete: 'postal-code', placeholder: 'P6A 1A1',
                                    maxlength: '7', style: 'text-transform:uppercase' });
  const typeSel     = selectFrom(PROPERTY_TYPES);
  const timingSel   = selectFrom(TIMING);
  const dateInput   = el('input', { type: 'date', min: new Date().toISOString().slice(0, 10) });
  const messageArea = el('textarea', { rows: '4', maxlength: '4000',
    placeholder: 'Anything that helps us understand the property — access, problem areas, what you have already tried.' });
  const otherInput  = el('input', { maxlength: '200', placeholder: 'Something else? Tell us what.' });
  const honeypot    = el('input', { tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const turnstileHost = el('div');

  const photoInput = el('input', { type: 'file', accept: 'image/*', multiple: true });
  const photoList = el('div', { class: 'photo-list' });
  let chosenPhotos = [];

  photoInput.addEventListener('change', () => {
    chosenPhotos = Array.from(photoInput.files).slice(0, 10);
    clear(photoList);
    for (const f of chosenPhotos) {
      photoList.append(el('span', { class: 'photo-chip',
        text: `${f.name} · ${(f.size / 1024 / 1024).toFixed(1)}MB` }));
    }
  });

  /* ---------------------------------------------------- service checkboxes */
  const checkboxes = [];
  const serviceGroups = [...byCategory.entries()].map(([category, list]) =>
    el('div', { class: 'svc-group' }, [
      el('div', { class: 'svc-group__title', text: CATEGORY_LABELS[category] || category }),
      el('div', { class: 'svc-boxes' }, list.map(s => {
        const box = el('input', { type: 'checkbox', value: s.key,
                                  checked: preselect.includes(s.key) });
        checkboxes.push(box);
        return el('label', { class: 'svc-box' }, [
          box, el('div', {}, [el('strong', { text: s.name })])
        ]);
      }))
    ]));

  const walkaroundBox = el('input', { type: 'checkbox', value: '__walkaround' });

  /* ------------------------------------------------------------- submit -- */
  const submitBtn = el('button', { class: 'button button--gold', type: 'submit',
                                   style: 'width:100%', text: 'Request My Quote' });

  const form = el('form', { class: 'quote-form', novalidate: true }, [
    labelled('Full name *', nameInput),
    labelled('Phone', phoneInput),
    labelled('Email', emailInput, 'field--full'),
    labelled('Preferred contact method', contactSel, 'field--full'),

    labelled('Property address *', addressInput, 'field--full'),
    labelled('City', cityInput),
    labelled('Postal code', postalInput),
    labelled('Property type', typeSel, 'field--full'),

    el('div', { class: 'field field--full', style: 'margin-top:6px' }, [
      el('span', { text: 'What would you like done?' }),
      el('div', { class: 'svc-group', style: 'margin-top:8px' }, [
        el('div', { class: 'svc-group__title', style: 'color:var(--teal-2)',
                    text: 'Not sure yet?' }),
        el('label', { class: 'svc-box',
                      style: 'border-color:rgba(139,233,219,.4);background:rgba(43,182,168,.08)' }, [
          walkaroundBox,
          el('div', {}, [
            el('strong', { text: 'Book a property walk-around' }),
            el('span', { text: 'We come by, look at the property with you and work out a plan together.' })
          ])
        ])
      ]),
      ...serviceGroups
    ]),

    labelled('Anything else', otherInput, 'field--full'),
    labelled('Tell us about the property', messageArea, 'field--full'),

    labelled('Ideal timing', timingSel),
    labelled('Earliest date that suits you', dateInput),

    el('div', { class: 'field field--full' }, [
      el('span', { text: 'Photos (optional, up to 10)' }),
      photoInput,
      photoList,
      el('p', { class: 'form-note', style: 'grid-column:auto',
                text: 'A couple of wide shots of the property help us quote accurately before we visit.' })
    ]),

    // off-screen rather than hidden — some bots skip display:none fields
    el('div', { class: 'hp', 'aria-hidden': 'true' }, [
      el('label', {}, ['Leave this field empty', honeypot])
    ]),

    errorEl,
    el('div', { class: 'field field--full', style: 'display:flex;justify-content:center' }, [turnstileHost]),
    el('div', { class: 'field field--full' }, [
      submitBtn,
      el('p', { class: 'form-note', style: 'grid-column:auto;text-align:center;margin-top:8px',
        text: 'No payment, no obligation. We confirm pricing after seeing the property.' })
    ])
  ]);

  /* ------------------------------------------------------------ handling -- */
  function fail(message, focusEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusEl?.focus();
    return false;
  }

  function collectTiming() {
    const parts = [];
    if (timingSel.value) parts.push(timingSel.value);
    if (dateInput.value) parts.push(`from ${dateInput.value}`);
    return parts.join(', ') || null;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errorEl.hidden = true;

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    const address = addressInput.value.trim();

    if (name.length < 2) return fail('Please tell us your name.', nameInput);
    if (!email && !phone) return fail('We need either a phone number or an email address to reply to.', phoneInput);
    if (address.length < 4) return fail('Please enter the property address.', addressInput);

    const serviceKeys = checkboxes.filter(c => c.checked).map(c => c.value);
    if (!serviceKeys.length && !walkaroundBox.checked && !otherInput.value.trim()) {
      return fail('Pick at least one service, or ask for a walk-around if you are not sure yet.');
    }

    const otherBits = [];
    if (walkaroundBox.checked) otherBits.push('Property walk-around requested');
    if (otherInput.value.trim()) otherBits.push(otherInput.value.trim());

    const turnstile = await turnstileReady;
    if (!turnstile.ok) {
      return fail('The verification check could not load — please refresh the page, ' +
                  'or call or text 437-436-3360 and we will take the details directly.');
    }
    const turnstileToken = turnstile.getToken();
    if (!turnstileToken) {
      return fail('Please complete the verification check just above the button.');
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    let requestId;
    try {
      requestId = await submitQuoteRequest({
        turnstileToken,
        name, email, phone,
        preferredContact: contactSel.value || null,
        address,
        city: cityInput.value.trim(),
        postalCode: postalInput.value.trim().toUpperCase(),
        propertyType: typeSel.value,
        serviceKeys,
        otherService: otherBits.join(' — ') || null,
        message: messageArea.value.trim(),
        preferredSchedule: collectTiming(),
        honeypot: honeypot.value
      });
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request My Quote';
      turnstile.reset();  // tokens are single-use; a retry needs a fresh one
      return fail(err.message || 'Something went wrong. Please call or text 437-436-3360.');
    }

    // photos are best-effort: a failed upload must not lose the request
    let uploaded = 0;
    if (chosenPhotos.length) {
      submitBtn.textContent = 'Uploading photos…';
      for (const file of chosenPhotos) {
        if (await uploadRequestPhoto(requestId, file)) uploaded += 1;
      }
    }

    showSuccess(uploaded, chosenPhotos.length);
  });

  function showSuccess(uploaded, attempted) {
    const photoNote = attempted === 0 ? null
      : uploaded === attempted
        ? `${uploaded} photo${uploaded === 1 ? '' : 's'} received.`
        : `${uploaded} of ${attempted} photos uploaded — you can send the rest by email if you like.`;

    clear(root).append(
      el('div', { class: 'success-box' }, [
        el('h3', { text: 'Request received' }),
        el('p', { style: 'margin:0', text:
          'Thanks — this is with Nova Shield now. We review every request, arrange a visit if the ' +
          'job needs measuring properly, and send you a clear written quote before anything is booked.' }),
        photoNote ? el('p', { class: 'form-note', style: 'margin:10px 0 0', text: photoNote }) : null,
        el('p', { class: 'form-note', style: 'margin:10px 0 0',
          text: 'In a hurry? Call or text 437-436-3360.' })
      ])
    );
    root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  root.append(form);
  // started, not awaited: the widget can only render once the caller has put
  // this node in the document, which happens after we return.
  const turnstileReady = mountTurnstile(turnstileHost, { action: 'quote_request' });
  return root;
}
