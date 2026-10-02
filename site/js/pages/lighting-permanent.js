import { clear, el } from '../../../shared/dom.js';
import { mountChrome } from '../components/chrome.js';
import { createQuoteForm } from '../components/quote-form.js';
import { createLightingDemo } from '../components/lighting-demo.js';
import { createMoodGallery } from '../components/mood-gallery.js';
import { getPublicSettings, listPublicServices } from '../lib/site-api.js';
import { MOOD_GROUPS, DEMO_MODES, PHOTOS } from '../lib/lighting-assets.js';
import { mountReveals } from '../lib/reveal.js';
import { breadcrumbSchema } from '../lib/schema.js';

async function applySettings() {
  const settings = await getPublicSettings();
  const lighting = settings.lighting || {};

  const manufacturer = document.getElementById('manufacturer');
  if (manufacturer && lighting.permanent_manufacturer) {
    manufacturer.textContent = lighting.permanent_manufacturer;
  }

  // Warranty term comes from settings, never hardcoded into the copy.
  const years = Number(lighting.permanent_warranty_years);
  const headline = document.getElementById('warrantyHeadline');
  const body = document.getElementById('warrantyBody');

  if (Number.isFinite(years) && years > 0) {
    if (headline) headline.textContent = `${years}-year manufacturer warranty`;
    if (body) {
      body.textContent =
        `The system we install carries a ${years}-year warranty from ` +
        `${lighting.permanent_manufacturer || 'the manufacturer'}. ` +
        'The exact terms are set out on your written quote.';
    }
  }
}

function renderDemo() {
  const slot = document.getElementById('stageSlot');
  const demo = createLightingDemo({ modes: DEMO_MODES });
  if (slot && demo) slot.replaceWith(demo);
}

/* The channel photograph is a product shot, so it gets a plain frame rather
   than the mode toggle -- there is nothing to toggle. */
function renderDetail() {
  const slot = document.getElementById('detailSlot');
  if (!slot) return;
  const p = PHOTOS.channel_colours;
  slot.replaceWith(el('figure', { class: 'stage' }, [
    el('img', { src: p.src, alt: p.alt, loading: 'lazy', decoding: 'async' }),
    el('figcaption', { class: 'stage-cap', text: p.caption })
  ]));
}

function renderMoods() {
  const host = document.getElementById('moodGallery');
  const gallery = createMoodGallery(MOOD_GROUPS);
  if (host && gallery) clear(host).append(gallery);
}

/* Related services come from the services table, so this page cannot drift
   from the price book or invent a service that does not exist. */
async function renderRelated() {
  const host = document.getElementById('relatedHost');
  if (!host) return;
  const services = await listPublicServices();
  const wanted = ['christmas_lighting', 'gutter_brightening', 'windows'];
  const items = wanted
    .map(k => services.find(s => s.key === k && s.quotable))
    .filter(Boolean);

  if (!items.length) { host.remove(); return; }

  clear(host).append(...items.map(s => el('a', {
    class: 'pair-card', 'data-service': s.key,
    href: s.key === 'christmas_lighting'
      ? 'lighting-christmas.html'
      : `service.html?s=${encodeURIComponent(s.key)}`
  }, [
    el('h3', { text: s.name }),
    el('p', { text: s.blurb || '' }),
    el('span', { class: 'card__more', text: 'What this involves →' })
  ])));
}

async function init() {
  document.documentElement.dataset.service = 'permanent_lighting';
  await mountChrome('permanent');

  renderDemo();
  renderDetail();
  renderMoods();

  await Promise.allSettled([
    applySettings().catch(err => console.error(err)),
    renderRelated().catch(err => console.error(err))
  ]);

  breadcrumbSchema([{ name: 'Nova Shield', path: '/' }, { name: 'Lighting', path: '/lighting.html' }, { name: 'Permanent Outdoor Lighting' }]);

  mountReveals();

  const host = document.getElementById('quoteFormHost');
  try {
    clear(host).append(await createQuoteForm({ preselect: ['permanent_lighting'] }));
  } catch (err) {
    clear(host).append(el('div', { class: 'callout' }, [
      el('h3', { text: 'The form could not load' }),
      el('p', { text: 'Please call or text 437-436-3360.' })
    ]));
    console.error(err);
  }
}

init();
