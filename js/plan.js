/**
 * Drawing a room.
 *
 * Top down, architectural rather than pictorial. The heatmap is the point:
 * everything else exists so you can tell what is causing it.
 */

import { palette, settings, withAlpha } from './config.js';
import { def, KINDS, MATERIALS } from './room.js';
import {
  spriteFor, blitSprite, shadowUnder, drawFloor, drawWallsPixel,
  drawRoutePixel, drawStopMark, drawSelectRing
} from './planart.js';

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
let heatKey = null;
let glowCanvas = null, glowKey = null;

/**
 * The load field as a glow rather than a wash.
 *
 * The survey colouring paints every square, including the fine ones, which
 * over a wooden floor turns the whole plan a flat sickly green. Here calm is
 * simply transparent — you see the room — and the colour only arrives as the
 * load climbs. Same numbers, and much easier to read at a glance because
 * your eye goes to the part that is wrong.
 */
export function buildGlow (grid, mode = 'load', stamp = null) {
  const key = stamp == null ? null : `${mode}:${stamp}:${grid.cols}x${grid.rows}`;
  if (key && key === glowKey && glowCanvas) return glowCanvas;
  glowKey = key;
  if (!glowCanvas) glowCanvas = document.createElement('canvas');
  if (glowCanvas.width !== grid.cols || glowCanvas.height !== grid.rows) {
    glowCanvas.width = grid.cols;
    glowCanvas.height = grid.rows;
  }
  const gc = glowCanvas.getContext('2d');
  const img = gc.createImageData(grid.cols, grid.rows);
  const src = mode === 'load' ? grid.load : grid.layers[mode];
  // Below this a room is comfortable and should just look like a room. Set
  // at the point where a visit starts costing reserve rather than at zero,
  // so a fixed room reads as wood and daylight instead of pale orange.
  const FLOOR_CLEAR = 0.26;

  for (let i = 0; i < src.length; i++) {
    const val = Math.max(0, Math.min(1, src[i]));
    const o = i * 4;
    const over = (val - FLOOR_CLEAR) / (1 - FLOOR_CLEAR);
    if (over <= 0 || grid.blocked[i]) { img.data[o + 3] = 0; continue; }
    const [rr, gg, bb] = mode === 'load'
      ? hsl(58 - over * 58, 0.82, 0.52)         // straw, through amber, to red
      : hsl(DOMAIN_COLOR[mode] ?? 200, 0.78, 0.55);
    img.data[o] = rr; img.data[o + 1] = gg; img.data[o + 2] = bb;
    img.data[o + 3] = Math.round(Math.min(1, over * 1.25) * 205);
  }
  gc.putImageData(img, 0, 0);
  return glowCanvas;
}

