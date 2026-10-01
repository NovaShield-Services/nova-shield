import { el, clear } from '../../../shared/dom.js';
import { mountChrome } from '../components/chrome.js';
import { listPublicServices, getPublicSettings } from '../lib/site-api.js';
import { mountReveals } from '../lib/reveal.js';
import { createMoodGallery } from '../components/mood-gallery.js';
import { MOOD_GROUPS } from '../lib/lighting-assets.js';

/* One hub template for all three categories. The services themselves come from
   the services table; only the framing copy lives here, because that is
   editorial rather than catalogue data. */
const CATEGORIES = {
  lighting: {
    nav: 'lighting',
    eyebrow: 'Nova — the light',
    title: 'Light changes how\na home feels.',
    lede: 'Architectural lighting that makes a property glow after dark, and a seasonal display '
        + 'that arrives and leaves without you touching a ladder.',
    listTitle: 'Two ways to light\na house.',
    listNote: 'One is permanent and works every night of the year. The other is the season, handled '
            + 'for you. Plenty of people end up with both.',
    gallery: true,
    // lighting services have their own dedicated pages
    href: s => s.key === 'christmas_lighting' ? 'lighting-christmas.html' : 'lighting-permanent.html'
  },
  cleaning: {
    nav: 'cleaning',
    eyebrow: 'Shield — the protection',
    title: 'Care for the details\naround your home.',
    lede: 'Not a giant menu of unrelated jobs. A focused set of services built around appearance, '
        + 'comfort and seasonal readiness — each priced on what it actually involves.',
    listTitle: 'Every surface wants\nsomething different.',
    listNote: 'Soft washing, pressure washing and hand work are not interchangeable. Picking the '
            + 'wrong one is how siding gets water behind it and how a roof loses granules.',
    href: s => `service.html?s=${encodeURIComponent(s.key)}`
  },
  winter: {
    nav: 'winter',
    eyebrow: 'Shield — through the winter',
    title: 'The part of winter\nequipment cannot reach.',
    lede: 'The plow takes the driveway. Everything else — the steps, the side walkway, the deck, '
        + 'the path to the door — is hand work, and it is the part that decides whether your '
        + 'property is safe to walk on.',
    listTitle: 'Two winter jobs,\nbooked before the snow.',
    listNote: 'Both are arranged in the autumn. De-icing cable has to go on a dry roof, and a '
            + 'clearing route has to be agreed before the first snowfall to be any use.',
    href: s => `service.html?s=${encodeURIComponent(s.key)}`
  }
};

/* Each hub carries one substantial editorial block of its own. Without it a
   hub is just a menu, and the thing a customer most needs before choosing is
   usually an explanation rather than a list. */
const EXTRA = {
  lighting: {
    chip: 'Choosing between them',
    title: 'Permanent or seasonal?',
    note: 'They are not competing products. One is a fixture, the other is a service you book each year.',
    rows: [
      ['Permanent outdoor lighting',
       'Fitted once into the soffit and yours every night after that — warm white most evenings, any colour when you want one. Costs more up front and nothing after.',
       'lighting-permanent.html'],
      ['Seasonal Christmas lighting',
       'We design it, install it in the fall, remove it after the season and store it under your name. Nothing to buy, nothing to store, cheaper every year after the first.',
       'lighting-christmas.html']
    ]
  },
  cleaning: {
    chip: 'Before you pick a service',
    title: 'Pressure is not\nthe default.',
    note: 'Most exterior damage we are called to look at was caused by cleaning, not by dirt.',
    prose: [
      'Soft washing uses low pressure and a cleaning solution that breaks down algae, mildew and road film, then rinses. It is the right answer for siding, roofs and anything with a seam water can get behind.',
      'Pressure washing uses the force of the water itself. It belongs on hard, non-porous surfaces built to take it — driveways, walkways, patios and steps.',
      'Using the second where the first belongs is how water ends up behind siding, how a roof loses granules, and how joint sand gets blown out of interlock. Every service below says which method it uses and why.'
    ]
  },
  winter: {
    chip: 'When to book',
    title: 'Both winter jobs\nare autumn jobs.',
    note: 'Neither can be arranged well once the weather has already turned.',
    rows: [
      ['De-icing cable — before the freeze',
       'Cable is fitted to a dry, accessible roof. Once there is ice on the overhang it is too late to install for that season.',
       'service.html?s=winter_deicing_cables'],
      ['Clearing — before the first snowfall',
       'A route and a scope agreed in October is a service. The same conversation in January is a scramble, and we may already be full.',
       'service.html?s=winter_property_care']
    ]
  }
};

