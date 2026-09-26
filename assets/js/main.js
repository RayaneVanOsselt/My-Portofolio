import { initHeader } from './modules/header.js';
import { initMenu } from './modules/menu.js';
import { initLanguage } from './modules/language.js';
import { initReveal } from './modules/reveal.js';
import { initSkills } from './modules/skills.js';
import { initContact } from './modules/contact.js';

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isLanguageSwitch = root.classList.contains('is-lang-switch');

function readUiStrings() {
  try {
    return JSON.parse(document.getElementById('ui-strings').textContent);
  } catch {
    return null;
  }
}

initHeader();
initMenu({ reducedMotion });
initLanguage();
initReveal({ reducedMotion, isLanguageSwitch });
initSkills(document.querySelector('[data-skills]'));
initContact(document.querySelector('[data-contact-form]'), readUiStrings());

// The constellation is decorative: it loads after the interface is ready and falls back to the static mark.
const hero = document.querySelector('[data-hero]');
const canvas = hero?.querySelector('[data-constellation]');
const target = hero?.querySelector('[data-constellation-target]');
if (hero && canvas && target) {
  import('./modules/constellation.js')
    .then(({ initConstellation }) => initConstellation({ host: hero, canvas, target, reducedMotion, skipIntro: isLanguageSwitch }))
    .catch(() => hero.classList.add('is-static'));
}

// Smooth in-page scrolling, but only once the initial jump to a #fragment is done.
const enableSmoothScroll = () => requestAnimationFrame(() => root.classList.add('smooth-scroll'));
if (document.readyState === 'complete') enableSmoothScroll();
else window.addEventListener('load', enableSmoothScroll, { once: true });

// A language switch lands on the same spot without replaying entrance animations.
if (isLanguageSwitch) {
  try {
    sessionStorage.removeItem('rvo:lang-switch');
  } catch {
    /* storage unavailable: nothing to clean up */
  }
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('is-lang-switch')));
}
