import { el } from '../../../shared/dom.js';

/* Reusable lighting demonstration.
   The one interaction on the site that demonstrates the product rather than
   decorating the page, so it is a component and not a page-local script.

   An "off" state is only offered when a real daylight photograph of the SAME
   house is supplied. Darkening a night shot would be a lie about what the
   hardware looks like in daylight, which is the whole claim being made.
   See ASSET_SPEC.md LIGHT-04. */

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createLightingDemo({ modes = [], initial = 0, figureClass = '' } = {}) {
  const usable = modes.filter(m => m && m.src);
  if (!usable.length) return null;

  const start = usable[Math.min(initial, usable.length - 1)];

  const img = el('img', {
    src: start.src, alt: start.alt || '', decoding: 'async',
    width: start.w || undefined, height: start.h || undefined
  });
  const cap = el('figcaption', { class: 'stage-cap', text: start.cap || '' });

  const buttons = usable.map((m, i) => el('button', {
    type: 'button',
    class: 'mode' + (m === start ? ' is-on' : ''),
    'aria-pressed': String(m === start),
    text: m.label
  }));

  const controls = el('div', {
    class: 'stage-controls', role: 'group', 'aria-label': 'Lighting mode'
  }, buttons);

  const figure = el('figure', { class: `stage ${figureClass}`.trim() }, [img, cap, controls]);

  // Preload the alternatives so a switch is instant rather than a flash of nothing.
  const warm = () => usable.forEach(m => { if (m !== start) { const p = new Image(); p.src = m.src; } });
  'requestIdleCallback' in window ? requestIdleCallback(warm, { timeout: 2500 }) : setTimeout(warm, 1200);

  function select(i) {
    const m = usable[i];
    if (!m || buttons[i].classList.contains('is-on')) return;

    buttons.forEach((b, j) => {
      const on = j === i;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });

    const apply = () => {
      img.src = m.src;
      img.alt = m.alt || '';
      cap.textContent = m.cap || '';
      if (!reduced()) requestAnimationFrame(() => img.classList.remove('is-swapping'));
    };

    if (reduced()) { apply(); return; }

    img.classList.add('is-swapping');
    const next = new Image();
    next.onload = apply;
    next.onerror = () => { img.classList.remove('is-swapping'); };
    next.src = m.src;
  }

  buttons.forEach((b, i) => {
    b.addEventListener('click', () => select(i));
    // left/right arrows move between modes, which is what a grouped control
    // of this shape should do
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const n = (i + dir + buttons.length) % buttons.length;
      buttons[n].focus();
      select(n);
    });
  });

  return figure;
}
