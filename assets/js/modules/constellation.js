import { RVO_ASPECT, RVO_POINTS } from '../data/rvo-points.js';

/*
 * Hero constellation: hundreds of small outlined triangles assemble into the RVO monogram,
 * breathe, part around the pointer and catch a chrome-like glint — echoing the brand logo.
 * Canvas 2D, one stroke call per colour, fixed 60 Hz simulation, paused when off-screen.
 */

const TAU = Math.PI * 2;
const STEP_MS = 1000 / 60;
const INTRO_MS = 1500;
const GLINT_MS = 1600;
const GLINT_EVERY_MS = 6800;

const COLORS = {
  silver: '#e6e9ff',
  blue: '#4a6dff',
  iris: '#6a5cff',
  violet: '#9b6bff',
  spark: '#ffb829',
  teal: '#2cc9a6',
  magenta: '#de5cff',
  glint: '#ffffff',
};
const OPACITY = { silver: 0.9, blue: 1, iris: 1, violet: 0.95, spark: 1, teal: 0.95, magenta: 0.9, glint: 1 };
const DUST_COLORS = ['silver', 'blue', 'iris', 'violet', 'spark', 'teal', 'magenta'];

// Equilateral triangle on the unit circle.
const V = [[0, -1], [Math.sqrt(3) / 2, 0.5], [-Math.sqrt(3) / 2, 0.5]];

/** Seeded PRNG (mulberry32): the constellation looks the same on every visit. */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chrome on the left, electric blue on the right — like the logo — with a few warm sparks. */
function colourAt(x, r) {
  if (r < 0.06) return 'spark';
  if (r < 0.1) return 'teal';
  if (r < 0.13) return 'magenta';
  const u = (r - 0.13) / 0.87;
  const silver = 0.46 - 0.3 * x;
  const blue = 0.18 + 0.2 * x;
  if (u < silver) return 'silver';
  if (u < silver + blue) return 'blue';
  return u < silver + blue + (1 - silver - blue) * 0.6 ? 'iris' : 'violet';
}

