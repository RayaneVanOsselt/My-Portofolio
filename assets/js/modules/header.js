/** Header background once the page scrolls, and the nav link of the section in view. */
export function initHeader() {
  const header = document.querySelector('[data-header]');
  if (!header) return;

  let queued = false;
  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 12);
    queued = false;
  };
  window.addEventListener('scroll', () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();

  const links = [...document.querySelectorAll('[data-nav-link]')];
  const sections = [...new Set(links.map((link) => link.dataset.navLink))]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!sections.length || !('IntersectionObserver' in window)) return;

  const inBand = new Set();
  const setCurrent = (id) => {
    for (const link of links) {
      if (link.dataset.navLink === id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };

  // A thin band just above the middle of the viewport decides which section is "current".
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) inBand.add(entry.target.id);
      else inBand.delete(entry.target.id);
    }
    setCurrent(sections.find((section) => inBand.has(section.id))?.id ?? null);
  }, { rootMargin: '-42% 0px -52% 0px' });

  sections.forEach((section) => observer.observe(section));
}
