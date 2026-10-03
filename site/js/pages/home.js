import { el, clear } from '../../../shared/dom.js';
import { mountChrome } from '../components/chrome.js';
import { createQuoteForm } from '../components/quote-form.js';
import { listPublicServices, getPublicSettings } from '../lib/site-api.js';
import { mountReveals } from '../lib/reveal.js';
import { createLightingDemo } from '../components/lighting-demo.js';
import { createMoodGallery } from '../components/mood-gallery.js';
import { MOOD_GROUPS, DEMO_MODES } from '../lib/lighting-assets.js';
import { preselectFromLocation } from '../lib/routes.js';

/* The homepage introduces the three families and nothing below them. The
   individual services are listed on each hub, where a customer has already
   said which kind of work they are here for. The family panel is static
   markup so it survives a failed or slow module load. */

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

  await renderContact().catch(() => {});

  mountReveals();

  const formHost = document.getElementById('quoteFormHost');
  try {
    clear(formHost).append(await createQuoteForm({ preselect: preselectFromLocation() }));
  } catch (err) {
    clear(formHost).append(el('div', { class: 'callout' }, [
      el('h3', { text: 'The form could not load' }),
      el('p', { text: 'Please call or text 437-436-3360 and we will take the details that way.' })
    ]));
    console.error(err);
  }
}

init();
