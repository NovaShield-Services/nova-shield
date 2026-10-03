import { supabase, getSession } from '../../shared/supabase.js';
import { el, clear, toast } from '../../shared/dom.js';
import { renderLogin } from './views/login.js';
import { renderSchedule } from './views/field-schedule.js';
import { renderVisit } from './views/field-workspace.js';
import * as offlineQueue from './lib/offline-queue.js';

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

function showMessage(title, body, action) {
  clear(viewEl).append(
    el('div', { class: 'card' }, [
      el('h1', { text: title }),
      el('p', { class: 'hint', text: body }),
      action ? el('div', { class: 'btn-row', style: 'margin-top:12px' }, [action]) : null
    ])
  );
}

async function router() {
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
  await supabase.auth.signOut();
  toast('Signed out');
  navigate('/');
  router();
});

/* Online [green] / Offline Queue: N actions [yellow] -- offline-queue.js
   owns the actual outbox; this just reflects its count plus the browser's
   own online/offline signal. Sync Now re-runs the same flush() 'online'
   already triggers automatically -- it exists for "I know I have signal
   now, don't wait for the browser to notice." */
const syncBadge = document.getElementById('syncBadge');
const syncNowBtn = document.getElementById('syncNow');

function paintBadge(queuedCount) {
  if (queuedCount > 0) {
    syncBadge.textContent = `Offline Queue: ${queuedCount} action${queuedCount === 1 ? '' : 's'}`;
    syncBadge.className = 'sync-badge sync-badge--queued';
    syncNowBtn.hidden = false;
  } else {
    syncBadge.textContent = navigator.onLine ? 'Online' : 'Offline';
    syncBadge.className = navigator.onLine ? 'sync-badge sync-badge--ok' : 'sync-badge sync-badge--queued';
    syncNowBtn.hidden = true;
  }
}

offlineQueue.subscribe(paintBadge);
window.addEventListener('online', () => paintBadge(0));
window.addEventListener('offline', () => offlineQueue.count().then(paintBadge));

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
