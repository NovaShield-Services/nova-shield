import * as api from '../lib/api.js';
import { el, clear, toast, numberInput } from '../../../shared/dom.js';
import { money, num, unitLabel, humanise } from '../../../shared/format.js';

export async function renderSettings({ mount }) {
  const [rules, settings, services] = await Promise.all([
    api.listPricingRules(),
    api.getSettings(),
    api.listServices()
  ]);

  /* ------------------------------------------------------------ pricing -- */

  function rateRow(rule) {
    const service = rule.services;
    const rateInput = numberInput(rule.rate, null, { step: '0.01', 'aria-label': `${service.name} rate` });
    const minInput = numberInput(rule.minimum, null, { step: '1', 'aria-label': `${service.name} minimum` });
    const saveBtn = el('button', { class: 'btn btn--sm', text: 'Save' });

    saveBtn.addEventListener('click', async () => {
      const rate = num(rateInput.value);
      const minimum = num(minInput.value);
      if (rate < 0 || minimum < 0) return toast('Values cannot be negative', 'error');

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        await api.updatePricingRule(rule.service_id, { rate, minimum });
        toast(`${service.name} updated — quotes already sent keep their old rate`);
      } catch (err) {
        toast(err.message, 'error');
      }
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    });

    return el('div', { class: 'section-box' }, [
      el('div', { class: 'section-box__head' }, [
        el('div', {}, [
          el('h3', { text: service.name }),
          el('span', { class: 'hint', text: `per ${unitLabel(service.unit)} · ${humanise(service.category)}` })
        ]),
        el('span', { class: 'badge badge--muted', text: money(rule.rate) })
      ]),
      el('div', { class: 'grid grid--3' }, [
        el('label', { class: 'field', style: 'margin:0' }, [
          el('span', { text: `Rate ($ / ${unitLabel(service.unit)})` }), rateInput
        ]),
        el('label', { class: 'field', style: 'margin:0' }, [
          el('span', { text: 'Minimum charge ($)' }), minInput
        ]),
        el('div', { style: 'display:flex;align-items:flex-end' }, [saveBtn])
      ])
    ]);
  }

  const cleaning = rules.filter(r => r.services?.category === 'cleaning');
  const lighting = rules.filter(r => r.services?.category === 'lighting');

  /* ------------------------------------------------------------ company -- */

  function jsonEditor(key, label, description) {
    const value = settings[key] || {};
    const fields = Object.entries(value).map(([k, v]) => {
      const isBool = typeof v === 'boolean';
      const input = isBool
        ? el('select', {}, [
            el('option', { value: 'true', text: 'Yes', selected: v === true }),
            el('option', { value: 'false', text: 'No', selected: v === false })
          ])
        : el('input', { value: v === null ? '' : String(v) });
      input.dataset.key = k;
      input.dataset.type = isBool ? 'boolean' : (typeof v === 'number' ? 'number' : 'string');
      return el('label', { class: 'field', style: 'margin:0' }, [
        el('span', { text: humanise(k) }), input
      ]);
    });

    const saveBtn = el('button', { class: 'btn btn--sm', text: 'Save' });
    const wrapper = el('div', { class: 'grid grid--2' }, fields);

    saveBtn.addEventListener('click', async () => {
      const next = {};
      for (const input of wrapper.querySelectorAll('[data-key]')) {
        const raw = input.value;
        if (input.dataset.type === 'boolean') next[input.dataset.key] = raw === 'true';
        else if (input.dataset.type === 'number') next[input.dataset.key] = num(raw);
        else next[input.dataset.key] = raw === '' ? null : raw;
      }
      saveBtn.disabled = true;
      try {
        await api.updateSetting(key, next);
        toast(`${label} saved`);
      } catch (err) {
        toast(err.message, 'error');
      }
      saveBtn.disabled = false;
    });

    return el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [el('h2', { text: label }), el('p', { text: description })])
      ]),
      wrapper,
      el('div', { class: 'btn-row', style: 'margin-top:12px' }, [saveBtn])
    ]);
  }

  const taxWarning = settings.tax && settings.tax.enabled === false
    ? el('div', { class: 'warn' }, [
        el('strong', { text: 'Tax is switched off' }),
        el('span', { text: 'Leave it off until GST/HST registration is complete — quotes will show no tax line.' })
      ])
    : null;

  clear(mount).append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Settings' }),
      el('p', { text: 'Rates, company details and quote defaults. No code changes needed.' })
    ]),

    el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'Cleaning rates' }),
          el('p', { text: 'Changing a rate starts a new version — quotes already sent keep the rate they were built on.' })
        ])
      ]),
      ...cleaning.map(rateRow)
    ]),

    el('div', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', {}, [
          el('h2', { text: 'Lighting rates' }),
          el('p', { text: 'Permanent and seasonal are priced independently, including their jump-wire runs.' })
        ])
      ]),
      ...lighting.map(rateRow)
    ]),

    jsonEditor('company', 'Company details', 'Used on quotes, invoices and the public site.'),
    jsonEditor('quote_defaults', 'Quote defaults', 'Applied to every newly created quote.'),
    el('div', {}, [taxWarning, jsonEditor('tax', 'Tax', 'Leave disabled until you are registered to collect.')]),
    jsonEditor('lighting', 'Lighting programme', 'Warranty years and seasonal windows shown on the website.')
  );
}
