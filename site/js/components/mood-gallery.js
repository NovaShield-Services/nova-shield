import { el } from '../../../shared/dom.js';

/* "One system. Every mood." -- grouped by how the lighting is actually used
   rather than by service, which is how a customer experiences it.

   Every entry carries its own caption and alt text. An image is only ever
   placed in a group it genuinely belongs to: a Christmas photograph does not
   get reused because it happens to be available. */

export function createMoodGallery(groups = []) {
  const usable = groups.filter(g => g && (g.shots || []).length);
  if (!usable.length) return null;

  return el('div', { class: 'moodset' }, usable.map(g =>
    el('div', { class: 'mood' }, [
      el('div', { class: 'mood-head' }, [
        el('h3', { text: g.title }),
        g.note ? el('p', { text: g.note }) : null
      ]),
      el('div', { class: 'mood-shots' }, g.shots.map(s =>
        el('figure', { class: 'shot' }, [
          el('img', {
            src: s.src, alt: s.alt || s.caption || '',
            loading: 'lazy', decoding: 'async'
          }),
          el('figcaption', { text: s.caption || '' })
        ])))
    ])));
}
