import { el, clear } from '../../../shared/dom.js';
import { getPublicSettings, listPublicServices } from '../lib/site-api.js';
import { applyTheme, decorateLinks, THEMES, resolveTheme } from '../lib/theme.js';

/* Header and footer live here so four pages share one nav instead of three
   copies quietly drifting apart. */

const LOGO_SVG = `
<svg class="brand-mark" viewBox="0 0 100 128" aria-hidden="true">
  <defs>
    <linearGradient id="nsSilver" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eafffa"/><stop offset=".5" stop-color="#8fd4c8"/><stop offset="1" stop-color="#eafffa"/>
    </linearGradient>
    <linearGradient id="nsGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe3ab"/><stop offset="1" stop-color="#c9832e"/>
    </linearGradient>
  </defs>
  <path d="M50 4L94 22V64Q94 96 50 124Q6 96 6 64V22Z" fill="#081213" stroke="url(#nsSilver)" stroke-width="7" stroke-linejoin="round"/>
  <path d="M50 10L88 25V64Q88 92 50 116Q12 92 12 64V25Z" fill="none" stroke="url(#nsGold)" stroke-width="1.6"/>
  <rect x="30" y="34" width="9" height="60" fill="url(#nsSilver)"/>
  <rect x="61" y="34" width="9" height="60" fill="url(#nsSilver)"/>
  <path d="M30 34h11l29 60H59z" fill="url(#nsGold)"/>
</svg>`;

const NAV = [
  { href: 'lighting-permanent.html', label: 'Permanent Lighting', key: 'permanent' },
  { href: 'lighting-christmas.html', label: 'Christmas Lighting', key: 'christmas' },
  { href: 'index.html#services',     label: 'Exterior Cleaning',  key: 'cleaning' },
  { href: 'index.html#about',        label: 'About',              key: 'about' }
];

export function renderHeader(activeKey) {
  const links = NAV.map(item => el('a', {
    href: item.href, text: item.label,
    'aria-current': item.key === activeKey ? 'page' : null
  }));

  const navLinks = el('div', { class: 'navlinks', id: 'navlinks' }, [
    ...links,
    el('a', { class: 'nav-cta', href: 'index.html#quote', text: 'Request a Quote' })
  ]);

  const menuBtn = el('button', {
    class: 'menu', id: 'menuBtn', 'aria-label': 'Menu', 'aria-expanded': 'false', text: '☰'
  });

  menuBtn.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    menuBtn.textContent = open ? '✕' : '☰';
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  navLinks.addEventListener('click', e => {
    if (e.target.tagName === 'A') {
      navLinks.classList.remove('open');
      menuBtn.textContent = '☰';
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  const header = el('header', { class: 'site' }, [
    el('nav', { class: 'container' }, [
      el('a', { class: 'brand', href: 'index.html', 'aria-label': 'Nova Shield home' }, [
        el('span', { html: LOGO_SVG }).firstElementChild,
        el('div', {}, [
          el('div', { class: 'brand-name', text: 'NOVA SHIELD' }),
          el('span', { class: 'brand-sub', text: 'Maintenance Services' })
        ])
      ]),
      navLinks,
      menuBtn
    ])
  ]);

  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  return header;
}

export async function renderFooter() {
  const [settings, services] = await Promise.all([getPublicSettings(), listPublicServices()]);
  const company = settings.company || {};
  const cleaning = services.filter(s => s.category === 'cleaning');

  return el('footer', { class: 'site' }, [
    el('div', { class: 'container' }, [
      el('div', { class: 'footer-top' }, [
        el('div', { class: 'footer-brand' }, [
          el('span', { html: LOGO_SVG }).firstElementChild,
          el('div', { class: 'brand-name', style: 'margin-top:14px', text: 'NOVA SHIELD' }),
          el('div', { class: 'brand-sub', text: 'Maintenance Services' }),
          el('p', { text: 'Permanent lighting, seasonal displays and exterior care for homes in ' +
                          (company.service_area || 'our area') + '.' })
        ]),
        el('div', { class: 'footer-links' }, [
          el('div', {}, [
            el('span', { text: 'Lighting' }),
            el('a', { href: 'lighting-permanent.html', text: 'Permanent Outdoor Lighting' }),
            el('a', { href: 'lighting-christmas.html', text: 'Christmas Lighting' })
          ]),
          el('div', {}, [
            el('span', { text: 'Exterior Care' }),
            ...cleaning.slice(0, 5).map(s =>
              el('a', { href: `service.html?s=${encodeURIComponent(s.key)}`, text: s.name }))
          ]),
          el('div', {}, [
            el('span', { text: 'Contact' }),
            company.email ? el('a', { href: `mailto:${company.email}`, text: company.email }) : null,
            company.phone ? el('a', { href: `tel:${company.phone.replace(/[^0-9+]/g,'')}`, text: company.phone }) : null,
            el('a', { href: 'index.html#quote', text: 'Request a Quote' })
          ])
        ])
      ]),
      el('div', { class: 'copyright' }, [
        el('span', { text: `© ${new Date().getFullYear()} ${company.legal_name || 'Nova Shield Maintenance Services'}` }),
        themeSwitcher()
      ])
    ])
  ]);
}

/* Review aid: lets you flip between the three presentations without editing
   anything. Delete this function and its call when a skin is chosen. */
function themeSwitcher() {
  const current = resolveTheme();
  const select = el('select', {
    'aria-label': 'Presentation',
    style: 'min-height:34px;padding:4px 8px;font-size:.75rem;max-width:180px',
    onChange: e => {
      const url = new URL(window.location.href);
      url.searchParams.set('theme', e.target.value);
      window.location.href = url.toString();
    }
  }, Object.entries(THEMES).map(([key, t]) =>
    el('option', { value: key, text: t.label, selected: key === current })));

  return el('span', { style: 'display:flex;align-items:center;gap:8px' }, [
    el('span', { text: 'Presentation' }), select
  ]);
}

/** Mounts chrome around whatever the page rendered into #main. */
export async function mountChrome(activeKey) {
  applyTheme();
  document.body.prepend(renderHeader(activeKey));
  document.body.append(await renderFooter());
  // keep the chosen skin when moving between pages
  decorateLinks(document);
}