const easeOutQuart = (k) => 1 - (1 - k) ** 4;
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export function initConstellation({ host, canvas, target, reducedMotion, skipIntro = false }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    host.classList.add('is-static');
    return;
  }

  const rand = seeded(0x52564f);
  const mark = [];
  const dust = [];
  const buckets = new Map(Object.keys(COLORS).map((key) => [key, []]));
  const pointer = { x: 0, y: 0, active: false };

  let width = 0;
  let height = 0;
  let box = { x: 0, y: 0, w: 0, h: 0 };
  let scale = 1;
  let introDone = skipIntro || reducedMotion.matches;
  let introStart = null;
  let clock = 0;
  let glintAt = 2400;
  let running = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  let backlog = 0;

  const makeMarkParticle = (index) => {
    const ux = RVO_POINTS[index * 2] / 1000;
    const uy = RVO_POINTS[index * 2 + 1] / 1000;
    return {
      ux, uy,
      x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, sx: 0, sy: 0,
      size: 1.4 + rand() * 2.2,
      rot: rand() * TAU,
      spin: (rand() - 0.5) * 0.02,
      colour: colourAt(ux, rand()),
      phase: rand() * TAU,
      delay: ux * 520 + rand() * 380,
      placed: false,
    };
  };

  const makeDust = () => ({
    x: rand() * width,
    y: rand() * height,
    vx: (rand() - 0.5) * 0.2,
    vy: (rand() - 0.5) * 0.2 - 0.05,
    size: 1.2 + rand() * 2,
    rot: rand() * TAU,
    spin: (rand() - 0.5) * 0.012,
    colour: DUST_COLORS[Math.floor(rand() * DUST_COLORS.length)],
  });

  function layout() {
    const frame = canvas.getBoundingClientRect();
    if (!frame.width || !frame.height) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = frame.width;
    height = frame.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fit the monogram inside the placeholder box laid out by CSS.
    const area = target.getBoundingClientRect();
    let w = area.width * 0.94;
    let h = w * RVO_ASPECT;
    if (h > area.height * 0.94) {
      h = area.height * 0.94;
      w = h / RVO_ASPECT;
    }
    box = { x: area.left - frame.left + (area.width - w) / 2, y: area.top - frame.top + (area.height - h) / 2, w, h };
    scale = Math.min(1.25, Math.max(0.58, w / 560));

    // Particle density follows the monogram size; lighter on small or low-power devices.
    const spacing = width < 720 ? 4.6 : 4.4;
    let count = (0.42 * w * h) / (spacing * spacing);
    if ((navigator.hardwareConcurrency || 8) <= 4) count *= 0.75;
    count = Math.max(360, Math.min(RVO_POINTS.length / 2, Math.round(count)));
    while (mark.length < count) mark.push(makeMarkParticle(mark.length));
    mark.length = count;

    for (const p of mark) {
      p.tx = box.x + p.ux * w;
      p.ty = box.y + p.uy * w;
      if (p.placed) continue;
      p.placed = true;
      if (introDone) {
        p.x = p.tx;
        p.y = p.ty;
      } else {
        const angle = rand() * TAU;
        const reach = 0.3 + rand() * 0.8;
        p.sx = box.x + box.w / 2 + Math.cos(angle) * width * reach * 0.6;
        p.sy = box.y + box.h / 2 + Math.sin(angle) * height * reach * 0.6;
        p.x = p.sx;
        p.y = p.sy;
      }
    }

    // Ambient dust stays sparse on phones, where it drifts over the copy.
    const dustCount = Math.max(18, Math.min(170, Math.round((width * height) / (width < 720 ? 17000 : 10500))));
    while (dust.length < dustCount) dust.push(makeDust());
    dust.length = dustCount;
    return true;
  }

  /** The entrance is a tween on real time, so it lasts the same on a busy or throttled device. */
  function intro(now) {
    if (introStart === null) introStart = now;
    const elapsed = now - introStart;
    let pending = false;
    for (const p of mark) {
      const k = Math.min(1, Math.max(0, (elapsed - p.delay) / INTRO_MS));
      if (k < 1) pending = true;
      const e = easeOutQuart(k);
      const dx = p.tx - p.sx;
      const dy = p.ty - p.sy;
      const length = Math.hypot(dx, dy) || 1;
      const swirl = Math.sin(k * Math.PI) * 26 * scale;
      p.x = p.sx + dx * e - (dy / length) * swirl;
      p.y = p.sy + dy * e + (dx / length) * swirl;
      p.rot += p.spin * (1 + 3 * (1 - e));
    }
    if (!pending) {
      introDone = true;
      glintAt = clock + 900;
    }
  }

  /** One fixed 60 Hz simulation step (springs need a stable time step). */
  function step() {
    clock += STEP_MS;

    if (introDone) {
      const radius = 110 * scale;
      const radius2 = radius * radius;
      for (const p of mark) {
        // Gentle breathing around the target, a spring back to it, and a push away from the pointer.
        let ax = (p.tx + Math.cos(clock * 0.0008 + p.phase) * 0.7 - p.x) * 0.04;
        let ay = (p.ty + Math.sin(clock * 0.0011 + p.phase) * 0.7 - p.y) * 0.04;
        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < radius2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const force = (1 - d / radius) * 1.6;
            ax += (dx / d) * force;
            ay += (dy / d) * force;
          }
        }
        p.vx = (p.vx + ax) * 0.84;
        p.vy = (p.vy + ay) * 0.84;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
      }
    }

    for (const d of dust) {
      d.x += d.vx;
      d.y += d.vy;
      d.rot += d.spin;
      if (d.x < -12) d.x = width + 12;
      else if (d.x > width + 12) d.x = -12;
      if (d.y < -12) d.y = height + 12;
      else if (d.y > height + 12) d.y = -12;
    }
  }

  function glintPosition() {
    if (!introDone || reducedMotion.matches) return null;
    if (clock > glintAt + GLINT_MS) glintAt += GLINT_EVERY_MS;
    if (clock < glintAt) return null;
    const band = box.w * 0.09;
    return box.x - band + (box.w + band * 2) * easeInOut((clock - glintAt) / GLINT_MS);
  }

  function paint(particles, alpha, particleScale, glintX) {
    for (const list of buckets.values()) list.length = 0;
    const band = box.w * 0.07;
    for (const p of particles) {
      const key = glintX !== null && Math.abs(p.x - glintX) < band ? 'glint' : p.colour;
      buckets.get(key).push(p);
    }
    for (const [key, list] of buckets) {
      if (!list.length) continue;
      ctx.globalAlpha = alpha * OPACITY[key];
      ctx.strokeStyle = COLORS[key];
      ctx.beginPath();
      for (const p of list) {
        const r = p.size * particleScale;
        const c = Math.cos(p.rot) * r;
        const s = Math.sin(p.rot) * r;
        ctx.moveTo(p.x + V[0][0] * c - V[0][1] * s, p.y + V[0][0] * s + V[0][1] * c);
        ctx.lineTo(p.x + V[1][0] * c - V[1][1] * s, p.y + V[1][0] * s + V[1][1] * c);
        ctx.lineTo(p.x + V[2][0] * c - V[2][1] * s, p.y + V[2][0] * s + V[2][1] * c);
        ctx.closePath();
      }
      ctx.stroke();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    paint(dust, width < 720 ? 0.22 : 0.3, 1, null);
    paint(mark, 1, scale, glintPosition());
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    backlog += last ? Math.min(100, now - last) : STEP_MS;
    last = now;
    let steps = 0;
    while (backlog >= STEP_MS && steps < 4) {
      step();
      backlog -= STEP_MS;
      steps += 1;
    }
    if (steps === 4) backlog = 0;
    if (!introDone) intro(now);
    if (steps || !introDone) draw();
  }

  function renderStill() {
    for (const p of mark) {
      p.x = p.tx;
      p.y = p.ty;
      p.vx = 0;
      p.vy = 0;
    }
    draw();
  }

  function sync() {
    const shouldRun = visible && !document.hidden && !reducedMotion.matches;
    if (shouldRun && !running) {
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
    if (reducedMotion.matches) renderStill();
  }

  // Pointer interaction (mouse, pen, touch).
  const toCanvas = (event) => {
    const frame = canvas.getBoundingClientRect();
    pointer.x = event.clientX - frame.left;
    pointer.y = event.clientY - frame.top;
    pointer.active = true;
  };
  host.addEventListener('pointermove', toCanvas, { passive: true });
  host.addEventListener('pointerdown', toCanvas, { passive: true });
  for (const type of ['pointerleave', 'pointercancel']) host.addEventListener(type, () => { pointer.active = false; });
  host.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'mouse') pointer.active = false;
  });

  // Keep the monogram aligned with its CSS placeholder.
  let queued = false;
  const relayout = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (layout() && !running) (reducedMotion.matches ? renderStill() : draw());
    });
  };
  new ResizeObserver(relayout).observe(host);
  document.fonts?.ready.then(relayout);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(host);
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', () => {
    introDone = true;
    sync();
  });

  if (layout()) {
    if (reducedMotion.matches) renderStill();
    else draw();
  }
  sync();
}
