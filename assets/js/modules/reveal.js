/**
 * Fade-and-rise for [data-reveal] blocks as they enter the viewport.
 * Content is only hidden once this module runs (html.reveal-ready), so it never stays invisible if JS fails.
 */
export function initReveal({ reducedMotion, isLanguageSwitch }) {
  const items = [...document.querySelectorAll('[data-reveal]')];
  if (!items.length || reducedMotion.matches || !('IntersectionObserver' in window)) return;

  // After a language switch, whatever is already on screen appears immediately.
  if (isLanguageSwitch) {
    const height = window.innerHeight;
    for (const item of items) {
      const box = item.getBoundingClientRect();
      if (box.top < height && box.bottom > 0) item.classList.add('is-inview');
    }
  }

  document.documentElement.classList.add('reveal-ready');

  const observer = new IntersectionObserver((entries) => {
    let order = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      // Blocks entering together are slightly staggered, in document order.
      entry.target.style.setProperty('--reveal-delay', `${Math.min(order++, 6) * 80}ms`);
      entry.target.classList.add('is-inview');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

  items.filter((item) => !item.classList.contains('is-inview')).forEach((item) => observer.observe(item));
}
