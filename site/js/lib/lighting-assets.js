/* Verified photograph catalogue.
 *
 * Every file in assets/gallery/ was inspected individually (see
 * ASSET_COMPARISON.md). ALL NINE ARE PERMANENT-LIGHTING PHOTOGRAPHS. None show
 * cleaning work. This file records what each one ACTUALLY depicts so that no
 * page can place an image in a context it does not belong to -- which is how a
 * purple Christmas display ended up behind "Glass, frames and the edges people
 * miss".
 *
 * Rule: if a page needs an image and nothing here honestly fits, it gets the
 * atmospheric treatment and an ASSET_SPEC id. It does not borrow.
 *
 * All sources are 640px on the long edge, so they are used at tile scale only,
 * never as a full-bleed hero on a large viewport.
 */

const G = 'assets/gallery/';

export const PHOTOS = {
  channel_colours: {
    src: G + 'photo-01.jpg', kind: 'product',
    caption: 'Channel colour options with LED modules',
    alt: 'Four lengths of low-profile aluminium lighting channel in black, tan, white and brown, each fitted with LED modules'
  },
  warm_bungalow_dusk: {
    src: G + 'photo-02.jpg', kind: 'warm',
    caption: 'Single-storey roofline at dusk',
    alt: 'Bungalow with warm white lighting along the roofline against a deep blue dusk sky'
  },
  warm_large_home: {
    src: G + 'photo-03.jpg', kind: 'warm',
    caption: 'Warm white across gables and porch',
    alt: 'Large home at night with warm white lighting following the gables, porch and roofline'
  },
  warm_two_storey_sign: {
    src: G + 'photo-04.jpg', kind: 'warm', restricted: true,
    caption: 'Two-storey elevation, warm white',
    alt: 'Two-storey home at night with warm white roofline lighting'
    // NOT USED: a third-party yard sign is visible. Provenance unconfirmed.
  },
  colour_teal: {
    src: G + 'photo-05.jpg', kind: 'colour',
    caption: 'Teal scene, winter evening',
    alt: 'Home at night with the permanent lighting set to a single teal colour'
  },
  colour_violet: {
    src: G + 'photo-06.jpg', kind: 'colour',
    caption: 'Single-colour scene across the front elevation',
    alt: 'Two-storey home at night with the permanent lighting set to a single violet colour'
  },
  colour_multi: {
    src: G + 'photo-07.jpg', kind: 'colour',
    caption: 'Multi-colour scene along the roofline',
    alt: 'Home at night with the permanent lighting set to several colours along the roofline'
  },
  warm_patio_blue_hour: {
    src: G + 'photo-08.jpg', kind: 'warm',
    caption: 'Bungalow roofline at blue hour',
    alt: 'Bungalow lit warm white at blue hour, with a paved patio and walkway in the foreground'
  },
  warm_wreath: {
    src: G + 'photo-09.jpg', kind: 'warm-seasonal',
    caption: 'Warm white with a wreath on the door',
    alt: 'Two-storey home lit warm white at blue hour with a Christmas wreath on the front door'
  }
};

/** Shots that honestly belong in a given group. `restricted` is never returned. */
export const byKind = (...kinds) =>
  Object.values(PHOTOS).filter(p => !p.restricted && kinds.includes(p.kind));

/* The mood gallery, shared by the homepage and the permanent lighting page so
   the two cannot drift apart. */
export const MOOD_GROUPS = [
  {
    title: 'Warm white',
    note: 'The everyday setting — subtle, architectural, designed around your roofline.',
    shots: [PHOTOS.warm_patio_blue_hour, PHOTOS.warm_large_home, PHOTOS.warm_bungalow_dusk]
  },
  {
    title: 'Colour',
    note: 'For holidays, birthdays and the evenings that are not ordinary.',
    shots: [PHOTOS.colour_teal, PHOTOS.colour_violet, PHOTOS.colour_multi]
  },
  {
    title: 'Soffit & detail',
    note: 'Low-profile channel, colour-matched so the hardware is not the feature.',
    shots: [PHOTOS.channel_colours]
  }
];

/* Modes for the lighting demonstration. "Off" is deliberately absent: it needs
   a daylight photograph of the SAME house (ASSET_SPEC LIGHT-04). */
export const DEMO_MODES = [
  { label: 'Warm white', src: PHOTOS.warm_large_home.src,
    cap: 'Warm white — the everyday setting', alt: PHOTOS.warm_large_home.alt },
  { label: 'Colour', src: PHOTOS.colour_multi.src,
    cap: 'Colour scene — set from the app', alt: PHOTOS.colour_multi.alt }
];
