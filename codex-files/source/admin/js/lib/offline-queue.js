import * as api from './api.js';

/** A bounded, honest offline outbox for the Field Console -- not a general
 *  sync engine. It covers exactly the four action types the field console
 *  needs to survive a dead driveway connection: Property Passport/checklist
 *  writes, adding a measurement, uploading a photo, and capturing a
 *  signature. Everything else (sending an email, building a quote from
 *  calculation, revisions) still needs a live connection, same as before --
 *  those aren't things a tech does standing at the truck with no signal.
 *
 *  Guarantee, stated plainly rather than oversold: this is AT-LEAST-ONCE
 *  delivery, not exactly-once. Items are replayed strictly in the order
 *  they were queued, one at a time, and removed from the queue only after
 *  their call succeeds -- so the only way to get a duplicate is the network
 *  response for a successful call being lost between the server accepting
 *  it and this code deleting the local record, the same narrow window the
 *  notifications queue already accepts for the same reason (see
 *  ARCHITECTURE.md's notes on that queue). For the four action types here,
 *  a rare duplicate (an extra measurement row, the same photo twice) is a
 *  visible, correctable annoyance, never silent data loss -- which is the
 *  property that actually matters in the field.
 *
 *  Replay stops at the first failure and leaves the rest of the queue
 *  intact and in order, rather than skipping ahead -- a later item might
 *  depend on an earlier one having actually landed (e.g. two measurements
 *  added in sequence), so reordering on partial failure would be worse
 *  than just trying again later. */

const DB_NAME = 'ns-field-outbox';
const STORE = 'queue';
const DB_VERSION = 1;
let storageError = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  let db;
  try {
    db = await openDb();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    if (storageError) { storageError = null; notify(); }
    return result;
  } catch (err) {
    const message = err?.message || 'Device storage is unavailable.';
    if (storageError !== message) { storageError = message; notify(); }
    throw err;
  } finally {
    db?.close();
  }
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* Handlers are the REAL api.js calls -- the outbox never re-implements the
   write, it just defers calling the real thing. args must be structured-
   cloneable (plain objects, strings, numbers, Blobs/Files -- all fine for
   IndexedDB; functions and class instances are not). */
const HANDLERS = {
  updateProperty: (args) => api.updateProperty(args.id, args.patch),
  createMeasurement: (args) => api.createMeasurement(args.jobId, args.measurement),
  uploadJobPhoto: (args) => api.uploadJobPhoto(args.jobId, args.file, args.opts),
  saveSignature: async (args) => {
    const path = await api.uploadSignature(args.jobId, args.pngBlob);
    return api.saveQuoteSignature(args.quoteId, path, args.signerName);
  }
};

const listeners = new Set();

/* Observable sync state, not just a count. The field console has to be able
   to tell four situations apart -- saved locally, pending sync, synced, sync
   failed -- and a bare number collapses three of them into one. `lastError`
   is kept here rather than discarded because auto-flush (the 'online'
   listener below) has no caller to return it to, so a failed background
   replay used to leave no trace anywhere in the UI. */
let flushInFlight = null;
let discardInFlight = null;
let lastError = null;
let queued = 0;

export function syncState() {
  return {
    count: queued,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    syncing: flushInFlight !== null,
    discarding: discardInFlight !== null,
    lastError,
    storageError
  };
}

function notify(nextCount) {
  if (typeof nextCount === 'number') queued = nextCount;
  const snapshot = syncState();
  for (const cb of listeners) cb(snapshot);
}

export function subscribe(cb) {
  listeners.add(cb);
  count().then((n) => { queued = n; cb(syncState()); }).catch(() => cb(syncState()));
  return () => listeners.delete(cb);
}

export async function count() {
  const n = await withStore('readonly', (store) => reqToPromise(store.count()));
  queued = n;
  return n;
}

async function enqueue(type, args, label) {
  await withStore('readwrite', (store) => store.add({ type, args, label, createdAt: Date.now() }));
  notify(await count());
}

/** What is currently waiting to sync, oldest first. The queue already stores
 *  a human label per item ("Photo upload", "Customer signature"); nothing
 *  rendered it, so a tech with a stuck queue could see a count and had no way
 *  to find out what it was. */
export async function pending() {
  const items = await withStore('readonly', (store) => reqToPromise(store.getAll()));
  return (items || []).map((i) => ({ id: i.id, label: i.label, type: i.type, createdAt: i.createdAt,
    lastError: i.lastError || null, attemptedAt: i.attemptedAt || null }));
}

/** A deliberate local discard, never a rollback of a server write. The UI
 * confirms first. A replay owns its head item until it has finished, so
 * discarding during replay is refused. Replay waits for an earlier discard. */
