import { supabase, getSession } from '../../shared/supabase.js';
import { el, clear, toast } from '../../shared/dom.js';
import { installUnhandledRejectionToast } from './lib/save.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderRequests } from './views/requests.js';
import { renderJobs, renderJob } from './views/job.js';
import { renderSettings } from './views/settings.js';
import { renderWinter } from './views/winter.js';

const viewEl = document.getElementById('view');
const navEl = document.getElementById('nav');
const topbarEl = document.getElementById('topbar');

const routes = [
  { pattern: /^\/dashboard$/,        nav: 'dashboard', render: renderDashboard },
  { pattern: /^\/requests$/,         nav: 'requests',  render: renderRequests },
  { pattern: /^\/jobs$/,             nav: 'jobs',      render: renderJobs },
  { pattern: /^\/jobs\/([0-9a-f-]+)$/, nav: 'jobs',    render: (ctx, id) => renderJob(ctx, id) },
  { pattern: /^\/winter$/,           nav: 'winter',    render: renderWinter },
  { pattern: /^\/settings$/,         nav: 'settings',  render: renderSettings }
];

/* Routes carry an optional query string so a dashboard card can link
   straight at the records it counted -- #/jobs?bucket=today,
   #/jobs?needs_review=1, #/requests?status=new. The route table still
   matches on the path alone; the params ride along in the render context. */
function currentLocation() {
  const hash = window.location.hash.replace(/^#/, '') || '/dashboard';
  const cut = hash.indexOf('?');
  return cut === -1
    ? { path: hash, query: '', params: new URLSearchParams() }
    : {
        path: hash.slice(0, cut) || '/dashboard',
        query: hash.slice(cut + 1),
        params: new URLSearchParams(hash.slice(cut + 1))
      };
}

function currentPath() {
  return currentLocation().path;
}

function setChrome(visible, navKey) {
  topbarEl.hidden = !visible;
  navEl.hidden = !visible;
  navEl.classList.remove('is-open');
  document.getElementById('navToggle')?.setAttribute('aria-expanded', 'false');
  for (const link of navEl.querySelectorAll('a')) {
    if (link.dataset.nav === navKey) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function showMessage(title, body, action) {
  clear(viewEl).append(
    el('div', { class: 'card', style: 'max-width:520px;margin:10vh auto' }, [
      el('h1', { text: title }),
      el('p', { class: 'hint', text: body }),
      action ? el('div', { class: 'btn-row', style: 'margin-top:16px' }, [action]) : null
    ])
  );
}

async function router() {
  const { session, isAdmin } = await getSession();

  if (!session) {
    setChrome(false);
    return renderLogin({ mount: viewEl, onSignedIn: router });
  }

  if (!isAdmin) {
    setChrome(false);
    return showMessage(
      'Account not authorised',
      'You are signed in, but this account has not been granted access to the Nova Shield field tool. ' +
      'An existing admin needs to add your user to the admin_users table.',
      el('button', {
        class: 'btn', text: 'Sign out',
        onClick: async () => { await supabase.auth.signOut(); router(); }
      })
    );
  }

  const { path, params } = currentLocation();
  const match = routes.map(r => ({ r, m: path.match(r.pattern) })).find(x => x.m);

  if (!match) {
    setChrome(true, null);
    return showMessage('Page not found', `Nothing is routed at ${path}.`,
      el('a', { class: 'btn', href: '#/dashboard', text: 'Back to dashboard' }));
  }

  setChrome(true, match.r.nav);
  clear(viewEl).append(el('div', { class: 'loading', text: 'Loading…' }));

  try {
    await match.r.render({ mount: viewEl, navigate, params }, match.m[1]);
  } catch (err) {
    console.error(err);
    clear(viewEl).append(
      el('div', { class: 'card' }, [
        el('h1', { text: 'Something went wrong' }),
        el('p', { class: 'error-text', text: err.message }),
        el('div', { class: 'btn-row', style: 'margin-top:12px' }, [
          el('button', { class: 'btn', text: 'Retry', onClick: () => router() })
        ])
      ])
    );
  }
}

export function navigate(path) {
  // Compare the whole location, query string included: navigating from
  // #/jobs?bucket=today to #/jobs is a real change even though the path
  // is identical, and must not be swallowed as a no-op re-render.
  const here = currentLocation();
  const full = here.query ? `${here.path}?${here.query}` : here.path;
  if (full === path) router();
  else window.location.hash = path;
}

document.getElementById('navToggle')?.addEventListener('click', () => {
  const open = navEl.classList.toggle('is-open');
  document.getElementById('navToggle').setAttribute('aria-expanded', String(open));
});

navEl.addEventListener('click', e => {
  if (e.target.tagName === 'A') navEl.classList.remove('is-open');
});

document.getElementById('signOut')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  toast('Signed out');
  navigate('/dashboard');
  router();
});

/* The router's try/catch only covers the initial render. Every post-mutation
   refresh is invoked un-awaited (quote.js calls onChange() ten times without
   awaiting it), so a rejected reload used to vanish into the console and leave
   a success toast sitting over a stale card -- which invites a double-send.
   This is the last-resort net for anything that escapes trySave(). */
installUnhandledRejectionToast();

window.addEventListener('hashchange', router);
router();
