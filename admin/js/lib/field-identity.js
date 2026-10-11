import * as sharedAuth from '../../../shared/supabase.js';
const { supabase, getSession } = sharedAuth;

function rememberedAccount() {
  const id = localStorage.getItem('ns-field-active-account');
  if (!id) return null;
  // Bind remembered identity to the persisted session of the pinned SDK,
  // without triggering a network refresh. Clearing auth elsewhere (e.g.
  // desktop sign-out) must not leave a separate offline login behind.
  if (sharedAuth.SUPABASE_URL) {
    const project = new URL(sharedAuth.SUPABASE_URL).hostname.split('.')[0];
    let session;
    try { session = JSON.parse(localStorage.getItem(`sb-${project}-auth-token`)); }
    catch { return null; }
    if (session?.user?.id !== id) return null;
  }
  return id;
}

// This module also loads from the desktop measurement/outbox graph. Retire
// the namespace on logout even when the field page is not currently open.
supabase.auth.onAuthStateChange?.((event) => {
  if (event !== 'SIGNED_OUT') return;
  const id = localStorage.getItem('ns-field-active-account');
  localStorage.removeItem('ns-field-active-account');
  if (id) void import('./field-cache.js').then(cache => cache.forget(id)).catch(() => {});
});

// Local session identifies the storage namespace; it does not establish
// current server permission. Online reads/writes still use the existing RLS.
export async function localAccount() {
  // Offline snapshots expire independently of the short-lived access token.
  // Avoid triggering an impossible SDK token refresh in airplane mode.
  if (!navigator.onLine) {
    const remembered = rememberedAccount();
    if (remembered) return remembered;
  }
  let result;
  try {
    result = typeof supabase.auth.getSession === 'function'
      ? await supabase.auth.getSession() : { data: await getSession() };
  } catch (error) {
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(error?.message || ''))
      return rememberedAccount();
    throw error;
  }
  if (result.error && /fetch|network/i.test(result.error.message || '')) return rememberedAccount();
  if (result.error) throw result.error;
  const id = result.data?.session?.user?.id || null;
  if (id) localStorage.setItem('ns-field-active-account', id);
  else localStorage.removeItem('ns-field-active-account');
  return id;
}

export function accessDenied(error) {
  return [401, 403, 404, 406].includes(error?.status) ||
    ['42501', 'PGRST116'].includes(error?.code) ||
    /permission denied|not authori[sz]ed|row.level security|cannot coerce.*single json|multiple \(or no\) rows|no longer accessible/i.test(error?.message || '');
}