export function buildHeat (grid, mode = 'load', stamp = null) {
  // Only redraw when the field actually changed. The plan view runs at 60fps
  // and the survey does not.
  const key = stamp == null ? null : `${mode}:${stamp}:${grid.cols}x${grid.rows}`;
  if (key && key === heatKey && heatCanvas) return heatCanvas;
  heatKey = key;
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

export function drawHeat (ctx, v, r, grid, mode = 'load', stamp = null) {
  const hc = buildHeat(grid, mode, stamp);
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


/* ------------------------------------------------------------------ */
/* The pixel plan                                                      */
/* ------------------------------------------------------------------ */

/*
 * One low-resolution buffer, reused between frames, blown up with nearest
 * neighbour at the end. The zoom is always a whole number so a sprite pixel
 * is always a square block of screen pixels — the moment that stops being
 * true it stops looking like pixel art and starts looking like a small
 * picture someone stretched.
 */
let buf = null, bctx = null;

/** Screen size in, buffer size and zoom out. */
function bufferFor (vw, vh) {
  const zoom = Math.max(2, Math.min(6, Math.round(vw / 300)));
  const bw = Math.ceil(vw / zoom), bh = Math.ceil(vh / zoom);
  if (!buf) { buf = document.createElement('canvas'); bctx = buf.getContext('2d'); }
  if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
  return { zoom, bw, bh };
}

/**
 * Draw the room as a small top-down scene.
 *
 * Order matters and is the usual one for this kind of view: ground, then the
 * survey painted onto it, then walls, then anything lying flat, then the
 * route, then everything standing up sorted back to front so nearer objects
 * overlap further ones. Labels are deliberately not in here — they go on
 * afterwards at full resolution, because five-pixel-tall type is charming
 * right up until you need to read it.
 */
export function renderPixelPlan (ctx, vw, vh, room, grid, opts = {}) {
  const { mode = 'load', result = null, held = null, hover = null, stamp = null } = opts;
  const { zoom, bw, bh } = bufferFor(vw, vh);
  const g = bctx;

  // Fit the room into the buffer, in buffer pixels per centimetre.
  const pad = 10;
  const s = Math.min((bw - pad * 2) / room.w, (bh - pad * 2) / room.h);
  const ox = (bw - room.w * s) / 2, oy = (bh - room.h * s) / 2;
  const toBuf = (x, y) => ({ x: ox + x * s, y: oy + y * s });

  g.clearRect(0, 0, bw, bh);
  g.fillStyle = '#141c24';
  g.fillRect(0, 0, bw, bh);

  // Ground, with a tile every 90cm or so.
  drawFloor(g, Math.round(ox), Math.round(oy),
            Math.round(room.w * s), Math.round(room.h * s), 60 * s);

  // The survey, in cells. Calm is transparent, so a room you have fixed
  // looks like a room and not like a weather map.
  const glow = buildGlow(grid, mode, stamp);
  g.save();
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 0.8;
  g.drawImage(glow, Math.round(ox), Math.round(oy),
              Math.round(room.w * s), Math.round(room.h * s));
  g.restore();

  drawWallsPixel(g, room, toBuf, Math.max(2, 12 * s));

  // Flat things first: a rug is underfoot, not furniture.
  const flat = t => t.kind === 'rug';
  for (const pass of [true, false]) {
    const items = room.things
      .filter(t => t.placed && flat(t) === pass)
      .sort((a, b) => a.y - b.y);

    for (const t of items) {
      const D = def(t);
      const p = toBuf(t.x, t.y);
      const rows = spriteFor(t.kind);
      // Footprint in buffer pixels, never smaller than the sprite can show.
      const w = Math.max(rows[0].length * 0.6, D.r * 2 * s);
      const h = w * (rows.length / rows[0].length);
      const x = p.x - w / 2, y = p.y - h / 2;

      if (!pass) shadowUnder(g, p.x, p.y, w, h);
      blitSprite(g, rows, x, y, w, h);

      if (t.id === held || t.id === hover) {
        drawSelectRing(g, p.x, p.y, Math.max(w, h) / 2 + 2,
                       t.id === held ? '#ffe9a8' : '#cfe0f0');
      }
    }
    if (pass && result) {
      drawRoutePixel(g, result.path, toBuf, result.ok);
    }
  }

  if (result && !result.ok && result.at) {
    const p = toBuf(result.at.x, result.at.y);
    drawStopMark(g, p.x, p.y);
  }

  // Blow it up. Nothing between the buffer and the screen but whole pixels.
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0, bw, bh, 0, 0, bw * zoom, bh * zoom);
  ctx.restore();

  return { s: s * zoom, ox: ox * zoom, oy: oy * zoom };
}

/**
 * Names, at a size you can actually read.
 *
 * Drawn after the upscale in a normal font with a hard shadow, which is what
 * the genre does — the scene is pixels, the interface is not.
 */
const LANDMARKS = new Set(['counter', 'door', 'shelf', 'window']);

export function drawPixelLabels (ctx, v, room, { hover, held } = {}) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
  for (const t of room.things) {
    if (!t.placed) continue;
    const D = def(t);
    const near = t.id === hover || t.id === held;
    // Everything named at once is noise, and the names collide. Only the
    // things you navigate by stay labelled; the rest speaks when pointed at.
    const landmark = LANDMARKS.has(t.kind);
    if (!near && !landmark) continue;
    const x = v.ox + t.x * v.s, y = v.oy + t.y * v.s + D.r * v.s + 15;
    ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.fillText(D.label, x + 1, y + 1);
    ctx.fillStyle = near ? '#ffe9a8' : '#e6ecf2';
    ctx.fillText(D.label, x, y);
  }

  ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.letterSpacing = '0.14em';
  for (const [pt, label] of [[room.door, 'IN'], [room.goal, 'ORDER']]) {
    const x = v.ox + pt.x * v.s, y = v.oy + pt.y * v.s - 20;
    ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.fillText(label, x + 1, y + 1);
    ctx.fillStyle = '#9fd6c6';
    ctx.fillText(label, x, y);
  }
  ctx.letterSpacing = '0px';
  ctx.restore();
}
