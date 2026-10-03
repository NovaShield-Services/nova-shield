/* The public URL map.
 *
 * A `slug` column on `services` would be the natural home for this, but the
 * database schema is frozen, so the mapping lives here instead. Everything
 * that produces a link reads from this file -- the header nav, the homepage
 * matrix, the category hubs, related services, the sitemap generator and the
 * ?service= resolver -- so there is still exactly one place a URL is decided.
 *
 * Slugs are deliberately not derived from service keys: `siding` is a database
 * key, `siding-washing` is what a customer and a search engine should see.
 */

export const CATEGORIES = {
  lighting: { slug: 'lighting',          label: 'Lighting',          nav: 'lighting' },
  cleaning: { slug: 'exterior-cleaning', label: 'Exterior Care'   , nav: 'cleaning' },
  winter:   { slug: 'winter-care',       label: 'Winter Care',       nav: 'winter'   }
};

/* Every public service page, in the order a customer should meet them.
 *
 *   key      the services.key this page quotes for
 *   variant  a detail.variants[...] entry, where several pages share one
 *            service (see the winter note below)
 *   bespoke  the page is hand-built HTML rather than the shared template
 *   primary  when several pages share a key, the one other pages link to
 *
 * Winter: "Sidewalk & Walkway" and "Deck & Tight-Access" are two pages over
 * ONE service. The price book already treats them as a single visit priced by
 * a "what is cleared" scope, so splitting them into two services would apply
 * the per-visit minimum twice to a customer who wants both.
 */
export const PAGES = [
  { slug: 'permanent-outdoor-lighting', cat: 'lighting', key: 'permanent_lighting',
    name: 'Permanent Outdoor Lighting', bespoke: true, primary: true },
  { slug: 'christmas-lighting', cat: 'lighting', key: 'christmas_lighting',
    name: 'Christmas Lighting', bespoke: true, primary: true },

  { slug: 'siding-washing',     cat: 'cleaning', key: 'siding',             primary: true },
  { slug: 'roof-cleaning',      cat: 'cleaning', key: 'roof_soft_wash',     primary: true },
  { slug: 'gutter-brightening', cat: 'cleaning', key: 'gutter_brightening', primary: true },
  { slug: 'concrete-cleaning',  cat: 'cleaning', key: 'concrete',           primary: true },
  { slug: 'window-cleaning',    cat: 'cleaning', key: 'windows',            primary: true },
  { slug: 'deck-cleaning',      cat: 'cleaning', key: 'deck',               primary: true },
  { slug: 'fence-cleaning',     cat: 'cleaning', key: 'fence',              primary: true },
  { slug: 'moss-removal',       cat: 'cleaning', key: 'moss',               primary: true },
  { slug: 'graffiti-removal',   cat: 'cleaning', key: 'graffiti',           primary: true },

  { slug: 'heating-wire-installation', cat: 'winter', key: 'winter_deicing_cables',
    primary: true },
  { slug: 'sidewalk-walkway-snow-removal', cat: 'winter', key: 'winter_property_care',
    variant: 'sidewalk-walkway-snow-removal', primary: true },
  { slug: 'deck-tight-access-snow-removal', cat: 'winter', key: 'winter_property_care',
    variant: 'deck-tight-access-snow-removal' }
];

/* Internal pricing components. They are real rows in `services` because a
   quote has to be able to carry them, but they are not things a customer
   browses, so they get no page and never reach the sitemap. */
export const INTERNAL_KEYS = ['permanent_lighting_jump', 'christmas_lighting_jump'];

export const categoryUrl = cat =>
  CATEGORIES[cat] ? `/services/${CATEGORIES[cat].slug}/` : '/';

export const pageUrl = page => `/services/${CATEGORIES[page.cat].slug}/${page.slug}/`;

/** The page a service key should link to, for related services and lists. */
export function urlForKey(key) {
  const page = PAGES.find(p => p.key === key && p.primary) || PAGES.find(p => p.key === key);
  return page ? pageUrl(page) : null;
}

export const pagesInCategory = cat => PAGES.filter(p => p.cat === cat);

/**
 * Join the live service catalogue to the route map for display.
 *
 * One row per PAGE rather than per service, which is what makes the two winter
 * pages that share `winter_property_care` both appear under their own names.
 * Names and blurbs still come from the database; only the URL comes from here.
 */
export function rowsForCategory(cat, services) {
  const byKey = new Map(services.map(s => [s.key, s]));
  return pagesInCategory(cat).map(page => {
    const service = byKey.get(page.key);
    if (!service || service.quotable === false) return null;
    const variant = (service.detail?.variants || {})[page.variant] || {};
    const { name, blurb, ...variantContent } = variant;
    return {
      key: page.key,
      slug: page.slug,
      href: pageUrl(page),
      name: name || page.name || service.name,
      blurb: blurb || service.blurb || '',
      /* The variant overlays the shared detail exactly as the service page
         does, so a hub row and the page it opens can never disagree. */
      detail: { ...service.detail, ...variantContent, variants: undefined }
    };
  }).filter(Boolean);
}

export const pageBySlug = slug => PAGES.find(p => p.slug === slug) || null;

/** Deep link into the quote form with this service already ticked. */
export const quoteUrl = page => `/?service=${page.slug}#quote`;

/**
 * Resolve ?service=<slug> for a page hosting the quote form.
 * Returns the service keys to preselect -- an array, because the form stays
 * multi-select and the customer can add more before submitting.
 */
export function preselectFromLocation(search = location.search) {
  const slug = new URLSearchParams(search).get('service');
  if (!slug) return [];
  const page = pageBySlug(slug);
  return page ? [page.key] : [];
}
