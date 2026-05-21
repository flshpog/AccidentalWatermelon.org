/* ============================================================
   bg.js — variable-typographic ASCII background

   A colour brightness field is churned by "bubbles": one trails
   the cursor (with lag + force-stretch), the rest drift around
   on their own. Each bubble is a cluster of orbiting, pulsing
   sub-lobes, so its shape mutates constantly. Each bubble owns a
   hue that slowly cycles.

   The field is rendered as ASCII art — every cell becomes an
   Arial glyph chosen to match the brightness AND a target width.
   Glyph widths come from @chenglou/pretext
   (prepareWithSegments(...).widths), which is what makes
   proportional-font ASCII art hold together.

   Progressive enhancement: if pretext can't load, no canvas is
   added and the page stays plain.
   ============================================================ */

import { prepareWithSegments }
  from 'https://esm.sh/@chenglou/pretext@latest';

/* ---- tuning ---- */
const SIZE         = 14;
const ROW_H        = 16;
const COL_W        = 9;
const DECAY        = 0.86;    // field fade per frame (trail length)
const THRESH       = 0.07;    // cells dimmer than this aren't drawn
const WIDTH_BIAS   = 0.4;     // glyph width importance vs brightness
const AUTO_BUBBLES = 21;      // free-floating bubbles (besides the cursor)
const EASE         = 0.06;    // cursor lag — lower = more lag
const SAT          = 0.95;
const LIGHT        = 0.62;

const CHARSET = " .,-:;!|/()[]{}<>~+=*^?icrlvxznouewasm10#%&8B@$MW";
const VARIANTS = [
  ['normal', 400], ['normal', 700],
  ['italic', 400], ['italic', 700]
];
const fontOf = (style, weight) =>
  `${style} ${weight} ${SIZE}px Arial, Helvetica, sans-serif`;

const rand = (a, b) => a + Math.random() * (b - a);

function hsl(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const k = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [k(h + 1 / 3) * 255, k(h) * 255, k(h - 1 / 3) * 255];
}

/* ---- canvas ---- */
const canvas = document.createElement('canvas');
canvas.setAttribute('aria-hidden', 'true');
canvas.style.cssText =
  'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
const ctx = canvas.getContext('2d');

/* offscreen scratch for measuring ink coverage */
const ink = document.createElement('canvas');
ink.width = ink.height = 24;
const inkCtx = ink.getContext('2d', { willReadFrequently: true });

function coverage(ch, font) {
  inkCtx.clearRect(0, 0, 24, 24);
  inkCtx.fillStyle = '#fff';
  inkCtx.font = font;
  inkCtx.textBaseline = 'middle';
  inkCtx.fillText(ch, 2, 13);
  const d = inkCtx.getImageData(0, 0, 24, 24).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i];
  return sum / (d.length / 4) / 255;
}

/* ---- palette (pretext for glyph widths) ---- */
let palette = [];

function buildPalette() {
  const list = [];
  for (const [style, weight] of VARIANTS) {
    const font = fontOf(style, weight);
    for (const ch of CHARSET) {
      let width = 0;
      try {
        const p = prepareWithSegments(ch, font);
        if (p && p.widths && p.widths.length) width = p.widths[0];
      } catch (_) { /* fall through */ }
      if (!width) { inkCtx.font = font; width = inkCtx.measureText(ch).width; }
      list.push({ ch, font, width, bright: coverage(ch, font) });
    }
  }
  let max = 0;
  for (const g of list) if (g.bright > max) max = g.bright;
  if (max > 0) for (const g of list) g.bright /= max;
  list.sort((a, b) => a.bright - b.bright);
  palette = list;
}

function findBest(tb, tw) {
  let lo = 0, hi = palette.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (palette[mid].bright < tb) lo = mid + 1; else hi = mid;
  }
  let best = palette[lo], score = Infinity;
  const span = 16;
  const from = Math.max(0, lo - span), to = Math.min(palette.length - 1, lo + span);
  for (let i = from; i <= to; i++) {
    const g = palette[i];
    const be = Math.abs(g.bright - tb);
    const we = tw > 0 ? Math.abs(g.width - tw) / tw : 0;
    const s = be + WIDTH_BIAS * we;
    if (s < score) { score = s; best = g; }
  }
  return best;
}

