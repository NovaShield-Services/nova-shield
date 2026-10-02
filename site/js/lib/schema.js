import { urlForKey } from './routes.js';
/* JSON-LD structured data.
 *
 * Built from app_settings.company and the services table rather than written
 * into the markup, so the name, phone, email and service list a search engine
 * reads can never drift from what the admin tool uses. Change the company
 * details once in settings and every page follows.
 */

const SITE = 'https://novashieldmaintenance.com';

function inject(id, data) {
  document.getElementById(id)?.remove();
  const tag = document.createElement('script');
  tag.type = 'application/ld+json';
  tag.id = id;
  tag.textContent = JSON.stringify(data);
  document.head.appendChild(tag);
}

/** The business itself. Emitted on every page. */
export function businessSchema(company = {}, services = []) {
  const offers = services
    .filter(s => s.quotable && !s.parent_key)
    .map(s => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: s.name,
        description: s.blurb || undefined,
        serviceType: s.name
      }
    }));

  inject('ld-business', {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    '@id': `${SITE}/#business`,
    name: company.legal_name || 'Nova Shield Maintenance Services',
    alternateName: company.display_name || 'Nova Shield',
    url: SITE,
    logo: `${SITE}/assets/brand/logo-hi.jpeg`,
    image: `${SITE}/assets/brand/logo-hi.jpeg`,
    telephone: company.phone || undefined,
    email: company.email || undefined,
    address: {
      '@type': 'PostalAddress',
      addressLocality: company.city || 'Sault Ste. Marie',
      addressRegion: company.province || 'ON',
      addressCountry: 'CA'
    },
    areaServed: {
      '@type': 'Place',
      name: company.service_area || 'Sault Ste. Marie & surrounding area'
    },
    // no priceRange claim: every job is quoted after a site review
    hasOfferCatalog: offers.length
      ? { '@type': 'OfferCatalog', name: 'Exterior services', itemListElement: offers }
      : undefined
  });
}

/** One service page. */
export function serviceSchema(service, company = {}) {
  const d = service.detail || {};
  inject('ld-service', {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    serviceType: service.name,
    description: d.intro || service.blurb || undefined,
    url: SITE + (urlForKey(service.key) || '/'),
    provider: { '@id': `${SITE}/#business` },
    areaServed: {
      '@type': 'Place',
      name: company.service_area || 'Sault Ste. Marie & surrounding area'
    }
  });
}

/** Trail shown in search results. */
export function breadcrumbSchema(trail = []) {
  if (trail.length < 2) return;
  inject('ld-breadcrumb', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: t.path ? SITE + t.path : undefined
    }))
  });
}

/** FAQ markup, only where the page genuinely shows questions and answers. */
export function faqSchema(pairs = []) {
  if (!pairs.length) return;
  inject('ld-faq', {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  });
}

/** Per-service canonical, title and social tags for the client-rendered page. */
export function setServiceMeta(service) {
  const d = service.detail || {};
  const url = SITE + (urlForKey(service.key) || '/');
  const title = `${service.name} | Nova Shield`;
  const desc = (d.intro || service.blurb || '').slice(0, 160);

  document.title = title;
  const set = (sel, attr, val) => {
    let el = document.head.querySelector(sel);
    if (!el) {
      el = document.createElement(sel.startsWith('link') ? 'link' : 'meta');
      const m = /\[(.+?)="(.+?)"\]/.exec(sel);
      if (m) el.setAttribute(m[1], m[2]);
      document.head.appendChild(el);
    }
    el.setAttribute(attr, val);
  };

  set('link[rel="canonical"]', 'href', url);
  set('meta[name="description"]', 'content', desc);
  set('meta[property="og:type"]', 'content', 'website');
  set('meta[property="og:url"]', 'content', url);
  set('meta[property="og:title"]', 'content', title);
  set('meta[property="og:description"]', 'content', desc);
  set('meta[property="og:image"]', 'content', `${SITE}/assets/brand/logo-hi.jpeg`);
  set('meta[name="twitter:card"]', 'content', 'summary_large_image');
  set('meta[name="twitter:title"]', 'content', title);
  set('meta[name="twitter:description"]', 'content', desc);

  // the shell is noindex; a real service page is indexable
  const robots = document.head.querySelector('meta[name="robots"]');
  if (robots) robots.setAttribute('content', 'index,follow');
}