export function discard(id) {
  if (flushInFlight) return Promise.reject(new Error('Wait for sync to finish before discarding an action.'));
  if (discardInFlight) return Promise.reject(new Error('Another discard is still in progress.'));
  discardInFlight = (async () => {
    await withStore('readwrite', store => store.delete(id));
    const items = await pending();
    lastError = items[0]?.lastError || null;
    notify(items.length);
  })().finally(() => { discardInFlight = null; notify(); });
  notify();
  return discardInFlight;
}

/** True if this looks like "the network isn't there" rather than a real
 *  application error (validation failure, 4xx, RLS denial) -- only the
 *  former is worth queuing. A real error should still surface immediately,
 *  offline or not. Exported so field-workspace.js's reload() can apply the
 *  exact same test to its own read-refresh after a queued write, rather
 *  than inventing a second classifier that could disagree with this one. */
export function looksOffline(err) {
  if (!navigator.onLine) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('networkerror') ||
         msg.includes('network request failed') || msg.includes('load failed');
}

/** The integration point field-workspace.js / field-photos.js call instead
 *  of the api.js function directly, for the four queueable action types.
 *  Returns { queued: false, result } when it actually ran, or
 *  { queued: true } when it went to the outbox instead. Only a
 *  looks-offline failure is queued; anything else re-throws so a real
 *  error (bad input, RLS denial) is never silently swallowed into "it'll
 *  sync later" when it actually never will. */
export async function callOrQueue(type, args, label) {
  if (!HANDLERS[type]) throw new Error(`Unknown offline action type: ${type}`);

  if (!navigator.onLine) {
    await enqueue(type, args, label);
    return { queued: true };
  }
  try {
    const result = await HANDLERS[type](args);
    return { queued: false, result };
  } catch (err) {
    if (looksOffline(err)) {
      await enqueue(type, args, label);
      return { queued: true };
    }
    throw err;
  }
}

/** Replays the queue in order, stopping at the first failure. Safe to call
 *  whenever (on 'online', on a manual Sync Now tap, on page load) -- an
 *  empty queue is a cheap no-op. */
export function flush() {
  // Re-entrancy guard. Four separate triggers can call this -- the 'online'
  // listener, the load-time attempt, a manual Sync Now tap, and a caller
  // after a queued write -- and each loop iteration reads the head record in
  // its own short read-only transaction. Two overlapping flushes therefore
  // read the SAME head record and both run its handler, which is a
  // deterministic double-execution of every queued write, not the narrow
  // lost-response window this module's guarantee accepts. Concurrent callers
  // now join the flush already in progress instead of starting a second one.
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    if (discardInFlight) await discardInFlight;
    return runFlush();
  })().finally(() => { flushInFlight = null; notify(); });
  notify();                      // repaint as "syncing" while it runs
  return flushInFlight;
}

async function runFlush() {
  const flushedLabels = [];
  let remaining = 0;
  lastError = null;

  // One record at a time: open+read, call its handler, then open+delete --
  // never a long-lived transaction spanning an await, which IndexedDB
  // transactions auto-close on.
  for (;;) {
    if (!navigator.onLine) break;
    const next = await withStore('readonly', (store) => reqToPromise(store.openCursor()))
      .then((cursor) => (cursor ? { id: cursor.key, value: cursor.value } : null));
    if (!next) break;

    try {
      await HANDLERS[next.value.type](next.value.args);
      await withStore('readwrite', (store) => store.delete(next.id));
      flushedLabels.push(next.value.label);
    } catch (err) {
      // Stored as a message string, not the Error: syncState() is a snapshot
      // the badge renders as text, and an Error object there both reads as
      // "[object Error]" and serialises to {}.
      lastError = err?.message || String(err);
      await withStore('readwrite', store => store.put({ ...next.value,
        lastError, attemptedAt: Date.now() }));
      break;
    }
  }

  remaining = await count();
  notify(remaining);
  return { flushed: flushedLabels, remaining, error: lastError };
}

if (typeof window !== 'undefined') {
  // Repaint on connectivity changes so the badge reflects online/offline even
  // when the queue count has not moved. The flush itself reports its own
  // outcome through notify(); errors are held in `lastError` rather than
  // swallowed, so a failed background replay is visible in the badge.
  window.addEventListener('online', () => { notify(); flush().catch(() => {}); });
  window.addEventListener('offline', () => { notify(); });
  // Covers the case where items were queued and the page was closed before
  // ever coming back online -- next load, while already online, tries once.
  if (navigator.onLine) flush().catch(() => {});
}
