import { el, numberInput, toast } from '../../../shared/dom.js';
import { describeWriteError } from './save.js';

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
  let suspended = 0;
  let guarding = false;
  const replaying = new WeakSet();

  function pending() {
    return writes.size > 0 || [...entries.values()].some(entry => entry.dirty || entry.running);
  }

  function requestRefresh() {
    if (suspended || !root.isConnected) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (pending() || suspended || !root.isConnected) return;
      try { await onChange(); }
      catch (err) { toast(`Quantity saved, but the screen could not refresh: ${describeWriteError(err)}`, 'error'); }
    }, 0);
  }

  // One write per row in flight, even when a new value arrives during a save.
  // Captured numbers, never mutable control.value, are used after the await.
  function write(measurement, value) {
    const previous = rowWrites.get(measurement.id) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => save(measurement.id, { quantity: value }))
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
      : entry.dirty ? 'Quantity not saved yet.' : '';
    entry.retry.hidden = !entry.error || invalid;
    entry.discard.hidden = !entry.dirty || !!entry.running;
  }

  function drain(entry) {
    clearTimeout(entry.timer);
    if (entry.running) return entry.running;
    if (!entry.dirty || !valid(entry)) { paint(entry); return Promise.resolve(); }
    entry.running = (async () => {
      while (entry.dirty && valid(entry)) {
        const value = Number(entry.input.value);
        const revision = entry.revision;
        entry.error = null;
        try {
          await write(entry.measurement, value);
          entry.saved = value;
          entry.measurement.quantity = value;
          if (revision === entry.revision) entry.dirty = false;
        } catch (err) {
          // An earlier failure must not revert or annotate a newer edit.
          if (revision === entry.revision) { entry.error = err; break; }
        }
      }
    })().finally(() => {
      entry.running = null;
      paint(entry);
      if (!entry.dirty) requestRefresh();
    });
    paint(entry);
    return entry.running;
  }

  function quantityInput(measurement, attrs = {}) {
    const id = `measurement-save-${++statusId}`;
    const message = el('span', { id, class: 'hint', role: 'status', 'aria-live': 'polite' });
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
        paint(entry);
        requestRefresh();
      } });
    Object.assign(entry, { retry, discard });
    entries.set(measurement.id, entry);
    input.addEventListener('input', () => {
      entry.revision++;
      version++;
      entry.dirty = true;
      entry.error = null;
      clearTimeout(entry.timer);
      paint(entry);
      if (valid(entry)) entry.timer = setTimeout(() => drain(entry), delay);
    });
    input.addEventListener('blur', () => { (entry.error ? Promise.resolve() : drain(entry)).then(() => {
      if (!entry.dirty) requestRefresh();
    }); });
    paint(entry);
    return el('div', {}, [input, message, retry, discard]);
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
    } finally { suspended--; }
  }

  /** Save before delete/duplicate/quote actions, without changing their logic.
   * Keep the original controls mounted until their original handler runs. */
  function guardActions(host) {
    host.addEventListener('click', async event => {
      const target = event.target.closest('button, a');
      if (!target || !host.contains(target) || target.disabled ||
          target.dataset.measurementRecovery || replaying.has(target)) return;
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
    reset: () => { for (const entry of entries.values()) clearTimeout(entry.timer); entries.clear(); }
  };
  editors.add(editor);
  guardActions(root);
  return editor;
}
