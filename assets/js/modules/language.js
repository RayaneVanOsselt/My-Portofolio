const STORAGE_KEY = 'rvo:lang';
const SWITCH_KEY = 'rvo:lang-switch';

/** Deepest anchored block (section, project…) whose top has passed the upper third of the viewport. */
function currentAnchor() {
  const line = window.innerHeight * 0.35;
  let anchor = null;
  for (const element of document.querySelectorAll('main section[id], main article[id], main li[id]')) {
    if (element.getBoundingClientRect().top <= line) anchor = element.id;
  }
  return anchor === 'top' ? null : anchor;
}

/**
 * Language links are plain links to the pre-rendered /, /en/ and /nl/ pages (crawlable, work without JS).
 * With JS, the choice is remembered and the visitor lands on the same block of the page.
 */
export function initLanguage() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-lang-link]');
    if (!link) return;

    try {
      localStorage.setItem(STORAGE_KEY, link.dataset.langLink);
    } catch {
      /* private mode: the choice simply isn't remembered */
    }

    if (link.getAttribute('aria-current') === 'true') {
      event.preventDefault();
      return;
    }

    const url = new URL(link.href);
    url.hash = currentAnchor() ?? '';
    link.href = url.href;
    try {
      sessionStorage.setItem(SWITCH_KEY, '1');
    } catch {
      /* animations will simply replay */
    }
  });
}
