/**
 * Full-screen viewer for the contact sheet: a native modal <dialog> (focus trap, Escape, inert page),
 * arrow keys and swipe to browse. Without JS each frame is a plain link to its JPEG.
 */
const pad = (n) => String(n).padStart(2, '0');

export function initLightbox(dialog, links, { reducedMotion, onClose } = {}) {
  if (!dialog || !links.length || typeof dialog.showModal !== 'function') return;
  const stage = dialog.querySelector('[data-lightbox-stage]');
  const caption = dialog.querySelector('[data-lightbox-caption]');
  const count = dialog.querySelector('[data-lightbox-count]');
  const total = links.length;
  let index = 0;
  let token = 0;

  const render = (next, direction = 0) => {
    index = (next + total) % total;
    const link = links[index];

    // Reuse the frame's own <picture>, asking for a larger candidate.
    const picture = link.querySelector('picture').cloneNode(true);
    const source = picture.querySelector('source');
    const img = picture.querySelector('img');
    if (source) source.sizes = '(min-width: 1200px) 84vw, 100vw';
    img.removeAttribute('loading');
    img.style.opacity = '0';
    stage.replaceChildren(picture);

    const figcaption = link.closest('figure')?.querySelector('figcaption');
    caption.replaceChildren(...(figcaption ? [...figcaption.children].map((child) => child.cloneNode(true)) : []));
    count.textContent = pad(index + 1);

    const mine = ++token;
    let revealed = false;
    const reveal = () => {
      if (mine !== token || revealed) return;
      revealed = true;
      img.style.opacity = '';
      if (reducedMotion?.matches) return;
      img.animate(
        [{ opacity: 0, transform: `translateX(${direction * 28}px) scale(0.985)` }, { opacity: 1, transform: 'none' }],
        { duration: 460, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    };
    // Fade in once decoded, so the old photo never flashes; never wait more than a moment.
    (img.decode ? img.decode() : Promise.resolve()).then(reveal, reveal);
    setTimeout(reveal, 900);
  };

  links.forEach((link, i) => {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      render(i);
      dialog.showModal();
    });
  });

  dialog.querySelector('[data-lightbox-close]')?.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => render(index - 1, -1));
  dialog.querySelector('[data-lightbox-next]')?.addEventListener('click', () => render(index + 1, 1));

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      render(index - 1, -1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      render(index + 1, 1);
    }
  });

  // Swipe on touch screens; a tap on the empty space around the photo closes the viewer.
  let start = null;
  let swiped = false;
  stage.addEventListener('pointerdown', (event) => {
    swiped = false;
    start = event.pointerType === 'mouse' ? null : { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointerup', (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swiped = true;
      render(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    }
  });
  stage.addEventListener('pointercancel', () => { start = null; });
  stage.addEventListener('click', (event) => {
    if (swiped) {
      swiped = false;
      return;
    }
    if (event.target === stage || event.target.localName === 'picture') dialog.close();
  });

  // Back on the page, focus and the strip land on the last photo viewed.
  dialog.addEventListener('close', () => {
    links[index].focus({ preventScroll: true });
    onClose?.(index);
  });
}
