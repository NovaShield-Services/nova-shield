import { el, clear } from '../../../shared/dom.js';
import { mountChrome } from '../components/chrome.js';
import { createQuoteForm } from '../components/quote-form.js';
import { getService, listPublicServices } from '../lib/site-api.js';
import { mountReveals } from '../lib/reveal.js';
import { serviceSchema, breadcrumbSchema, setServiceMeta } from '../lib/schema.js';
import { getPublicSettings } from '../lib/site-api.js';

/* One template, but the content per service is genuinely different and lives
   in services.detail — so the page and the admin price book are the same list,
   and adding a service does not mean writing a new HTML file. */

const main = document.getElementById('main');

function notFound(services) {
  clear(main).append(
    el('section', { style: 'padding-top:160px' }, [
      el('div', { class: 'container' }, [
        el('div', { class: 'chip', text: 'Exterior cleaning' }),
        el('h1', { text: 'Pick a service' }),
        el('p', { class: 'prose', style: 'margin:20px 0 34px',
                  text: 'That page does not exist. Here is everything we do.' }),
        el('div', { class: 'cards' }, services
          .filter(s => ['cleaning', 'winter'].includes(s.category) && s.quotable)
          .map(s => el('a', { class: 'card', href: `service.html?s=${encodeURIComponent(s.key)}` }, [
            el('h3', { text: s.name }),
            el('p', { text: s.blurb || '' }),
            el('span', { class: 'card__more', text: 'What this involves →' })
          ])))
      ])
    ])
  );
}

function sectionEl(children, attrs = {}) {
  return el('section', attrs, [el('div', { class: 'container' }, children)]);
}

const CATEGORY = {
  cleaning: { label: 'Exterior care', href: 'care.html' },
  winter:   { label: 'Winter services', href: 'winter.html' }
};

