import { el, clear } from '../../../shared/dom.js';
import { mountChrome } from '../components/chrome.js';
import { createQuoteForm } from '../components/quote-form.js';
import { listPublicServices, getPublicSettings } from '../lib/site-api.js';
import { mountReveals } from '../lib/reveal.js';
import { createLightingDemo } from '../components/lighting-demo.js';
import { createMoodGallery } from '../components/mood-gallery.js';
import { MOOD_GROUPS, DEMO_MODES } from '../lib/lighting-assets.js';

/* The capability matrix replaces the nine identical cards. Grouping is derived
   from the services table -- it is not a second catalogue. Only the group
   headings and their order live here, because that is presentation. */
const GROUPS = [
  { id: 'light',  label: '01 / Light',  hub: 'lighting.html',
    test: s => s.category === 'lighting' },
  { id: 'care',   label: '02 / Care',   hub: 'care.html',
    test: s => s.category === 'cleaning' },
  { id: 'winter', label: '03 / Winter', hub: 'winter.html',
    test: s => s.category === 'winter' }
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
      el('a', { class: 'matrix-label', href: g.hub, text: g.label }),
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

function renderMoods() {
  const host = document.getElementById('moodGallery');
  const gallery = createMoodGallery(MOOD_GROUPS);
  if (host && gallery) clear(host).append(gallery);
}

function renderStage() {
  const host = document.querySelector('.split--media');
  const slot = document.getElementById('stageSlot');
  const demo = createLightingDemo({ modes: DEMO_MODES });
  if (slot && demo) slot.replaceWith(demo);
  else if (host && demo) host.prepend(demo);
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
  renderStage();

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
