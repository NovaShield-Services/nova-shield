import { clear, el } from '../../../shared/dom.js';
import { mountChrome } from '../components/chrome.js';
import { createQuoteForm } from '../components/quote-form.js';
import { getPublicSettings } from '../lib/site-api.js';

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

async function init() {
  await mountChrome('permanent');
  await applySettings().catch(err => console.error(err));

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
