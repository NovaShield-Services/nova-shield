import { el, numberInput, toast } from '../../../shared/dom.js';
import { describeWriteError } from './save.js';
import { looksOffline } from './offline-queue.js';

const editors = new Set();
let statusId = 0;

// A tab/WebView reload cannot wait for an async write. Warn rather than
// claiming the field outbox holds these edits (it does not queue quantities).
window.addEventListener('beforeunload', event => {
  if ([...editors].some(editor => editor.root.isConnected && editor.pending())) {
    event.preventDefault();
    event.returnValue = '';
  }
});

/** Called before either router replaces the current screen, including Back.
 * Invalid/failed quantities keep that screen and its recoverable input alive. */
export async function flushMeasurementEdits() {
  for (const editor of [...editors]) {
    if (!editor.root.isConnected) { editors.delete(editor); continue; }
    if (!await editor.flush()) {
      // Quantity edits are not part of the field outbox. Leaving offline
      // must be an explicit local discard, never a claim that they synced.
      if (editor.hasOfflineDraft() && window.confirm(
        'Measurement quantities could not be saved because there is no connection. ' +
        'Discard the unsaved quantity edits and continue? Cancel to stay and retry when connected.'
      )) {
        editor.discardDrafts();
        continue;
      }
      if (window.location.hash !== editor.route) {
        history.replaceState(history.state, '', editor.route || window.location.pathname);
      }
      return false;
    }
  }
  return true;
}

