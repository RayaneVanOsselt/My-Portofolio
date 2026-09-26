/**
 * Mobile menu built on a native modal <dialog> (focus trap and inert page come for free).
 * Every way of closing it is handled explicitly: the dialog's own `close` event is not fired
 * reliably by every browser once a dialog has been dismissed with Escape.
 */
export function initMenu({ reducedMotion }) {
  const dialog = document.querySelector('[data-menu]');
  const openButton = document.querySelector('[data-menu-open]');
  if (!dialog || !openButton || typeof dialog.showModal !== 'function') return;

  const closeMenu = ({ restoreFocus }) => {
    if (dialog.open) dialog.close();
    openButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus) openButton.focus({ preventScroll: true });
  };

  openButton.addEventListener('click', () => {
    dialog.showModal();
    openButton.setAttribute('aria-expanded', 'true');
  });

  dialog.querySelector('[data-menu-close]')?.addEventListener('click', () => closeMenu({ restoreFocus: true }));

  // Escape: let the browser close the dialog, then sync state and focus.
  dialog.addEventListener('cancel', () => requestAnimationFrame(() => closeMenu({ restoreFocus: true })));
  dialog.addEventListener('close', () => openButton.setAttribute('aria-expanded', 'false'));

  // A section link: close first, then scroll once the page is interactive again and continue from there.
  dialog.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    const target = link && document.getElementById(link.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    closeMenu({ restoreFocus: false });
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      history.pushState(null, '', `#${target.id}`);
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  window.matchMedia('(min-width: 1200px)').addEventListener('change', (event) => {
    if (event.matches) closeMenu({ restoreFocus: false });
  });
}
