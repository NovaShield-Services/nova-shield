import { flushMeasurementEdits } from './lib/measurement-entry.js';
import { supabase, getSession } from '../../shared/supabase.js';
import { el, clear, toast } from '../../shared/dom.js';
import { renderLogin } from './views/login.js';
import { renderSchedule } from './views/field-schedule.js';
import { renderVisit } from './views/field-workspace.js';
import * as offlineQueue from './lib/offline-queue.js';
import { setStatusBarTheme, isNative, loadAppPlugin } from './lib/native.js';
import { installUnhandledRejectionToast } from './lib/save.js';
import { installBackHandler, installEscapeHandler, fieldParentOf } from './lib/navigation.js';

setStatusBarTheme();

/* Same net as the desktop console: the field screens do inline saves from
   event handlers, and a rejection with no handler used to leave the control
   showing a value that never reached Supabase. */
installUnhandledRejectionToast();

/* A small, separate router rather than a mode bolted onto main.js's: the
   field console is a dedicated page by design (different layout, different
   job -- see field.html), and the two screens it needs don't warrant
   dragging in the desktop SPA's nav chrome and five-route table. It shares
   everything that matters: the same Supabase session (same origin, same
   localStorage), the same login screen, the same api.js. */

const viewEl = document.getElementById('view');

const routes = [
  { pattern: /^\/$/,                        render: renderSchedule },
  { pattern: /^\/visit\/([0-9a-f-]+)$/,     render: (ctx, id) => renderVisit(ctx, id) }
];

function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/';
}

/* Same history-depth stamp as the desktop console (see main.js for why
   history.length cannot answer this). The field console needs it for the
   same reason and more sharply: a tech opens a visit from a notification,
   lands on /visit/<id> with an empty history, and Back must take them to
   the schedule rather than drop them out of the app mid-job. */
let navDepth = 0;

function syncNavDepth() {
  const state = window.history.state;
  if (state && typeof state.nsDepth === 'number') {
    navDepth = state.nsDepth;
    return;
  }
  navDepth += 1;
  try {
    window.history.replaceState({ ...(state || {}), nsDepth: navDepth }, '');
  } catch { /* see main.js */ }
}

function showMessage(title, body, action) {
  clear(viewEl).append(
    el('div', { class: 'card' }, [
      el('h1', { text: title }),
      el('p', { class: 'hint', text: body }),
      action ? el('div', { class: 'btn-row', style: 'margin-top:12px' }, [action]) : null
    ])
  );
}

let measurementRouteAttempt = 0;
async function router() {
  const attempt = ++measurementRouteAttempt;
  if (!await flushMeasurementEdits() || attempt !== measurementRouteAttempt) return;
  syncNavDepth();
  const { session, isAdmin } = await getSession();

  if (!session) return renderLogin({ mount: viewEl, onSignedIn: router });

  if (!isAdmin) {
    return showMessage(
      'Account not authorised',
      'You are signed in, but this account has not been granted field access.',
      el('button', { class: 'btn', text: 'Sign out',
        onClick: async () => { await supabase.auth.signOut(); router(); } })
    );
  }

  const path = currentPath();
  const match = routes.map(r => ({ r, m: path.match(r.pattern) })).find(x => x.m);

  if (!match) {
    window.location.hash = '/';
    return;
  }

  clear(viewEl).append(el('div', { class: 'loading', text: 'Loading…' }));

  try {
    await match.r.render({ mount: viewEl, navigate }, match.m[1]);
  } catch (err) {
    console.error(err);
    showMessage('Something went wrong', err.message,
      el('button', { class: 'btn', text: 'Retry', onClick: () => router() }));
  }
}

export function navigate(path) {
  if (currentPath() === path) router();
  else window.location.hash = path;
}

document.getElementById('signOut')?.addEventListener('click', async () => {
  if (!await flushMeasurementEdits()) return;
  await supabase.auth.signOut();
  toast('Signed out');
  navigate('/');
  router();
});

