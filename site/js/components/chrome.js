import { el, clear } from '../../../shared/dom.js';
import { businessSchema } from '../lib/schema.js';
import { getPublicSettings, listPublicServices } from '../lib/site-api.js';
import { rowsForCategory, categoryUrl } from '../lib/routes.js';

/* Header and footer live here so four pages share one nav instead of three
   copies quietly drifting apart. */

/* The brand mark is a window onto the canonical Aurora Nova Shield Maintenance
   Banner (assets/brand/logo-hi.jpeg), never a redrawn symbol. The crop windows
   live in site.css as .brandart--mark / --lockup / --full. */
const brandMark = () => el('span', { class: 'brandart brandart--mark brand-mark',
                                     role: 'img', 'aria-label': 'Nova Shield' });
const brandLockup = () => el('span', { class: 'brandart brandart--lockup brand-lockup',
                                       role: 'img', 'aria-label': 'Nova Shield Maintenance Services' });


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
  document.body.prepend(renderHeader(activeKey));
  document.body.append(await renderFooter());
}
