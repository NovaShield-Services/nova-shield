import { supabase, getSession } from '../../shared/supabase.js';
import { el, clear, toast } from '../../shared/dom.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderRequests } from './views/requests.js';
import { renderJobs, renderJob } from './views/job.js';
import { renderSettings } from './views/settings.js';

const viewEl = document.getElementById('view');
const navEl = document.getElementById('nav');
const topbarEl = document.getElementById('topbar');

const routes = [
  { pattern: /^\/dashboard$/,        nav: 'dashboard', render: renderDashboard },
  { pattern: /^\/requests$/,         nav: 'requests',  render: renderRequests },
  { pattern: /^\/jobs$/,             nav: 'jobs',      render: renderJobs },
  { pattern: /^\/jobs\/([0-9a-f-]+)$/, nav: 'jobs',    render: (ctx, id) => renderJob(ctx, id) },
  { pattern: /^\/settings$/,         nav: 'settings',  render: renderSettings }
];

function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/dashboard';
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

  const path = currentPath();
  const match = routes.map(r => ({ r, m: path.match(r.pattern) })).find(x => x.m);

  if (!match) {
    setChrome(true, null);
    return showMessage('Page not found', `Nothing is routed at ${path}.`,
      el('a', { class: 'btn', href: '#/dashboard', text: 'Back to dashboard' }));
  }

  setChrome(true, match.r.nav);
  clear(viewEl).append(el('div', { class: 'loading', text: 'Loading…' }));

  try {
    await match.r.render({ mount: viewEl, navigate }, match.m[1]);
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
  if (currentPath() === path) router();
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

window.addEventListener('hashchange', router);
router();