function renderService(service, allServices) {
  const d = service.detail || {};
  document.title = `${service.name} | Nova Shield`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && d.intro) metaDesc.setAttribute('content', d.intro.slice(0, 160));

  // presentation accent per service -- the CSS carries the hue, the database
  // still carries the service itself
  document.documentElement.dataset.service = service.key;

  // Every file currently in assets/gallery/ is a LIGHTING photograph, so using
  // one behind a cleaning headline would misrepresent the service. Until a real
  // matching asset exists the hero renders atmospherically. The missing assets
  // are tracked in ASSET_SPEC.md -- deliberately NOT surfaced to the customer,
  // who should never read a development note on a marketing page.
  // A file outside assets/gallery/ is treated as a real, verified asset.
  const generic = !d.hero || /^photo-\d+\.jpg$/.test(d.hero);
  const heroBg = generic
    ? el('div', { class: 'hero-bg hero-bg--atmos' })
    : el('div', { class: 'hero-bg', style: `background-image:url('assets/${d.hero}')` });

  const hero = el('section', { class: 'hero hero--page' }, [
    heroBg,
    el('div', { class: 'container hero-content' }, [
      el('nav', { class: 'where', 'aria-label': 'Breadcrumb' }, [
        el('a', { href: 'index.html', text: 'Nova Shield' }),
        el('i'),
        el('a', { href: CATEGORY[service.category].href,
                  text: CATEGORY[service.category].label }),
        el('i'),
        el('b', { text: service.name })
      ]),
      el('h1', { text: d.headline || service.name }),
      d.intro ? el('p', { class: 'lede', text: d.intro }) : null,
      el('div', { class: 'hero-actions' }, [
        el('a', { class: 'button button--gold', href: '#quote', text: 'Request a Quote' }),
        el('a', { class: 'button button--ghost',
                  href: CATEGORY[service.category].href,
                  text: `All ${CATEGORY[service.category].label.toLowerCase()}` })
      ])
    ])
  ]);

  const blocks = [];

  // "why this method" only exists where the method is genuinely contested
  if (d.why) {
    blocks.push(sectionEl([
      el('div', { class: 'split' }, [
        el('div', {}, [
          el('div', { class: 'chip', text: 'The method' }),
          el('h2', { text: d.why.title }),
          el('p', { class: 'prose', style: 'margin-top:20px', text: d.why.body })
        ]),
        el('div', { class: 'callout callout--gold' }, [
          el('h3', { text: "What's included" }),
          el('ul', { class: 'factlist', style: 'margin-top:12px' },
            (d.included || []).map(item =>
              el('li', {}, [el('span', { class: 'dot' }), el('div', {}, [el('strong', { text: item })])])))
        ])
      ])
    ]));
  } else if (d.included?.length) {
    blocks.push(sectionEl([
      el('div', { class: 'split split--offset' }, [
        el('div', {}, [el('div', { class: 'chip', text: "What's included" }),
                       el('h2', { text: 'What you are paying for.' })]),
        el('ul', { class: 'spec', style: 'margin-top:0' }, d.included.map((item, i) =>
          el('li', {}, [el('span', { text: String(i + 1).padStart(2, '0') }),
                        el('div', { text: item })])))
      ])
    ]));
  }

  if (d.scope_note) {
    blocks.push(sectionEl([
      el('div', { class: 'callout callout--gold' }, [
        el('h3', { text: 'To be clear about scope' }),
        el('p', { text: d.scope_note })
      ])
    ], { style: 'padding-top:0' }));
  }

  if (d.optional?.length) {
    blocks.push(sectionEl([
      el('div', { class: 'section-head' }, [
        el('div', {}, [el('div', { class: 'chip', text: 'Optional extras' }),
                       el('h2', { text: 'Only if you want them.' })]),
        el('p', { text: 'Quoted separately so you are not paying for work you did not ask for.' })
      ]),
      el('ul', { class: 'taglist' }, d.optional.map(o => el('li', { text: o })))
    ], { style: 'padding-top:0' }));
  }

  if (d.expect?.length) {
    blocks.push(sectionEl([
      el('div', { class: 'section-head' }, [
        el('div', {}, [el('div', { class: 'chip', text: 'What to expect' }),
                       el('h2', { text: 'Before you book.' })])
      ]),
      el('div', { class: 'expect' }, d.expect.map(x =>
        el('div', { class: 'expect-item' }, [
          el('h3', { text: x.title }), el('p', { text: x.body })
        ])))
    ], { class: 'band-soft' }));
  }

  if (d.good_to_know?.length) {
    blocks.push(sectionEl([
      el('div', { class: 'split split--offset' }, [
        el('div', {}, [el('div', { class: 'chip', text: 'Good to know' }),
                       el('h2', { text: 'Before we arrive.' })]),
        el('ul', { class: 'feature-list', style: 'margin-top:0' }, d.good_to_know.map(g =>
          el('li', {}, [el('span', { class: 'fdot' }), el('div', { text: g })])))
      ])
    ], { style: 'padding-top:0' }));
  }

  const pairs = (d.pairs_with || [])
    .map(key => allServices.find(s => s.key === key))
    .filter(s => s && s.quotable);

  if (pairs.length) {
    blocks.push(sectionEl([
      el('div', { class: 'section-head' }, [
        el('div', {}, [el('div', { class: 'chip', text: 'Often booked together' }),
                       el('h2', { text: 'While we are there.' })]),
        el('p', { text: 'One visit is cheaper than two, and the setup time is already spent.' })
      ]),
      el('div', { class: 'pairs' }, pairs.map(s => {
        const img = (s.detail || {}).hero;
        const realImg = img && !/^photo-\d+\.jpg$/.test(img);
        const card = el('a', { class: 'pair-card', 'data-service': s.key,
                               href: `service.html?s=${encodeURIComponent(s.key)}` }, [
          el('h3', { text: s.name }),
          el('p', { text: s.blurb || '' }),
          el('span', { class: 'card__more', text: 'What this involves →' })
        ]);
        // Resolve against the document: a relative URL inside a CSS custom
        // property is resolved against the STYLESHEET that consumes it, which
        // put these at /css/assets/... and 404'd.
        if (realImg) {
          const abs = new URL(`assets/${img}`, document.baseURI).href;
          card.style.setProperty('--pair-img', `url('${abs}')`);
        }
        return card;
      }))
    ]));
  }

  const quoteSection = el('section', { class: 'quote', id: 'quote' }, [
    el('div', { class: 'container quote-wrap' }, [
      el('div', {}, [
        el('div', { class: 'chip', text: service.name }),
        el('h2', { text: 'Request a quote.' }),
        el('p', { class: 'prose', style: 'margin-top:18px', text:
          'We have pre-selected this service for you — tick anything else you want looking at ' +
          'while we are on site.' }),
        el('div', { class: 'good-to-know' }, [
          el('span', { class: 'gtk-title', text: 'Booking a service at your home' }),
          el('ul', {}, [
            el('li', {}, [el('strong', { text: "You don't need to be home for a quote. " }),
                          'Most measuring is done from the outside.']),
            el('li', {}, [el('strong', { text: 'Pricing is confirmed on site. ' }),
                          'We measure the actual work before giving a firm number.']),
            el('li', {}, [el('strong', { text: 'Same two people, start to finish. ' }),
                          'Whoever quotes it is who does it.'])
          ])
        ])
      ]),
      el('div', { id: 'quoteFormHost' }, [el('p', { class: 'form-note', text: 'Loading form…' })])
    ])
  ]);

  clear(main).append(hero, ...blocks, quoteSection);
}

async function init() {

  const key = new URLSearchParams(window.location.search).get('s');
  const services = await listPublicServices();
  const service = key ? await getService(key) : null;

  const TEMPLATED = ['cleaning', 'winter'];
  if (!service || !TEMPLATED.includes(service.category)) {
    await mountChrome(null);
    notFound(services);
    return;
  }

  await mountChrome(service.category);

  // per-service canonical, social tags and structured data; the static shell is
  // noindex until a real service is resolved
  setServiceMeta(service);
  const settings = await getPublicSettings().catch(() => ({}));
  serviceSchema(service, settings.company || {});
  breadcrumbSchema([
    { name: 'Nova Shield', path: '/' },
    { name: CATEGORY[service.category].label, path: '/' + CATEGORY[service.category].href },
    { name: service.name }
  ]);

  renderService(service, services);
  mountReveals();

  const host = document.getElementById('quoteFormHost');
  try {
    clear(host).append(await createQuoteForm({ preselect: [service.key] }));
  } catch (err) {
    clear(host).append(el('div', { class: 'callout' }, [
      el('h3', { text: 'The form could not load' }),
      el('p', { text: 'Please call or text 437-436-3360.' })
    ]));
    console.error(err);
  }
}

init();
