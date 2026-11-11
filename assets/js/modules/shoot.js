/**
 * Photo showcase (rayvo.captures0808): autofocus lock on the viewfinder, scoreboard count-up,
 * and the contact sheet pinned to the vertical scroll on wide screens with a fine pointer.
 * All of it is an enhancement: without this module the strip is a native horizontal scroller.
 */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pad = (n) => String(n).padStart(2, '0');
/** Pinned strip: pixels the strip travels per pixel of page scroll (keeps the pinned stretch short). */
const SPEED = 1.6;

function isOnScreen(element) {
  const box = element.getBoundingClientRect();
  return box.top < window.innerHeight && box.bottom > 0;
}

/** Focus locks (lime brackets) and the shutter blinks once the shot is mostly on screen. */
function initViewfinder(viewfinder) {
  if (!viewfinder) return;
  if (!('IntersectionObserver' in window) || isOnScreen(viewfinder)) {
    viewfinder.classList.add('is-locked');
    return;
  }
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    viewfinder.classList.add('is-locked');
    observer.disconnect();
  }, { threshold: 0.6 });
  observer.observe(viewfinder);
}

/** Numbers count up the first time the scoreboard comes into view. The real values stay in the HTML. */
function initScoreboard(board, reducedMotion) {
  if (!board || reducedMotion.matches || !('IntersectionObserver' in window) || isOnScreen(board)) return;
  const counters = [...board.querySelectorAll('[data-count]')]
    .map((element) => ({ element, target: Number(element.dataset.count) }))
    .filter(({ target }) => Number.isFinite(target));
  if (!counters.length) return;
  counters.forEach(({ element }) => { element.textContent = '0'; });

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    const start = performance.now();
    const duration = 1400;
    const tick = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      const eased = 1 - (1 - t) ** 4;
      counters.forEach(({ element, target }) => { element.textContent = String(Math.round(target * eased)); });
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { threshold: 0.5 });
  observer.observe(board);
}

/**
 * Contact sheet. Pinned mode: the section grows by the strip's overflow and a sticky stage
 * translates the strip as the page scrolls. Otherwise: native horizontal scroll with snap points.
 * Returns { show(index, behavior) } so the lightbox can bring the last viewed frame into place.
 */
function initReel(root, reducedMotion) {
  if (!root) return null;
  const viewport = root.querySelector('[data-reel-viewport]');
  const track = root.querySelector('[data-reel-track]');
  const current = root.querySelector('[data-reel-current]');
  const bar = root.querySelector('[data-reel-progress]');
  const frames = track ? [...track.children] : [];
  if (!viewport || !frames.length) return null;

  const wide = window.matchMedia('(min-width: 960px) and (hover: hover) and (pointer: fine)');
  let pinned = false;
  let distance = 0;
  let centers = [];
  let shown = -1;
  let queued = false;

  const update = () => {
    queued = false;
    let offset;
    if (pinned) {
      offset = clamp(-root.getBoundingClientRect().top * SPEED, 0, distance);
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    } else {
      offset = viewport.scrollLeft;
    }
    const progress = distance ? clamp(offset / distance, 0, 1) : 0;
    bar?.style.setProperty('--progress', progress.toFixed(4));

    const middle = offset + viewport.clientWidth / 2;
    let index = 0;
    centers.forEach((center, i) => {
      if (Math.abs(center - middle) < Math.abs(centers[index] - middle)) index = i;
    });
    if (progress > 0.995) index = frames.length - 1;
    if (index !== shown && current) {
      shown = index;
      current.textContent = pad(index + 1);
    }
  };

  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  const measure = () => {
    pinned = wide.matches && !reducedMotion.matches;
    root.classList.toggle('is-pinned', pinned);
    track.style.transform = '';
    distance = Math.max(0, track.offsetWidth - viewport.clientWidth);
    root.style.setProperty('--reel-distance', `${Math.ceil(distance / SPEED)}px`);
    centers = frames.map((frame) => frame.offsetLeft + frame.offsetWidth / 2);
    update();
  };

  const show = (index, behavior = reducedMotion.matches ? 'instant' : 'smooth') => {
    const frame = frames[index];
    if (!frame) return;
    const target = clamp(frame.offsetLeft + frame.offsetWidth / 2 - viewport.clientWidth / 2, 0, distance);
    if (pinned) {
      const top = root.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + target / SPEED, behavior });
    } else {
      viewport.scrollTo({ left: target, behavior });
    }
  };

  window.addEventListener('scroll', () => { if (pinned) queue(); }, { passive: true });
  viewport.addEventListener('scroll', () => { if (!pinned) queue(); }, { passive: true });
  wide.addEventListener('change', measure);
  reducedMotion.addEventListener('change', measure);
  if ('ResizeObserver' in window) {
    const resize = new ResizeObserver(() => requestAnimationFrame(measure));
    resize.observe(viewport);
    resize.observe(track);
  } else {
    window.addEventListener('resize', measure);
  }

  // Keyboard users tabbing through the strip: bring the focused frame to the middle.
  // Mouse focus is ignored, so a click never moves the frame from under the pointer.
  track.addEventListener('focusin', (event) => {
    if (!event.target.matches(':focus-visible')) return;
    const index = frames.findIndex((frame) => frame.contains(event.target));
    if (index >= 0) show(index);
  });

  measure();
  return { show };
}

export function initShoot(root, { reducedMotion }) {
  if (!root) return null;
  initViewfinder(root.querySelector('[data-viewfinder]'));
  initScoreboard(root.querySelector('[data-scoreboard]'), reducedMotion);
  return initReel(root.querySelector('[data-reel]'), reducedMotion);
}
