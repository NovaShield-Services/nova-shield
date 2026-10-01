import { el, clear } from '../../../shared/dom.js';
import { mountChrome } from '../components/chrome.js';
import { createQuoteForm } from '../components/quote-form.js';
import { listPublicServices, getPublicSettings } from '../lib/site-api.js';
import { mountReveals } from '../lib/reveal.js';

/* The capability matrix replaces the nine identical cards. Grouping is derived
   from the services table -- it is not a second catalogue. Only the group
   headings and their order live here, because that is presentation. */
const GROUPS = [
  { id: 'light',  label: '01 / Light',  test: s => s.category === 'lighting' },
  { id: 'care',   label: '02 / Care',   test: s => s.category === 'cleaning' },
];

async function renderMatrix() {
  const host = document.getElementById('servicesGrid');
  if (!host) return;
  const services = (await listPublicServices()).filter(s => s.quotable);

  if (!services.length) {
    clear(host).append(el('p', { class: 'form-note',
      text: 'Service list is being updated — please call or text 437-436-3360.' }));
    return;
  }

  const groups = GROUPS
    .map(g => ({ ...g, items: services.filter(g.test) }))
    .filter(g => g.items.length);

  clear(host).append(...groups.map(g =>
    el('div', { class: 'matrix-group' }, [
      el('div', { class: 'matrix-label', text: g.label }),
      el('div', { class: 'matrix-items' }, g.items.map(s =>
        el('a', { class: 'mitem', 'data-service': s.key,
                  href: s.category === 'lighting'
                    ? (s.key === 'christmas_lighting' ? 'lighting-christmas.html' : 'lighting-permanent.html')
                    : `service.html?s=${encodeURIComponent(s.key)}` }, [
          el('span', { class: 'mitem-name', text: s.name }),
          el('span', { class: 'mitem-blurb', text: s.blurb || '' })
        ])))
    ])));
}

/* The mood gallery: the strongest idea in Version 4. Grouped by how the system
   is used rather than by service, because that is how the product is actually
   experienced. Images are the real job photos; captions stay neutral until
   provenance is confirmed (see ASSET_COMPARISON.md). */
const MOODS = [
  { title: 'Warm white', note: 'The everyday setting — subtle, architectural, designed around your roofline.',
    shots: [
      ['photo-08.jpg', 'Bungalow roofline at blue hour'],
      ['photo-02.jpg', 'Single-storey roofline at dusk'],
      ['photo-09.jpg', 'Two-storey roofline, blue hour']
    ] },
  { title: 'Colour scenes', note: 'For holidays, birthdays and the evenings that are not ordinary.',
    shots: [
      ['photo-05.jpg', 'Teal scene, winter evening'],
      ['photo-06.jpg', 'Single-colour scene across the front'],
      ['photo-07.jpg', 'Multi-colour scene along the roofline']
    ] },
  { title: 'Soffit & detail', note: 'Low-profile channel, colour-matched so the hardware is not the feature.',
    shots: [
      ['photo-01.jpg', 'Channel colour options with LED modules']
    ] }
];

function renderMoods() {
  const host = document.getElementById('moodGallery');
  if (!host) return;
  clear(host).append(...MOODS.map(m =>
    el('div', { class: 'mood' }, [
      el('div', { class: 'mood-head' }, [
        el('h3', { text: m.title }),
        el('p', { text: m.note })
      ]),
      el('div', { class: 'mood-shots' }, m.shots.map(([file, caption]) =>
        el('figure', { class: 'shot' }, [
          el('img', { src: `assets/gallery/${file}`, alt: caption,
                      loading: 'lazy', decoding: 'async' }),
          el('figcaption', { text: caption })
        ])))
    ])));
}

/* The one signature interaction: it demonstrates the product rather than
   decorating the page. An "off" state needs a real daylight photograph of the
   same house (ASSET_SPEC LIGHT-04) -- faking it with a dimmed night shot would
   be dishonest, so there are two states until that exists. */
const MODES = {
  warm:   { src: 'assets/gallery/photo-03.jpg', cap: 'Warm white — the everyday setting',
            alt: 'Home with warm white permanent lighting along the roofline at night' },
  colour: { src: 'assets/gallery/photo-07.jpg', cap: 'Colour scene — set from the app',
            alt: 'Home with multi-colour permanent lighting along the roofline at night' }
};

function wireStage() {
  const img = document.getElementById('stageImg');
  const cap = document.getElementById('stageCap');
  const buttons = [...document.querySelectorAll('.mode')];
  if (!img || !buttons.length) return;

  buttons.forEach(btn => btn.addEventListener('click', () => {
    const mode = MODES[btn.dataset.mode];
    if (!mode || btn.classList.contains('is-on')) return;

    buttons.forEach(b => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });

    img.classList.add('is-swapping');
    const next = new Image();
    next.onload = () => {
      img.src = mode.src; img.alt = mode.alt;
      if (cap) cap.textContent = mode.cap;
      requestAnimationFrame(() => img.classList.remove('is-swapping'));
    };
    next.onerror = () => img.classList.remove('is-swapping');
    next.src = mode.src;
  }));
}

async function renderContact() {
  const settings = await getPublicSettings();
  const company = settings.company || {};

  const badge = document.getElementById('areaBadge');
  if (badge && company.service_area) badge.textContent = company.service_area;

  const host = document.getElementById('contactBlock');
  if (!host) return;
  clear(host).append(
    el('strong', { text: 'Call or text: ' }),
    el('a', { href: `tel:${(company.phone || '').replace(/[^0-9+]/g, '')}`,
              text: company.phone || '' }),
    el('br'),
    el('strong', { text: 'Email: ' }),
    el('a', { href: `mailto:${company.email || ''}`, text: company.email || '' })
  );
}

async function init() {
  await mountChrome(null);

  renderMoods();
  wireStage();

  // independent so one slow or failed section cannot blank the page
  await Promise.allSettled([renderMatrix(), renderContact()]);

  mountReveals();

  const formHost = document.getElementById('quoteFormHost');
  try {
    clear(formHost).append(await createQuoteForm());
  } catch (err) {
    clear(formHost).append(el('div', { class: 'callout' }, [
      el('h3', { text: 'The form could not load' }),
      el('p', { text: 'Please call or text 437-436-3360 and we will take the details that way.' })
    ]));
    console.error(err);
  }
}

init();
