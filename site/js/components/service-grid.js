import { el } from '../../../shared/dom.js';

/* The hub's service list.
 *
 * Collapsed it reads as a contents page. Opening one row shows what that
 * service actually involves -- the method, and the two things most likely to
 * surprise someone who has not booked it before -- so a customer can compare
 * three services against each other without opening three pages and coming
 * back twice.
 *
 * Every row is a real <a> to a real page. The expansion is an enhancement on
 * top of a working link, never a replacement for one: with scripting off, or
 * if this module fails, the list still navigates.
 *
 * Content comes from services.detail, so a row cannot describe a service
 * differently from the page it opens.
 */

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

export function createServiceGrid(rows) {
  if (!rows.length) return null;

  const dim = el('div', { class: 'svc-dim', 'aria-hidden': 'true' });
  const grid = el('div', { class: 'svc-grid' });

  let openCard = null;

  function open(card) {
    if (openCard === card) return;
    if (openCard) {
      openCard.classList.remove('is-open');
      openCard.setAttribute('aria-expanded', 'false');
    }
    openCard = card;
    if (card) {
      card.classList.add('is-open');
      card.setAttribute('aria-expanded', 'true');
    }
    grid.classList.toggle('is-active', Boolean(card));
    dim.classList.toggle('is-on', Boolean(card));
  }

  const close = card => { if (!card || openCard === card) open(null); };

  rows.forEach((row, i) => {
    const d = row.detail || {};
    const expect = (d.expect || []).slice(0, 2);

    const panel = el('span', { class: 'svc-panel' }, [
      el('span', { class: 'svc-panel-in' }, [
        d.intro ? el('span', { class: 'svc-intro', text: d.intro }) : null,
        expect.length
          ? el('span', { class: 'svc-expect' }, expect.map(x =>
              el('span', { class: 'svc-expect-item' }, [
                el('b', { text: x.title }),
                el('i', { text: x.body })
              ])))
          : null,
        el('span', { class: 'svc-open', text: 'What this involves →' })
      ])
    ]);

    const card = el('a', {
      class: 'svc-card',
      href: row.href,
      'data-service': row.key,
      'aria-expanded': 'false'
    }, [
      el('span', { class: 'svc-card-head' }, [
        el('span', { class: 'svc-card-n', text: String(i + 1).padStart(2, '0') }),
        el('span', { class: 'svc-card-name', text: row.name })
      ]),
      el('span', { class: 'svc-card-blurb', text: row.blurb }),
      panel
    ]);

    /* Pointer: hovering opens, leaving closes. Checked per event rather than
       cached, because a laptop with a touchscreen is both. */
    card.addEventListener('mouseenter', () => {
      if (window.matchMedia(FINE_POINTER).matches) open(card);
    });
    card.addEventListener('mouseleave', () => {
      if (window.matchMedia(FINE_POINTER).matches) close(card);
    });

    /* Keyboard: focus opens the row so a Tab user sees the same detail a
       mouse user does. Enter then follows the link, because the card is one. */
    card.addEventListener('focus', () => open(card));

    /* Touch: there is no hover, so the first tap opens and the second follows
       the link. Without this a tap would navigate before the detail was ever
       readable -- the expansion would exist only for mouse users. */
    card.addEventListener('click', e => {
      if (window.matchMedia(FINE_POINTER).matches) return;
      if (openCard !== card) {
        e.preventDefault();
        open(card);
      }
    });

    grid.append(card);
  });

  /* Closing on focus leaving the grid entirely, rather than on each card's
     blur, so moving between cards never flickers through a closed state. */
  grid.addEventListener('focusout', e => {
    if (!grid.contains(e.relatedTarget)) open(null);
  });

  grid.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openCard) {
      const card = openCard;
      open(null);
      card.blur();
    }
  });

  /* A tap outside the list dismisses it, which is what a touch user expects
     after the first tap has opened something. */
  document.addEventListener('click', e => {
    if (!grid.contains(e.target)) open(null);
  });

  return el('div', { class: 'svc-stack' }, [dim, grid]);
}
