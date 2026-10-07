import { el } from '../../../shared/dom.js';
import { trySave } from '../lib/save.js';

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

  /* The checkbox repaints optimistically, so a failed save has to put both
     the box and the reason field back -- otherwise the UI shows "flagged"
     while the database says otherwise, which quietly defeats the whole point
     of a safety flag. */
  let savedReason = reason || '';

  function paint(on) {
    checkLabel.className = `check ${on ? 'is-on' : ''}`;
    reasonInput.style.display = on ? '' : 'none';
  }

  box.addEventListener('change', async () => {
    const review_required = box.checked;
    paint(review_required);
    const next = review_required ? (reasonInput.value.trim() || null) : null;
    await trySave(
      () => save({ review_required, review_reason: next }),
      {
        revert: () => { box.checked = !review_required; paint(!review_required); },
        after: () => { savedReason = next || ''; }
      }
    );
  });

  reasonInput.addEventListener('change', async () => {
    // Only persist a reason while the flag is actually on. Typing a reason
    // and then clearing the checkbox used to fire this afterwards and leave
    // review_reason set with review_required = false.
    if (!box.checked) return;
    const before = savedReason;
    const next = reasonInput.value.trim() || null;
    await trySave(
      () => save({ review_reason: next }),
      {
        revert: () => { reasonInput.value = before; },
        after: () => { savedReason = next || ''; }
      }
    );
  });

  return el('div', {}, [checkLabel, reasonInput]);
}
