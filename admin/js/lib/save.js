import { toast } from '../../../shared/dom.js';
import { looksOffline } from './offline-queue.js';

/* Inline-save guard for the admin and field consoles.
 *
 * The measurement path (measurements.js, every calculator, review-flag.js,
 * the section and status controls in job.js) used to save with a bare
 * `await api.something(...)` inside an event handler. There is no
 * `unhandledrejection` handler in the app, so a rejected write -- offline,
 * an RLS denial, a CHECK violation -- produced a console-only rejection
 * while the <input>/<select>/checkbox kept showing the value the operator
 * had just set. The operator believed it saved. Marking a job 'completed'
 * in a driveway with no signal was the worst case: the dropdown said
 * Completed and the database still said in_progress.
 *
 * trySave() closes that: on failure it puts the control back to the value
 * the database actually holds and says why in plain language. */

/** Turns a write rejection into something an operator can act on.
 *  `looksOffline` is the same classifier the offline outbox uses to decide
 *  what is safe to queue, so the two agree on what "no connection" means. */
export function describeWriteError(err) {
  if (looksOffline(err)) return 'No connection — that change was not saved. Try again with signal.';
  return err?.message || 'That change was not saved.';
}

/** Runs a write, reverting the control and surfacing the reason on failure.
 *
 *  revert   - puts the control back to the stored value. Always supply it for
 *             an <input>/<select>/checkbox, or the UI keeps lying.
 *  success  - optional toast on success. Omit for high-frequency inline edits
 *             (a toast per keystroke is noise); supply it for deliberate,
 *             infrequent actions where silence reads as "nothing happened".
 *  after    - runs only on success, e.g. a reload/recalculate. Kept separate
 *             from the write so a failed write cannot trigger a refresh that
 *             repaints the stale value as if it were new.
 *
 *  Returns true when the write landed, so callers can skip follow-up work. */
export async function trySave(fn, { revert, success, after } = {}) {
  try {
    await fn();
  } catch (err) {
    if (revert) {
      try { revert(); } catch { /* the control may already be gone from the DOM */ }
    }
    toast(describeWriteError(err), 'error');
    return false;
  }
  if (success) toast(success);
  if (after) {
    // A failure here is a refresh failure, not a write failure -- the save
    // did land, so say so distinctly rather than implying it did not.
    try { await after(); } catch (err) {
      toast(`Saved, but the screen could not refresh: ${describeWriteError(err)}`, 'error');
    }
  }
  return true;
}

/** Installs a last-resort net so a write that escapes trySave() still tells
 *  the operator something instead of dying in the console. Call once per
 *  entry point (main.js, field.js). */
export function installUnhandledRejectionToast() {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
    toast(describeWriteError(event.reason), 'error');
  });
}
