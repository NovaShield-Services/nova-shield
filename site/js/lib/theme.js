/* Theme resolution.
 *
 * The three Nova Shield presentations are CSS skins over ONE implementation.
 * Every page, every component and every call into site-api.js is identical
 * across them — only variables and a handful of component rules change.
 *
 * Order of precedence: ?theme= → saved choice → default.
 */

export const THEMES = {
  refined:   { label: 'Refined',        file: 'css/theme-refined.css' },
  editorial: { label: 'Bold Editorial', file: 'css/theme-editorial.css' },
  signal:    { label: 'Night Signal',   file: 'css/theme-signal.css' }
};

export const DEFAULT_THEME = 'refined';
const STORAGE_KEY = 'novaShieldTheme';

export function resolveTheme() {
  const fromQuery = new URLSearchParams(window.location.search).get('theme');
  if (fromQuery && THEMES[fromQuery]) return fromQuery;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES[saved]) return saved;
  } catch (e) { /* private mode — fall through to the default */ }

  return DEFAULT_THEME;
}

/** Applies the theme stylesheet. Called before first paint by each page. */
export function applyTheme(name = resolveTheme()) {
  const theme = THEMES[name] ? name : DEFAULT_THEME;

  document.documentElement.dataset.theme = theme;

  let link = document.getElementById('themeCss');
  if (!link) {
    link = document.createElement('link');
    link.id = 'themeCss';
    link.rel = 'stylesheet';
    document.head.append(link);
  }
  if (!link.href.endsWith(THEMES[theme].file)) link.href = THEMES[theme].file;

  try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore */ }
  return theme;
}

/** Keeps ?theme= on internal links so a skin survives navigation. */
export function decorateLinks(root = document) {
  const theme = document.documentElement.dataset.theme;
  if (!theme || theme === DEFAULT_THEME) return;

  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!href || /^(https?:|mailto:|tel:|#)/.test(href)) continue;
    if (href.includes('theme=')) continue;
    a.setAttribute('href', href + (href.includes('?') ? '&' : '?') + 'theme=' + theme);
  }
}