/* ---- colour brightness field ---- */
let cols = 0, rows = 0, cssW = 0, cssH = 0;
let fBright = new Float32Array(0);
let fR = new Float32Array(0);
let fG = new Float32Array(0);
let fB = new Float32Array(0);

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cols = Math.ceil(cssW / COL_W) + 1;
  rows = Math.ceil(cssH / ROW_H) + 1;
  const n = cols * rows;
  fBright = new Float32Array(n);
  fR = new Float32Array(n);
  fG = new Float32Array(n);
  fB = new Float32Array(n);
}

/* elliptical, coloured splat — stretched along (dirX,dirY) by elong */
function splat(px, py, radius, strength, cr, cg, cb, dirX, dirY, elong) {
  const sigU = radius * 0.42 * (1 + elong);
  const sigW = radius * 0.42 / (1 + elong * 0.55);
  const invU = 1 / (2 * sigU * sigU);
  const invW = 1 / (2 * sigW * sigW);
  const reach = radius * (1 + elong) + radius * 0.3;
  const c0 = Math.max(0, Math.floor((px - reach) / COL_W));
  const c1 = Math.min(cols - 1, Math.ceil((px + reach) / COL_W));
  const r0 = Math.max(0, Math.floor((py - reach) / ROW_H));
  const r1 = Math.min(rows - 1, Math.ceil((py + reach) / ROW_H));
  for (let r = r0; r <= r1; r++) {
    const dy = (r + 0.5) * ROW_H - py;
    for (let c = c0; c <= c1; c++) {
      const dx = (c + 0.5) * COL_W - px;
      const u = dx * dirX + dy * dirY;
      const w = -dx * dirY + dy * dirX;
      const g = strength * Math.exp(-(u * u * invU + w * w * invW));
      if (g < 0.002) continue;
      const i = r * cols + c;
      fBright[i] += g;
      fR[i] += g * cr;
      fG[i] += g * cg;
      fB[i] += g * cb;
    }
  }
}

/* ---- bubbles ---- */
function makeLobes(count, dist, radius, strength) {
  const lobes = [];
  for (let i = 0; i < count; i++) {
    lobes.push({
      ang:        rand(0, Math.PI * 2),
      spin:       rand(0.010, 0.045) * (Math.random() < 0.5 ? -1 : 1),
      dist:       dist * rand(0.3, 1.35),
      wob:        dist * rand(0.3, 0.85),
      wobSpeed:   rand(0.015, 0.05),
      wobPhase:   rand(0, Math.PI * 2),
      rad:        radius * rand(0.55, 1.25),
      str:        strength * rand(0.65, 1.0),
      pulseSpeed: rand(0.02, 0.065),
      pulsePhase: rand(0, Math.PI * 2)
    });
  }
  return lobes;
}

let autos = [];
const cursor = {
  x: 0, y: 0, energy: 0, hue: rand(0, 360), hueSpeed: rand(0.4, 0.9),
  dirX: 1, dirY: 0, elong: 0, cr: 255, cg: 255, cb: 255,
  lobes: makeLobes(6, 44, 80, 0.5)
};

function makeAuto(i) {
  const speed = rand(0.6, 1.8);
  const dir = rand(0, Math.PI * 2);
  return {
    x: rand(0, cssW || 800),
    y: rand(0, cssH || 600),
    vx: Math.cos(dir) * speed,
    vy: Math.sin(dir) * speed,
    energy: speed,
    hue: (i / AUTO_BUBBLES) * 360 + rand(-25, 25),
    hueSpeed: rand(0.25, 1.0) * (Math.random() < 0.5 ? -1 : 1),
    dirX: 1, dirY: 0, elong: 0, cr: 255, cg: 255, cb: 255,
    lobes: makeLobes(6, rand(24, 54), rand(44, 80), rand(0.30, 0.46))
  };
}

function initBubbles() {
  autos = [];
  for (let i = 0; i < AUTO_BUBBLES; i++) autos.push(makeAuto(i));
  cursor.x = cssW / 2;
  cursor.y = cssH / 2;
}

let tick = 0;

function splatBubble(b) {
  const spinBoost = 1 + b.energy * 0.04;
  const fling = b.energy * 1.6;
  for (const L of b.lobes) {
    L.ang += L.spin * spinBoost;
    const d = L.dist + L.wob * Math.sin(tick * L.wobSpeed + L.wobPhase) + fling;
    const lx = b.x + Math.cos(L.ang) * d;
    const ly = b.y + Math.sin(L.ang) * d;
    const pulse = 0.5 + 0.5 * Math.sin(tick * L.pulseSpeed + L.pulsePhase);
    splat(lx, ly, L.rad, L.str * (0.35 + 0.65 * pulse),
          b.cr, b.cg, b.cb, b.dirX, b.dirY, b.elong);
  }
}

