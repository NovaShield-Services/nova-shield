import { el, clear } from '../../../shared/dom.js';
import { mountChrome } from '../components/chrome.js';
import { createQuoteForm } from '../components/quote-form.js';
import { listPublicServices, getPublicSettings } from '../lib/site-api.js';

async function renderServicesGrid() {
  const host = document.getElementById('servicesGrid');
  const services = await listPublicServices();
  const cleaning = services.filter(s => s.category === 'cleaning' && s.quotable);

  if (!cleaning.length) {
    clear(host).append(el('div', { class: 'card' }, [
      el('p', { text: 'Service list is being updated — please call or text 437-436-3360.' })
    ]));
    return;
  }

  clear(host).append(...cleaning.map(s =>
    el('a', { class: 'card', href: `service.html?s=${encodeURIComponent(s.key)}` }, [
      el('h3', { text: s.name }),
      el('p', { text: s.blurb || '' }),
      el('span', { class: 'card__more', text: 'What this involves →' })
    ])
  ));
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

  // independent so one slow/failed section cannot blank the whole page
  await Promise.allSettled([renderServicesGrid(), renderContact()]);

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
