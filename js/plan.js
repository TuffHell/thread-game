/**
 * Drawing a room.
 *
 * Top down, architectural rather than pictorial. The heatmap is the point:
 * everything else exists so you can tell what is causing it.
 */

import { palette, settings, withAlpha } from './config.js';
import { def, KINDS, MATERIALS } from './room.js';

const DOMAIN_COLOR = {
  sound: 15, flicker: 45, light: 55, glare: 40,
  crowd: 320, clutter: 275, escape: 205, exposure: 240
};

export function fit (r, vw, vh, pad = 56) {
  const s = Math.min((vw - pad * 2) / r.w, (vh - pad * 2) / r.h);
  return { s, ox: (vw - r.w * s) / 2, oy: (vh - r.h * s) / 2 };
}

export const toScreen = (v, x, y) => ({ x: v.ox + x * v.s, y: v.oy + y * v.s });
export const toRoom = (v, x, y) => ({ x: (x - v.ox) / v.s, y: (y - v.oy) / v.s });

/* ------------------------------------------------------------------ */

export function drawBackdrop (ctx, vw, vh) {
  const p = palette();
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, vw, vh);
}

/**
 * The load field. Green where someone could stand, deepening to red where
 * they could not. Drawn into an offscreen buffer at grid resolution and
 * scaled up, which is both fast and gives the soft look of a real survey.
 */
let heatCanvas = null;

/**
 * The heat image itself, shared by the plan view and the 3D floor so the
 * survey is literally the same pixels in both.
 */
export function buildHeat (grid, mode = 'load') {
  if (!heatCanvas) heatCanvas = document.createElement('canvas');
  if (heatCanvas.width !== grid.cols || heatCanvas.height !== grid.rows) {
    heatCanvas.width = grid.cols;
    heatCanvas.height = grid.rows;
  }
  const hc = heatCanvas.getContext('2d');
  const img = hc.createImageData(grid.cols, grid.rows);
  const src = mode === 'load' ? grid.load : grid.layers[mode];

  for (let i = 0; i < src.length; i++) {
    const val = Math.max(0, Math.min(1, src[i]));
    const o = i * 4;
    if (mode === 'load') {
      // 150 (green) down to 0 (red)
      const [rr, gg, bb] = hsl(150 - val * 150, 0.62, 0.46);
      img.data[o] = rr; img.data[o + 1] = gg; img.data[o + 2] = bb;
      img.data[o + 3] = Math.round(38 + val * 165);
    } else {
      const [rr, gg, bb] = hsl(DOMAIN_COLOR[mode] ?? 200, 0.7, 0.5);
      img.data[o] = rr; img.data[o + 1] = gg; img.data[o + 2] = bb;
      img.data[o + 3] = Math.round(val * 210);
    }
    if (grid.blocked[i]) img.data[o + 3] = 0;
  }
  hc.putImageData(img, 0, 0);
  return heatCanvas;
}

export function drawHeat (ctx, v, r, grid, mode = 'load') {
  const hc = buildHeat(grid, mode);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(hc, v.ox, v.oy, r.w * v.s, r.h * v.s);
  ctx.restore();
}

function hsl (h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255 | 0, f(h) * 255 | 0, f(h - 1 / 3) * 255 | 0];
}

export function drawWalls (ctx, v, r) {
  const p = palette();
  for (const w of r.walls) {
    const a = toScreen(v, w.x1, w.y1), b = toScreen(v, w.x2, w.y2);
    const m = MATERIALS[w.material] ?? MATERIALS.plaster;
    ctx.strokeStyle = p.ink;
    // Hard walls are drawn heavy. You can see why a room is loud.
    ctx.lineWidth = 2 + m.reflect * 6;
    ctx.globalAlpha = 0.35 + m.reflect * 0.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawRoute (ctx, v, result) {
  if (!result || !result.path.length) return;
  const p = palette();
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeStyle = p.ink;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 9;
  ctx.beginPath();
  result.path.forEach((q, i) => {
    const s = toScreen(v, q.x, q.y);
    i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
  });
  ctx.stroke();

  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Where it ended, if it ended badly.
  if (!result.ok && result.at) {
    const s = toScreen(v, result.at.x, result.at.y);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ff6b5e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x - 7, s.y - 7); ctx.lineTo(s.x + 7, s.y + 7);
    ctx.moveTo(s.x + 7, s.y - 7); ctx.lineTo(s.x - 7, s.y + 7);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawThings (ctx, v, r, { held, hover } = {}) {
  const p = palette();
  for (const t of r.things) {
    if (!t.placed) continue;
    const D = def(t);
    const s = toScreen(v, t.x, t.y);
    const rad = D.r * v.s;
    const isHeld = held === t.id;
    const isHover = hover === t.id;

    ctx.save();
    ctx.globalAlpha = isHeld ? 0.55 : 1;

    // Footprint
    ctx.fillStyle = t.movable ? withAlpha(p.ink, 0.10) : withAlpha(p.inkSoft, 0.07);
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = D.refuge ? '#7fd4c1' : (t.movable ? p.ink : p.inkSoft);
    ctx.lineWidth = isHeld || isHover ? 2.4 : 1.3;
    ctx.globalAlpha = t.movable ? 0.9 : 0.45;
    if (!t.movable) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // A dot at the centre so small things are still grabbable by eye
    ctx.globalAlpha = 1;
    ctx.fillStyle = t.movable ? p.ink : p.inkSoft;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();

    if (rad > 16 || isHover || isHeld) {
      ctx.globalAlpha = isHover || isHeld ? 1 : 0.72;
      ctx.fillStyle = p.ink;
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(D.label, s.x, s.y + rad + 14);
    }
    ctx.restore();
  }
}

/** The door and the counter, named, so the trip is legible. */
export function drawMarkers (ctx, v, r) {
  const p = palette();
  ctx.save();
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.14em';
  for (const [pt, label] of [[r.door, 'IN'], [r.goal, 'ORDER']]) {
    const s = toScreen(v, pt.x, pt.y);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = p.inkSoft;
    ctx.fillText(label, s.x, s.y - 22);
  }
  ctx.letterSpacing = '0px';
  ctx.restore();
}
