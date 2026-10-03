import { el } from '../../../shared/dom.js';

/* "One system. Every mood." -- grouped by how the lighting is actually used
   rather than by service, which is how a customer experiences it.
 *
 * Each group is collapsed to a single square collage: one tall frame beside
 * two stacked ones. Opening it reveals the same photographs at a size worth
 * looking at. Six full-width photographs in a row stopped being a gallery and
 * started being wallpaper -- a customer scrolled past all of them.
 *
 * Every entry carries its own caption and alt text. An image is only ever
 * placed in a group it genuinely belongs to: a Christmas photograph does not
 * get reused because it happens to be available.
 */

function collageFigure(shot, extraClass) {
  return el('span', { class: `mood-frame ${extraClass}` }, [
    el('img', {
      src: shot.src, alt: '', loading: 'lazy', decoding: 'async'
    })
  ]);
}

function createGroup(group) {
  const shots = group.shots;
  const panelId = `mood-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  /* The collage is the control. A button rather than a div, so it is
     reachable, announces its state, and works on Enter and Space for free. */
  const toggle = el('button', {
    type: 'button',
    class: 'mood-collage',
    'aria-expanded': 'false',
    'aria-controls': panelId
  }, [
    el('span', { class: 'mood-collage-art', 'aria-hidden': 'true' }, [
      collageFigure(shots[0], 'mood-frame--tall'),
      shots[1] ? collageFigure(shots[1], 'mood-frame--small') : null,
      shots[2] ? collageFigure(shots[2], 'mood-frame--small') : null
    ]),
    el('span', { class: 'mood-collage-text' }, [
      el('span', { class: 'mood-collage-title', text: group.title }),
      group.note ? el('span', { class: 'mood-collage-note', text: group.note }) : null,
      el('span', { class: 'mood-collage-cue' }, [
        el('span', { class: 'mood-collage-cue-open',
                     text: `See ${shots.length} photo${shots.length === 1 ? '' : 's'}` }),
        el('span', { class: 'mood-collage-cue-close', text: 'Hide photos' })
      ])
    ])
  ]);

  const panel = el('div', { class: 'mood-panel', id: panelId }, [
    el('div', { class: 'mood-panel-in' }, [
      el('div', { class: 'mood-shots' }, shots.map(s =>
        el('figure', { class: 'shot' }, [
          el('img', { src: s.src, alt: s.alt || s.caption || '',
                      loading: 'lazy', decoding: 'async' }),
          el('figcaption', { text: s.caption || '' })
        ])))
    ])
  ]);

  const wrap = el('div', { class: 'mood' }, [toggle, panel]);

  toggle.addEventListener('click', () => {
    const open = wrap.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  return wrap;
}

export function createMoodGallery(groups = []) {
  const usable = groups.filter(g => g && (g.shots || []).length);
  if (!usable.length) return null;
  return el('div', { class: 'moodset' }, usable.map(createGroup));
}
