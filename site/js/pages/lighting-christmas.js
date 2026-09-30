import { clear, el } from '../../../shared/dom.js';
import { mountChrome } from '../components/chrome.js';
import { createQuoteForm } from '../components/quote-form.js';
import { getPublicSettings } from '../lib/site-api.js';

async function applySettings() {
  const settings = await getPublicSettings();
  const lighting = settings.lighting || {};

  // Install/removal windows are settings, so shifting the season is an admin
  // edit rather than a copy change across several pages.
  if (lighting.christmas_install_window) {
    const el1 = document.getElementById('installWindow');
    if (el1) el1.textContent = lighting.christmas_install_window;
    for (const node of document.querySelectorAll('.js-install-window')) {
      node.textContent = lighting.christmas_install_window;
    }
  }
  if (lighting.christmas_removal_window) {
    const el2 = document.getElementById('removalWindow');
    if (el2) el2.textContent = lighting.christmas_removal_window;
  }
}

async function init() {
  await mountChrome('christmas');
  await applySettings().catch(err => console.error(err));

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
