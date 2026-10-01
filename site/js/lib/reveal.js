/* Shared reveal-on-scroll. One implementation, used by every page, so the
   motion language cannot drift between the homepage and a service page. */

const SELECTOR = '.split, .section-head, .mood, .step, .matrix-group, .expect-item, .spec, .pairs';

export function mountReveals(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });

  root.querySelectorAll(SELECTOR).forEach(t => { t.classList.add('reveal'); io.observe(t); });
}
