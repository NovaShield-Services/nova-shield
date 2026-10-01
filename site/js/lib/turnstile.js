/* Cloudflare Turnstile.

   Only the SITE key lives here — it is public by design and is meaningless
   without the secret key, which exists solely as an Edge Function secret and
   is what actually validates a token (see the submit-request function).

   The widget is rendered explicitly so we can reset it: tokens are single-use,
   so a form that stays on screen after a failed submit needs a fresh one. */

const SITE_KEY = '0x4AAAAAAFKrXWCUGrpnB1gd';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading = null;

function loadScript() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.defer = true;
    s.onload = () => (window.turnstile
      ? resolve(window.turnstile)
      : reject(new Error('Turnstile loaded but did not initialise.')));
    s.onerror = () => { loading = null; reject(new Error('Could not load the verification check.')); };
    document.head.append(s);
  });
  return loading;
}

/* render() throws if the element is not yet in the document, and callers build
   the form before appending it. */
function whenConnected(node) {
  if (node.isConnected) return Promise.resolve();
  return new Promise(resolve => {
    const obs = new MutationObserver(() => {
      if (node.isConnected) { obs.disconnect(); resolve(); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });
}

/**
 * Renders a widget into `container`.
 * Resolves to { getToken, reset, ok } — `ok` is false when the widget could not
 * load at all, so the caller can decide what to tell the customer.
 */
export async function mountTurnstile(container, { action = 'quote_request' } = {}) {
  let token = null;

  try {
    const [ts] = await Promise.all([loadScript(), whenConnected(container)]);
    const widgetId = ts.render(container, {
      sitekey: SITE_KEY,
      action,
      theme: 'light',
      callback: t => { token = t; },
      'expired-callback': () => { token = null; },
      'timeout-callback': () => { token = null; },
      'error-callback': () => { token = null; }
    });
    return {
      ok: true,
      getToken: () => token,
      reset: () => { token = null; try { ts.reset(widgetId); } catch { /* already gone */ } }
    };
  } catch {
    return { ok: false, getToken: () => null, reset: () => {} };
  }
}
