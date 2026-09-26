/** Skills console: WAI-ARIA tabs with automatic activation (click, arrows, Home/End). */
export function initSkills(root) {
  if (!root) return;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
  if (!tabs.length || panels.some((panel) => !panel)) return;

  const select = (index, { focus = false } = {}) => {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
    });
    root.style.setProperty('--skill', tabs[index].dataset.color);
    if (focus) tabs[index].focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
  });

  root.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
    const current = tabs.indexOf(document.activeElement);
    if (current === -1) return;
    const last = tabs.length - 1;
    const next = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowDown: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      ArrowUp: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next, { focus: true });
  });

  select(Math.max(0, tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')));
}