/** Quantity persistence only: dollar figures still come from backend RPCs. */
export function createMeasurementEditor({ root, save, onChange, delay = 350 }) {
  const entries = new Map();
  const rowWrites = new Map();
  const writes = new Set();
  let version = 0;
  let refreshSequence = 0;
  let refreshTimer;
  let refreshNeeded = false;
  let suspended = 0;
  let guarding = false;
  const replaying = new WeakSet();

  function pending() {
    return writes.size > 0 || [...entries.values()].some(entry => entry.dirty || entry.running);
  }

  function requestRefresh() {
    refreshNeeded = true;
    if (suspended || !root.isConnected) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (pending() || suspended || !root.isConnected) return;
      refreshNeeded = false;
      try { await onChange(); }
      catch (err) { toast(`Quantity saved, but the screen could not refresh: ${describeWriteError(err)}`, 'error'); }
    }, 0);
  }

  // One write per row in flight, even when a new value arrives during a save.
  // Captured numbers, never mutable control.value, are used after the await.
  function write(measurement, value) {
    const previous = rowWrites.get(measurement.id) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => {
      // An account change removes private controls immediately. A timer or
      // queued second write from that detached screen must not use the next
      // account's session. Ordinary navigation already flushes before detach.
      if (!root.isConnected) throw new Error('This screen closed before the quantity was saved. Reopen the visit to review it.');
      return save(measurement.id, { quantity: value });
    })
      .then(result => { version++; return result; });
    rowWrites.set(measurement.id, next);
    writes.add(next);
    next.finally(() => {
      writes.delete(next);
      if (rowWrites.get(measurement.id) === next) rowWrites.delete(measurement.id);
    }).catch(() => {});
    return next;
  }

  function valid(entry) {
    const value = Number(entry.input.value);
    return entry.input.value.trim() !== '' && !entry.input.validity.badInput &&
      Number.isFinite(value) && value >= 0 &&
      (entry.measurement.unit !== 'each' || Number.isInteger(value));
  }

  function paint(entry) {
    const invalid = entry.dirty && !valid(entry);
    entry.input.setAttribute('aria-invalid', String(invalid));
    entry.message.textContent = invalid ? 'Not saved — enter a non-negative quantity.'
      : entry.error ? `Not saved — ${describeWriteError(entry.error)}`
      : entry.running ? 'Saving quantity…'
      : entry.dirty ? 'Quantity not saved yet.' : entry.savedNotice || '';
    entry.retry.hidden = !entry.error || invalid;
    entry.discard.hidden = !entry.dirty || !!entry.running;
  }

  function drain(entry) {
    clearTimeout(entry.timer);
    if (entry.running) return entry.running;
    if (!entry.dirty || !valid(entry)) { paint(entry); return Promise.resolve(); }
    const retryFocused = document.activeElement === entry.retry;
    // Blur starts a save during a pointer click. Hiding recovery controls
    // must not move the button being clicked before its click event fires.
    entry.recovery.style.minHeight = `${entry.recovery.getBoundingClientRect().height}px`;
    entry.running = (async () => {
      while (entry.dirty && valid(entry)) {
        const value = Number(entry.input.value);
        const revision = entry.revision;
        entry.error = null;
        try {
          await write(entry.measurement, value);
          entry.saved = value;
          entry.savedNotice = 'Quantity saved.';
          entry.measurement.quantity = value;
          if (revision === entry.revision) entry.dirty = false;
        } catch (err) {
          // An earlier failure must not revert or annotate a newer edit.
          if (revision === entry.revision) { entry.error = err; break; }
        }
      }
    })().finally(() => {
      entry.running = null;
      entry.recovery.style.minHeight = '';
      paint(entry);
      if (retryFocused &&
          (document.activeElement === document.body || document.activeElement === entry.retry)) {
        (entry.dirty && !entry.retry.hidden ? entry.retry : entry.input).focus();
      }
      if (!entry.dirty) requestRefresh();
    });
    paint(entry);
    return entry.running;
  }

  function quantityInput(measurement, attrs = {}) {
    const id = `measurement-save-${++statusId}`;
    const message = el('span', { id, class: 'hint measurement-save-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const input = numberInput(measurement.quantity, null, {
      ...attrs, 'aria-describedby': id
    });
    const entry = { measurement, input, message, saved: Number(measurement.quantity || 0),
      revision: 0, dirty: false, error: null, running: null };
    const retry = el('button', { type: 'button', class: 'btn btn--sm', text: 'Retry quantity save',
      dataset: { measurementRecovery: 'true' }, onClick: () => drain(entry) });
    const discard = el('button', { type: 'button', class: 'btn btn--sm', text: 'Use saved quantity',
      dataset: { measurementRecovery: 'true' }, onClick: () => {
        clearTimeout(entry.timer);
        input.value = String(entry.saved);
        entry.measurement.quantity = entry.saved;
        entry.revision++;
        version++;
        entry.dirty = false;
        entry.error = null;
        entry.savedNotice = 'Using saved quantity.';
        paint(entry);
        input.focus();
        requestRefresh();
      } });
    const recovery = el('div', { class: 'btn-row' }, [retry, discard]);
    Object.assign(entry, { retry, discard, recovery });
    entries.set(measurement.id, entry);
    input.addEventListener('input', () => {
      entry.revision++;
      version++;
      entry.dirty = true;
      entry.savedNotice = '';
      entry.error = null;
      clearTimeout(entry.timer);
      paint(entry);
      if (valid(entry)) entry.timer = setTimeout(() => drain(entry), delay);
    });
    input.addEventListener('blur', () => { (entry.error ? Promise.resolve() : drain(entry)).then(() => {
      if (!entry.dirty) requestRefresh();
    }); });
    paint(entry);
    return el('div', {}, [input, message, recovery]);
  }

  async function changeQuantity(fn) {
    version++;
    const operation = Promise.resolve().then(fn).then(result => { version++; return result; });
    writes.add(operation);
    try {
      await operation;
      requestRefresh();
      return true;
    } catch (err) {
      toast(describeWriteError(err), 'error');
      return false;
    } finally { writes.delete(operation); }
  }

  function saveQuantity(measurement, value) {
    return changeQuantity(async () => {
      await write(measurement, value);
      measurement.quantity = value;
    });
  }

  async function flush() {
    suspended++;
    clearTimeout(refreshTimer);
    try {
      await Promise.all([...entries.values()].map(drain));
      await Promise.allSettled([...writes]);
      const unsaved = [...entries.values()].find(entry => entry.dirty);
      if (unsaved) {
        paint(unsaved);
        unsaved.input.focus();
        toast('Finish or retry the unsaved quantity before continuing.', 'error');
        return false;
      }
      return true;
    } finally {
      suspended--;
      if (!suspended && refreshNeeded) requestRefresh();
    }
  }

  /** Save before delete/duplicate/quote actions, without changing their logic.
   * Keep the original controls mounted until their original handler runs. */
  function guardActions(host, { allowQuoteDelivery = false } = {}) {
    host.addEventListener('click', async event => {
      const target = event.target.closest('button, a');
      if (!target || !host.contains(target) || target.disabled ||
          target.dataset.measurementRecovery || replaying.has(target)) return;
      // These controls read an existing quote; they do not calculate one
      // from pending quantities. Preserve the genuine gesture needed by
      // popups, clipboard and native sharing. Same-tab navigation and all
      // mutations keep the save guard. This policy is only enabled by the
      // quote-panel callers, never by the measurement controls themselves.
      if (allowQuoteDelivery && (
        target.matches('a[target="_blank"]') ||
        ['Copy Link', 'Copy SMS Text', 'Text Quote', 'Share / Print'].includes(target.textContent.trim())
      )) return;
      if (!pending() && !guarding) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (guarding) return;
      guarding = true;
      try {
        if (await flush() && target.isConnected) {
          replaying.add(target);
          try { target.click(); } finally { replaying.delete(target); }
        }
      } finally { guarding = false; }
    }, true);
  }

  const editor = {
    root, route: window.location.hash, pending, flush, quantityInput, saveQuantity, changeQuantity, guardActions,
    refreshToken: () => ({ version, sequence: ++refreshSequence }),
    isCurrent: token => token.version === version && token.sequence === refreshSequence && root.isConnected,
    canRender: () => !pending() && ![...entries.values()].some(entry => entry.input === document.activeElement),
    hasOfflineDraft: () => [...entries.values()].some(entry => entry.dirty && entry.error && looksOffline(entry.error)),
    discardDrafts: () => {
      // Called only after flush has settled and the user confirmed leaving.
      // Restore local confirmed values without issuing any rollback writes.
      for (const entry of entries.values()) {
        clearTimeout(entry.timer);
        entry.input.value = String(entry.saved);
        entry.measurement.quantity = entry.saved;
        entry.revision++;
        entry.dirty = false;
        entry.error = null;
        paint(entry);
      }
      version++;
      clearTimeout(refreshTimer);
      refreshNeeded = false;
    },
    reset: () => { for (const entry of entries.values()) clearTimeout(entry.timer); entries.clear(); }
  };
  editors.add(editor);
  guardActions(root);
  return editor;
}
