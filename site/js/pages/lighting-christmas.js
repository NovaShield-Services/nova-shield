import { clear, el } from '../../../shared/dom.js';
import { mountChrome } from '../components/chrome.js';
import { createQuoteForm } from '../components/quote-form.js';
import { getPublicSettings, listPublicServices } from '../lib/site-api.js';
import { PHOTOS } from '../lib/lighting-assets.js';
import { mountReveals } from '../lib/reveal.js';
import { faqSchema, breadcrumbSchema } from '../lib/schema.js';
import { urlForKey } from '../lib/routes.js';

async function applySettings() {
  const settings = await getPublicSettings();
  const lighting = settings.lighting || {};

  // Install/removal windows are settings, so shifting the season is an admin
  // edit rather than a copy change across several pages.
  if (lighting.christmas_install_window) {
    const main = document.getElementById('installWindow');
    if (main) main.textContent = lighting.christmas_install_window;
    // mid-sentence the range reads better as "October and November"; month
    // names stay capitalised because they are proper nouns
    const inline = lighting.christmas_install_window.replace(/\s*[–-]\s*/, ' and ');
    for (const node of document.querySelectorAll('.js-install-window')) node.textContent = inline;
  }
  if (lighting.christmas_removal_window) {
    const r = document.getElementById('removalWindow');
    if (r) r.textContent = lighting.christmas_removal_window;
  }
}

/* The only honestly seasonal photograph in the library is the warm-white
   install with a wreath on the door. The colour scenes are permanent-lighting
   shots and are NOT reused here just because they are festive-looking.
   Real seasonal imagery is specified as XMAS-01/02/03 in ASSET_SPEC.md. */
function renderSeasonImage() {
  const slot = document.getElementById('seasonSlot');
  if (!slot) return;
  const p = PHOTOS.warm_wreath;
  slot.replaceWith(el('figure', { class: 'stage' }, [
    el('img', { src: p.src, alt: p.alt, loading: 'lazy', decoding: 'async' }),
    el('figcaption', { class: 'stage-cap', text: p.caption })
  ]));
}

async function renderRelated() {
  const host = document.getElementById('relatedHost');
  if (!host) return;
  const services = await listPublicServices();
  const wanted = ['permanent_lighting', 'gutter_brightening', 'windows'];
  const items = wanted
    .map(k => services.find(s => s.key === k && s.quotable))
    .filter(Boolean);

  if (!items.length) { host.remove(); return; }

  clear(host).append(...items.map(s => el('a', {
    class: 'pair-card', 'data-service': s.key,
    href: s.key === 'permanent_lighting'
      ? '/services/lighting/permanent-outdoor-lighting/'
      : (urlForKey(s.key) || '/')
  }, [
    el('h3', { text: s.name }),
    el('p', { text: s.blurb || '' }),
    el('span', { class: 'card__more', text: 'What this involves →' })
  ])));
}

async function init() {
  document.documentElement.dataset.service = 'christmas_lighting';
  await mountChrome('christmas');

  renderSeasonImage();

  await Promise.allSettled([
    applySettings().catch(err => console.error(err)),
    renderRelated().catch(err => console.error(err))
  ]);

  // the page genuinely shows questions and answers, so the markup is honest
  faqSchema([...document.querySelectorAll('.callout')]
    .map(c => [c.querySelector('h3')?.textContent?.trim(),
               c.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim()])
    .filter(([q, a]) => q && a));
  breadcrumbSchema([
    { name: 'Nova Shield', path: '/' },
    { name: 'Lighting', path: '/services/lighting/' },
    { name: 'Seasonal Christmas Lighting' }
  ]);

  mountReveals();

  const host = document.getElementById('quoteFormHost');
  try {
    clear(host).append(await createQuoteForm({ preselect: ['christmas_lighting'] }));
  } catch (err) {
    clear(host).append(el('div', { class: 'callout' }, [
      el('h3', { text: 'The form could not load' }),
      el('p', { text: 'Please call or text 437-436-3360.' })
    ]));
    console.error(err);
  }
}

init();