/* Escape / Android Back. This page has no nav drawer, but it is where the
   photo-markup overlay is actually used, so overlay dismissal matters more
   here than on the desktop console. fieldParentOf is passed explicitly
   because this router's root is '/', not '/dashboard'. */
installEscapeHandler();

installBackHandler({
  beforeExit: flushMeasurementEdits,
  currentPath,
  navigate,
  canGoBack: () => navDepth > 1,
  resolveParent: fieldParentOf,
  loadApp: loadAppPlugin,
  native: isNative
});

/* Online [green] / Offline Queue: N actions [yellow] -- offline-queue.js
   owns the actual outbox; this just reflects its count plus the browser's
   own online/offline signal. Sync Now re-runs the same flush() 'online'
   already triggers automatically -- it exists for "I know I have signal
   now, don't wait for the browser to notice." */
const syncBadge = document.getElementById('syncBadge');
const syncNowBtn = document.getElementById('syncNow');

/* Four states the tech must be able to tell apart, because they call for
   different actions:
     synced       - nothing outstanding, connection fine
     offline      - no connection; anything saved is saved HERE, not on the server
     pending sync - has connection, replay in flight or waiting
     sync failed  - has connection but replay hit a real error; needs attention
   These used to collapse into two: a green "Online" and one yellow pill that
   meant offline, pending and failed all at once. Worse, the 'online' event
   painted the badge green with a hardcoded count of 0, so a queue that was
   still full -- or permanently stuck -- read as fully synced. */
function paintBadge(state) {
  const { count, online, syncing, lastError } = state;
  syncNowBtn.hidden = !(count > 0 && online && !syncing);

  if (count === 0) {
    syncBadge.textContent = online ? 'Synced' : 'Offline';
    syncBadge.className = online ? 'sync-badge sync-badge--ok' : 'sync-badge sync-badge--queued';
    return;
  }
  const n = `${count} saved here`;
  if (!online) {
    syncBadge.textContent = `Offline — ${n}`;
    syncBadge.className = 'sync-badge sync-badge--queued';
  } else if (syncing) {
    syncBadge.textContent = `Syncing ${count}…`;
    syncBadge.className = 'sync-badge sync-badge--queued';
  } else if (lastError) {
    syncBadge.textContent = `Sync failed — ${n}`;
    syncBadge.className = 'sync-badge sync-badge--error';
  } else {
    syncBadge.textContent = `Pending sync — ${count}`;
    syncBadge.className = 'sync-badge sync-badge--queued';
  }
}

offlineQueue.subscribe(paintBadge);

/* Tapping the badge lists what is actually waiting. The queue has always
   stored a human label per item; nothing rendered it, so a tech with a stuck
   queue saw a number and had no way to find out what it was. */
syncBadge.style.cursor = 'pointer';
syncBadge.setAttribute('title', 'Tap to see what is waiting to sync');
syncBadge.addEventListener('click', async () => {
  const state = offlineQueue.syncState();
  if (!state.count) return toast(state.online ? 'Everything is synced' : 'Offline — nothing waiting to sync');
  const items = await offlineQueue.pending();
  const summary = items.map((i) => i.label || i.type).join(', ');
  toast(state.lastError ? `Waiting: ${summary} — last error: ${state.lastError}` : `Waiting to sync: ${summary}`,
        state.lastError ? 'error' : 'info');
});

syncNowBtn.addEventListener('click', async () => {
  syncNowBtn.disabled = true;
  syncNowBtn.textContent = 'Syncing…';
  const { flushed, remaining, error } = await offlineQueue.flush();
  syncNowBtn.disabled = false;
  syncNowBtn.textContent = 'Sync Now';
  if (flushed.length) toast(`Synced ${flushed.length} queued action${flushed.length === 1 ? '' : 's'}`);
  if (remaining > 0) toast(error ? `Sync stopped: ${error}` : `${remaining} action(s) still queued`, 'error');
  if (!flushed.length && !remaining) toast('Nothing to sync');
});

window.addEventListener('hashchange', router);
router();