function paragraphs(text) {
  return text.split('\n').map((line, i) => i === 0 ? line : [el('br'), line]).flat();
}

function extraBlock(key) {
  const x = EXTRA[key];
  if (!x) return null;

  const body = x.prose
    ? el('div', {}, x.prose.map(t => el('p', { class: 'prose', style: 'margin-bottom:14px', text: t })))
    : el('div', { class: 'compare' }, x.rows.map(([title, text, href]) =>
        el('a', { class: 'compare-row', href }, [
          el('span', { class: 'compare-title', text: title }),
          el('span', { class: 'compare-text', text }),
          el('span', { class: 'compare-go', text: '→' })
        ])));

  return el('section', {}, [
    el('div', { class: 'container split split--offset' }, [
      el('div', {}, [
        el('div', { class: 'chip', text: x.chip }),
        el('h2', {}, paragraphs(x.title)),
        x.note ? el('p', { class: 'prose', style: 'margin-top:16px', text: x.note }) : null
      ]),
      body
    ])
  ]);
}

async function init() {
  const key = document.body.dataset.category;
  const cfg = CATEGORIES[key];
  if (!cfg) return;

  document.documentElement.dataset.category = key;
  await mountChrome(cfg.nav);

  const services = (await listPublicServices())
    .filter(s => s.category === key && s.quotable);

  const main = document.getElementById('main');

  const hero = el('section', { class: `hero hero--page hero--cat hero--cat-${key}` }, [
    el('div', { class: 'hero-bg hero-bg--atmos' }),
    el('div', { class: 'container hero-content' }, [
      el('nav', { class: 'where', 'aria-label': 'Breadcrumb' }, [
        el('a', { href: 'index.html', text: 'Nova Shield' }),
        el('i'),
        el('b', { text: document.title.split('|')[0].trim() })
      ]),
      el('div', { class: 'chip', text: cfg.eyebrow }),
      el('h1', {}, paragraphs(cfg.title)),
      el('p', { class: 'lede', text: cfg.lede }),
      el('div', { class: 'hero-actions' }, [
        el('a', { class: 'button button--gold', href: '#quote', text: 'Request a Quote' }),
        el('a', { class: 'button button--ghost', href: '#services', text: 'See the services' })
      ])
    ])
  ]);

  const list = el('section', { class: 'band-soft', id: 'services' }, [
    el('div', { class: 'container' }, [
      el('div', { class: 'section-head' }, [
        el('div', {}, [
          el('div', { class: 'chip', text: 'What this covers' }),
          el('h2', {}, paragraphs(cfg.listTitle))
        ]),
        el('p', { text: cfg.listNote })
      ]),
      services.length
        ? el('div', { class: 'svc-index' }, services.map((s, i) =>
            el('a', { class: 'svc-row', 'data-service': s.key, href: cfg.href(s) }, [
              el('span', { class: 'svc-n', text: String(i + 1).padStart(2, '0') }),
              el('span', { class: 'svc-body' }, [
                el('span', { class: 'svc-name', text: s.name }),
                el('span', { class: 'svc-blurb', text: s.blurb || '' })
              ]),
              el('span', { class: 'svc-go', text: '→' })
            ])))
        : el('p', { class: 'form-note', text: 'Service list is being updated — please call or text 437-436-3360.' })
    ])
  ]);

  main.append(hero, extraBlock(key), list);

  if (cfg.gallery) {
    const gallery = createMoodGallery(MOOD_GROUPS);
    if (gallery) {
      main.append(el('section', {}, [
        el('div', { class: 'container' }, [
          el('div', { class: 'section-head' }, [
            el('div', {}, [
              el('div', { class: 'chip', text: 'What it can look like' }),
              el('h2', {}, paragraphs('One system.\nEvery mood.'))
            ]),
            el('p', { text: 'The same installation, photographed on different nights.' })
          ]),
          gallery
        ])
      ]));
    }
  }

  // the quote section is appended by the page shell; fill it
  const settings = await getPublicSettings().catch(() => ({}));
  const company = settings.company || {};
  const contact = document.getElementById('contactBlock');
  if (contact && company.phone) {
    clear(contact).append(
      el('strong', { text: 'Call or text: ' }),
      el('a', { href: `tel:${company.phone.replace(/[^0-9+]/g, '')}`, text: company.phone })
    );
  }

  mountReveals();
}

init();
