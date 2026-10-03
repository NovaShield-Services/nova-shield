import { el, clear } from '../../../shared/dom.js';
import { businessSchema } from '../lib/schema.js';
import { getPublicSettings, listPublicServices } from '../lib/site-api.js';
import { rowsForCategory, categoryUrl } from '../lib/routes.js';

/* Header and footer live here so four pages share one nav instead of three
   copies quietly drifting apart. */

/* The brand mark is the original Version 4 / Version 5 shield, carried over
   byte for byte from `Nova Shield - V5 Refined.html`. It is vector, so it has
   no background of its own and cannot pick one up.
 *
 * It replaced a crop window onto assets/brand/logo-hi.jpeg. That file is an
 * opaque JPEG and the sibling PNG has no cut-out either -- every pixel of it
 * carries alpha, so cropping any of them into the nav dragged a rectangle of
 * aurora along with the shield. The banner artwork is still used where a
 * rectangle is correct: the homepage hero lockup and the about plate.
 */
const LOGO_SPRITE = `<svg width="0" height="0" aria-hidden="true" focusable="false"><defs>
<linearGradient id="sv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eafffa"/><stop offset=".5" stop-color="#8fd4c8"/><stop offset="1" stop-color="#eafffa"/></linearGradient>
<linearGradient id="gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe3ab"/><stop offset="1" stop-color="#c9832e"/></linearGradient>
<symbol id="logo" viewBox="0 0 100 128"><path d="M50 4L94 22V64Q94 96 50 124Q6 96 6 64V22Z" fill="#081213" stroke="url(#sv)" stroke-width="7" stroke-linejoin="round"/><path d="M50 10L88 25V64Q88 92 50 116Q12 92 12 64V25Z" fill="none" stroke="url(#gd)" stroke-width="1.6"/><rect x="30" y="34" width="9" height="60" fill="url(#sv)"/><rect x="61" y="34" width="9" height="60" fill="url(#sv)"/><path d="M30 34h11l29 60H59z" fill="url(#gd)"/></symbol>
</defs></svg>`;

/* One sprite per document; both placements point at it. */
function mountLogoSprite() {
  if (document.getElementById('nsLogoSprite')) return;
  const host = el('div', { id: 'nsLogoSprite', 'aria-hidden': 'true',
                           style: 'position:absolute;width:0;height:0;overflow:hidden',
                           html: LOGO_SPRITE });
  document.body.prepend(host);
}

/* <template> so the markup is parsed in the SVG namespace -- createElement
   would build an HTMLUnknownElement that renders nothing. */
function svgNode(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

/* width:auto everywhere: the artwork is 100x128, so pinning both axes would
   squash it. */
const brandMark = () => svgNode(
  '<svg class="brand-mark" viewBox="0 0 100 128" role="img" aria-label="Nova Shield">'
  + '<use href="#logo"/></svg>');

const brandLockup = () => svgNode(
  '<svg class="brand-lockup-mark" viewBox="0 0 100 128" role="img" aria-label="Nova Shield">'
  + '<use href="#logo"/></svg>');


/* Three worlds, each with a hub page. Individual services live inside their
   hub rather than in the top-level navigation, which kept the bar from growing
   to thirteen items. */
const NAV = [
  { href: categoryUrl('lighting'), label: 'Lighting',          key: 'lighting' },
  { href: categoryUrl('cleaning'), label: 'Exterior Care', key: 'cleaning' },
  { href: categoryUrl('winter'),   label: 'Winter Care',       key: 'winter'   },
  { href: '/#about',               label: 'About',             key: 'about'    }
];

const NAV_ALIAS = { permanent: 'lighting', christmas: 'lighting' };

export function renderHeader(activeKey) {
  activeKey = NAV_ALIAS[activeKey] || activeKey;
  const links = NAV.map(item => el('a', {
    href: item.href, text: item.label,
    'aria-current': item.key === activeKey ? 'page' : null
  }));

  const navLinks = el('div', { class: 'navlinks', id: 'navlinks' }, [
    ...links,
    el('a', { class: 'nav-cta', href: '/#quote', text: 'Request a Quote' })
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
      el('a', { class: 'brand', href: '/', 'aria-label': 'Nova Shield home' }, [
        brandMark(),
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
  businessSchema(company, services);

  const lighting = rowsForCategory('lighting', services);
  const cleaning = rowsForCategory('cleaning', services);
  const winter   = rowsForCategory('winter',   services);

  return el('footer', { class: 'site' }, [
    el('div', { class: 'container' }, [
      el('div', { class: 'footer-top' }, [
        el('div', { class: 'footer-brand' }, [
          brandLockup(),
          el('div', { class: 'brand-name', text: 'NOVA SHIELD' }),
          el('span', { class: 'brand-sub', text: 'MAINTENANCE SERVICES' }),
          el('p', { text: 'Permanent lighting, seasonal displays and exterior care for homes in ' +
                          (company.service_area || 'our area') + '.' })
        ]),
        el('div', { class: 'footer-links' }, [
          el('div', {}, [
            el('a', { class: 'foot-hub', href: categoryUrl('lighting'), text: 'Lighting' }),
            ...lighting.map(r => el('a', { href: r.href, text: r.name }))
          ]),
          el('div', {}, [
            el('a', { class: 'foot-hub', href: categoryUrl('cleaning'), text: 'Exterior Care' }),
            ...cleaning.slice(0, 5).map(r => el('a', { href: r.href, text: r.name })),
            cleaning.length > 5
              ? el('a', { href: categoryUrl('cleaning'),
                          text: `All ${cleaning.length} services →` }) : null
          ]),
          el('div', {}, [
            el('a', { class: 'foot-hub', href: categoryUrl('winter'), text: 'Winter Care' }),
            ...winter.map(r => el('a', { href: r.href, text: r.name }))
          ]),
          el('div', {}, [
            el('span', { text: 'Contact' }),
            company.email ? el('a', { href: `mailto:${company.email}`, text: company.email }) : null,
            company.phone ? el('a', { href: `tel:${company.phone.replace(/[^0-9+]/g,'')}`, text: company.phone }) : null,
            el('a', { href: '/#quote', text: 'Request a Quote' })
          ])
        ])
      ]),
      el('div', { class: 'copyright' }, [
        el('span', { text: `© ${new Date().getFullYear()} ${company.legal_name || 'Nova Shield Maintenance Services'}` })
      ])
    ])
  ]);
}

/** Mounts chrome around whatever the page rendered into #main. */
export async function mountChrome(activeKey) {
  mountLogoSprite();
  document.body.prepend(renderHeader(activeKey));
  document.body.append(await renderFooter());
}