/* ---- render ---- */
function render() {
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.textBaseline = 'middle';
  let lastFont = '', lastFill = '';
  for (let r = 0; r < rows; r++) {
    const y = r * ROW_H + ROW_H * 0.5;
    let x = 0;
    for (let c = 0; c < cols && x < cssW; c++) {
      const i = r * cols + c;
      const b = fBright[i];
      if (b < THRESH) { x += COL_W; continue; }
      const bb = b > 1 ? 1 : b;
      const inv = 1 / b;
      const it = Math.sqrt(bb);
      let R = fR[i] * inv * it, G = fG[i] * inv * it, B = fB[i] * inv * it;
      R = (R / 24 | 0) * 24; if (R > 255) R = 255;
      G = (G / 24 | 0) * 24; if (G > 255) G = 255;
      B = (B / 24 | 0) * 24; if (B > 255) B = 255;
      const g = findBest(bb, COL_W);
      if (g.font !== lastFont) { ctx.font = g.font; lastFont = g.font; }
      const fill = 'rgb(' + R + ',' + G + ',' + B + ')';
      if (fill !== lastFill) { ctx.fillStyle = fill; lastFill = fill; }
      ctx.fillText(g.ch, x, y);
      x += g.width || COL_W;
    }
  }
}

/* ---- loop ---- */
const mouse = { x: -1e5, y: -1e5, on: false };
let running = false;

function frame() {
  tick++;
  for (let i = 0; i < fBright.length; i++) {
    fBright[i] *= DECAY; fR[i] *= DECAY; fG[i] *= DECAY; fB[i] *= DECAY;
  }

  for (const b of autos) {
    b.x += b.vx; b.y += b.vy;
    if (b.x < 0)    { b.x = 0;    b.vx =  Math.abs(b.vx); }
    if (b.x > cssW) { b.x = cssW; b.vx = -Math.abs(b.vx); }
    if (b.y < 0)    { b.y = 0;    b.vy =  Math.abs(b.vy); }
    if (b.y > cssH) { b.y = cssH; b.vy = -Math.abs(b.vy); }
    const sp = Math.hypot(b.vx, b.vy) || 1;
    b.dirX = b.vx / sp; b.dirY = b.vy / sp;
    b.elong = Math.min(2.6, sp * 0.05);
    b.hue += b.hueSpeed;
    const col = hsl(b.hue, SAT, LIGHT);
    b.cr = col[0]; b.cg = col[1]; b.cb = col[2];
    splatBubble(b);
  }

  if (mouse.on) {
    const ox = cursor.x, oy = cursor.y;
    cursor.x += (mouse.x - cursor.x) * EASE;
    cursor.y += (mouse.y - cursor.y) * EASE;
    const vx = cursor.x - ox, vy = cursor.y - oy;
    const sp = Math.hypot(vx, vy);
    cursor.energy += (sp - cursor.energy) * 0.12;
    if (sp > 0.01) { cursor.dirX = vx / sp; cursor.dirY = vy / sp; }
    cursor.elong = Math.min(3, cursor.energy * 0.055);
    cursor.hue += cursor.hueSpeed;
    const col = hsl(cursor.hue, SAT, LIGHT);
    cursor.cr = col[0]; cursor.cg = col[1]; cursor.cb = col[2];
    splatBubble(cursor);
  }

  render();

  if (document.hidden) { running = false; return; }
  requestAnimationFrame(frame);
}

function wake() {
  if (!running && !document.hidden) {
    running = true;
    requestAnimationFrame(frame);
  }
}

/* ---- events ---- */
window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
}, { passive: true });
window.addEventListener('mouseleave', () => { mouse.on = false; });
window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (t) { mouse.x = t.clientX; mouse.y = t.clientY; mouse.on = true; }
}, { passive: true });
window.addEventListener('touchend', () => { mouse.on = false; });

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { try { resize(); } catch (_) {} }, 150);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) wake();
});

/* ---- init ---- */
function start() {
  try {
    buildPalette();
    resize();
    initBubbles();
    document.body.prepend(canvas);
    wake();
  } catch (_) {
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }
}

(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
  .then(start, start);
