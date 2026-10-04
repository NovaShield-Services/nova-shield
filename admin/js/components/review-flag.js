import { el } from '../../../shared/dom.js';

/** A "flag for review" checkbox + conditional reason input -- one shared
 *  interaction for "this needs a second look", used identically on a
 *  measurement (measurements.js) and on a property section/elevation
 *  (job.js, field-workspace.js's sectionsPanel). Independent of pricing
 *  approval: this is about an on-site condition (unclear substrate, odd
 *  access), not about whether the service's rate is commercially approved.
 *
 *  save(patch) is the caller's own update call (api.updateMeasurement /
 *  api.updateSection) -- this component only owns the checkbox + text
 *  interaction, never the network call itself. */
export function reviewFlag({ required, reason, save, label = 'Flag for review' }) {
  const box = el('input', { type: 'checkbox', checked: !!required });
  const reasonInput = el('input', {
    placeholder: 'Why? (e.g. "Can’t confirm siding material from the ground")',
    style: required ? '' : 'display:none'
  });
  reasonInput.value = reason || '';

  const checkLabel = el('label', { class: `check ${required ? 'is-on' : ''}`, style: 'margin-top:10px' }, [
    box, el('span', { text: label })
  ]);

  box.addEventListener('change', async () => {
    const review_required = box.checked;
    checkLabel.className = `check ${review_required ? 'is-on' : ''}`;
    reasonInput.style.display = review_required ? '' : 'none';
    await save({ review_required, review_reason: review_required ? (reasonInput.value.trim() || null) : null });
  });
  reasonInput.addEventListener('change', async () => {
    await save({ review_reason: reasonInput.value.trim() || null });
  });

  return el('div', {}, [checkLabel, reasonInput]);
}
