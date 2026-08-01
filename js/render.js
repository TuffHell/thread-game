/**
 * Rendering.
 *
 * Strands are drawn as tapered ribbons rather than stroked lines, so they
 * read as grown rather than plotted. Everything that glows is optional and
 * switches off cleanly, because a world that can only be legible when it is
 * shining is a world some people cannot use.
 */

import { palette, freqColor, settings, withAlpha, LENS, RULES, STIM } from './config.js';
import { strandPath, effectiveFreq, isLeaf, canTune, findNode } from './weave.js';
import { makeTransform } from './camera.js';

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */

// Marine snow. Drifts downward slowly and sideways with the current.
const motes = [];
// Bubbles. Rise, wobble, and are rare enough to be a small event.
const bubbles = [];

function seedWater (n) {
  motes.length = 0;
  for (let i = 0; i < n; i++) {
    motes.push({
      x: Math.random(), y: Math.random(),
      r: 0.5 + Math.random() * 2.1,
      sp: 0.15 + Math.random() * 0.5,
      ph: Math.random() * Math.PI * 2,
      a: 0.06 + Math.random() * 0.16
    });
  }
  bubbles.length = 0;
  for (let i = 0; i < 14; i++) {
    bubbles.push({
      x: Math.random(), y: Math.random(),
      r: 1.1 + Math.random() * 3.4,
      sp: 0.55 + Math.random() * 1.5,
      ph: Math.random() * Math.PI * 2
    });
  }
}
seedWater(120);

/**
 * Water swallows long wavelengths first. Red goes within a few metres, then
 * orange, then yellow, and what is left further down is blue and green.
 *
 * So descending does not tint the picture, it removes part of it. Depth is
 * legible from the colour of the world before you look at any gauge.
 */
export function depthTint (depth) {
  const d = Math.min(1, depth / 3);
  return {
    warmth: 1 - d * 0.82,       // how much of the red end survives
    darken: 1 - d * 0.34,
    blue: d
  };
}

let tint = depthTint(0);
export function setDepthTint (depth) {
  const want = depthTint(depth);
  // Eased so a descent reads as sinking rather than a cut.
  tint.warmth += (want.warmth - tint.warmth) * 0.045;
  tint.darken += (want.darken - tint.darken) * 0.045;
  tint.blue += (want.blue - tint.blue) * 0.045;
}

/** Shafts of light coming down from a surface somewhere above. */
function caustics (ctx, vw, vh, time, p) {
  if (p.glow <= 0 || settings.glow <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const drift = settings.motion > 0 ? time * 0.00006 : 0;

  for (let i = 0; i < 7; i++) {
    const seed = i * 1.7;
    const x = ((i / 7) + Math.sin(drift + seed) * 0.06) * vw;
    const w = vw * (0.05 + (i % 3) * 0.035);
    const lean = vw * 0.10 * Math.sin(drift * 1.4 + seed);
    const strength = (0.058 + 0.040 * Math.sin(drift * 2.6 + seed))
      * settings.glow * tint.darken;

    const g = ctx.createLinearGradient(x, 0, x + lean, vh * 0.92);
    g.addColorStop(0, withAlpha(p.bgGlow, strength * 2.2));
    g.addColorStop(0.55, withAlpha(p.bgGlow, strength));
    g.addColorStop(1, withAlpha(p.bgGlow, 0));

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, 0);
    ctx.lineTo(x + w / 2, 0);
    ctx.lineTo(x + lean + w * 1.5, vh);
    ctx.lineTo(x + lean - w * 1.5, vh);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function background (ctx, vw, vh, time, focus, depth = 0) {
  const p = palette();
  setDepthTint(depth);

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, vw, vh);

  if (p.glow > 0) {
    // Light comes from above and from wherever you are looking, and less of
    // both reaches you the further down you have gone.
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, withAlpha(p.bgGlow, 0.85 * tint.darken));
    g.addColorStop(1, withAlpha(p.bg, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    const fx = focus ? focus.x : vw / 2;
    const fy = focus ? focus.y : vh / 2;
    const r = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(vw, vh) * 0.7);
    r.addColorStop(0, withAlpha(p.bgGlow, 0.55 * tint.darken));
    r.addColorStop(1, withAlpha(p.bgGlow, 0));
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, vw, vh);
  }

  caustics(ctx, vw, vh, time, p);

  if (settings.motion > 0) {
    const t = time * settings.motion;
    ctx.save();
    if (p.glow > 0) ctx.globalCompositeOperation = 'lighter';

    for (const m of motes) {
      const y = (m.y + t * 0.0000075 * m.sp) % 1;
      const x = (m.x + Math.sin(t * 0.00022 + m.ph) * 0.02 + 1) % 1;
      ctx.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(t * 0.0009 + m.ph)) * tint.darken;
      ctx.fillStyle = p.inkSoft;
      ctx.beginPath();
      ctx.arc(x * vw, y * vh, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const b of bubbles) {
      const y = 1 - ((b.y + t * 0.000022 * b.sp) % 1);
      const x = (b.x + Math.sin(t * 0.0016 + b.ph) * 0.008 + 1) % 1;
      const px = x * vw, py = y * vh;
      ctx.globalAlpha = 0.20 * tint.darken;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.14 * tint.darken;
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(px - b.r * 0.3, py - b.r * 0.3, b.r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/**
 * A colour as it survives at the current depth.
 *
 * Warm hues lose most, cool hues barely notice, and what is lost bends toward
 * cyan rather than simply dimming. The composite meter deliberately does not
 * use this: an instrument you are reading has to stay accurate even when the
 * water is lying to you.
 */
export function waterColor (freq, lightMul = 1, alpha = 1) {
  const p = palette();
  let h = ((freq % 1) + 1) % 1 * 360;

  const warmness = (Math.cos((h - 20) * Math.PI / 180) + 1) / 2;
  const loss = (1 - tint.warmth) * warmness;

  let dh = ((190 - h + 540) % 360) - 180;
  h += dh * loss * 0.55;

  const s = p.sat * (1 - loss * 0.42) * 100;
  const l = Math.min(0.92, p.light * lightMul * (1 - loss * 0.20)) * 100;
  return `hsla(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}% / ${alpha})`;
}

/** A tapered filled shape along a polyline. */
function ribbon (ctx, pts, halfWidth, envelope = true) {
  if (pts.length < 2) return;
  const up = [], dn = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const env = envelope ? 0.32 + 0.68 * Math.sin(pts[i].t * Math.PI) : 1;
    const w = halfWidth * env;
    up.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    dn.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }
  ctx.beginPath();
  ctx.moveTo(up[0].x, up[0].y);
  for (let i = 1; i < up.length; i++) ctx.lineTo(up[i].x, up[i].y);
  for (let i = dn.length - 1; i >= 0; i--) ctx.lineTo(dn[i].x, dn[i].y);
  ctx.closePath();
  ctx.fill();
}

function screenPts (pts, tf) {
  return pts.map(p => {
    const s = tf.toScreen(p.x, p.y);
    return { x: s.x, y: s.y, t: p.t };
  });
}

function drawStrand (ctx, view, s, tf, time) {
  const p = palette();
  const raw = strandPath(view.weave, s, time);
  if (raw.length < 2) return null;
  const pts = screenPts(raw, tf);

  const freq = effectiveFreq(s);
  const lit = view.lit.has(s.id);
  const focused = view.focusStrand === s.id;
  const container = !isLeaf(s);

  const base = (container ? 6.4 : 4.2) * Math.max(0.55, Math.min(1.9, tf.scale));
  const w = base * (focused ? 1.5 : 1) * (lit ? 1.22 : 1);

  ctx.save();
  ctx.globalAlpha = view.alpha * (s.locked ? 0.5 : 1);

  // Halo
  if (p.glow > 0 && settings.glow > 0 && (lit || focused)) {
    ctx.globalCompositeOperation = 'lighter';
    const passes = lit ? 3 : 2;
    for (let i = passes; i > 0; i--) {
      ctx.fillStyle = waterColor(freq, 1.25, 0.055 * settings.glow * view.alpha);
      ribbon(ctx, pts, w * (1 + i * 1.5));
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Core
  ctx.fillStyle = lit
    ? waterColor(freq, 1.45, view.alpha)
    : waterColor(freq, focused ? 1.1 : 0.82, view.alpha * (container ? 0.95 : 0.88));
  ribbon(ctx, pts, w);

  // A locked strand is visibly bound: it reads as unavailable without
  // needing a colour that means "error".
  if (s.locked) {
    ctx.globalAlpha = view.alpha * 0.85;
    ctx.strokeStyle = p.inkSoft;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // A container is drawn with an inner seam, hinting that it is a bundle
  // rather than a single thing, before you ever descend.
  if (container) {
    ctx.globalAlpha = view.alpha * 0.5;
    ctx.fillStyle = p.bg;
    ribbon(ctx, pts, w * 0.28);
  }

  // Affinity strands breathe. Kept saturated rather than bright, so it reads
  // as the one you are drawn to instead of the one that is important.
  if (s.affinity) {
    const pulse = settings.motion > 0 ? 0.5 + 0.5 * Math.sin(time * 0.0016) : 0.5;
    ctx.globalAlpha = view.alpha * (0.14 + pulse * 0.16) * (p.glow > 0 ? 1 : 0.6);
    ctx.globalCompositeOperation = p.glow > 0 ? 'lighter' : 'source-over';
    ctx.fillStyle = waterColor(freq, 1.05, 1);
    ribbon(ctx, pts, w * (1.8 + pulse * 0.9));
    ctx.globalCompositeOperation = 'source-over';
  }

  // Signal moving along a carrying strand.
  if (lit && settings.motion > 0) {
    ctx.globalAlpha = view.alpha;
    ctx.globalCompositeOperation = p.glow > 0 ? 'lighter' : 'source-over';
    const count = 3;
    for (let i = 0; i < count; i++) {
      const t = ((time * 0.00035 * settings.motion + i / count) % 1);
      const idx = Math.floor(t * (pts.length - 1));
      const q = pts[idx];
      if (!q) continue;
      ctx.fillStyle = waterColor(freq, 1.7, 0.9);
      ctx.beginPath();
      ctx.arc(q.x, q.y, w * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();
  return pts;
}

function drawNode (ctx, view, n, tf, time) {
  const p = palette();
  const s = tf.toScreen(n.x, n.y);
  const scale = Math.max(0.6, Math.min(1.8, tf.scale));
  const special = n.kind === 'source' || n.kind === 'bloom';
  const r = (n.kind === 'anchor' ? 4 : special ? 10 : 6) * scale;

  ctx.save();
  ctx.globalAlpha = view.alpha;

  if (special && p.glow > 0 && settings.glow > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.0012 + (n.kind === 'bloom' ? Math.PI : 0));
    // Coloured by what the source is putting out, so the target frequency is
    // visible on the board itself rather than only in a meter.
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * (5 + pulse * 2));
    g.addColorStop(0, waterColor(view.weave.seedFreq, 1.0, 0.55 * settings.glow));
    g.addColorStop(0.5, waterColor(view.weave.seedFreq, 0.9, 0.18 * settings.glow));
    g.addColorStop(1, waterColor(view.weave.seedFreq, 0.9, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * (5 + pulse * 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // The source is solid, because it is already giving. The bloom stays hollow
  // until the signal actually reaches it, so the goal reads as unfinished
  // from across the board without needing a colour or a label to say so.
  const hollow = n.kind === 'bloom' && !view.solved;

  ctx.fillStyle = n.kind === 'anchor' ? p.anchor : p.node;
  if (hollow) {
    ctx.strokeStyle = p.node;
    ctx.lineWidth = 2.2 * scale;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (special) {
    ctx.strokeStyle = p.node;
    ctx.lineWidth = 1.4 * scale;
    ctx.globalAlpha = view.alpha * 0.55;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 2.1, 0, Math.PI * 2);
    ctx.stroke();

    if (n.kind === 'bloom' && view.solved) {
      ctx.globalAlpha = view.alpha * 0.9;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 3.4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Named, because "which end am I trying to reach" should never be a puzzle.
    ctx.globalAlpha = view.alpha * 0.6;
    ctx.fillStyle = p.inkSoft;
    ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.14em';
    ctx.fillText(n.kind.toUpperCase(), s.x, s.y + r * 2.1 + 16);
    ctx.letterSpacing = '0px';
  }
  ctx.restore();
}

/**
 * The lens. Sight is clear where attention has settled and soft everywhere
 * else, and it sharpens the longer you hold still. This is the one visual
 * idea the whole game rests on, so it is drawn last and over everything.
 */
export function drawLens (ctx, vw, vh, focus, sharpness) {
  if (!settings.lens || !focus) return;
  const p = palette();
  const min = Math.min(vw, vh);
  const core = min * LENS.coreRadius * (0.75 + sharpness * 0.55);
  const outer = core + min * LENS.falloff;

  const floor = LENS.peripheryFloor * (1 - sharpness * 0.35);
  const g = ctx.createRadialGradient(focus.x, focus.y, core, focus.x, focus.y, outer);
  g.addColorStop(0, withAlpha(p.bg, 0));
  g.addColorStop(0.55, withAlpha(p.bg, 0.55));
  g.addColorStop(1, withAlpha(p.bg, 1));

  ctx.save();
  ctx.globalAlpha = Math.min(0.92, 1 - floor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
  ctx.restore();
}

/**
 * The composite meter, shown only while you are inside a bundle.
 *
 * This is the reward for descending: from out there the strand was simply
 * wrong, and from in here you can see exactly what it needs to become and
 * how far off it currently is.
 */
export function drawComposite (ctx, vw, vh, comp) {
  if (!comp) return;
  const p = palette();
  const w = Math.min(520, vw - 96);
  const h = 8;
  const x = (vw - w) / 2;
  // Lifts clear of the interruption card rather than being buried by it.
  const y = vh - 96 - (comp.lift ?? 0);

  ctx.save();

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = p.surface;
  ctx.beginPath();
  ctx.roundRect(x - 22, y - 34, w + 44, h + 62, 14);
  ctx.fill();
  ctx.globalAlpha = 1;

  // The wheel laid flat.
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  for (let i = 0; i <= 12; i++) {
    grad.addColorStop(i / 12, freqColor(i / 12, 0.9, 0.55));
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();

  // Nothing inside the affinity strand is on the way anywhere, so it gets no
  // gate to aim at. Telling the player to bring it somewhere would undercut
  // the one place in the level that is theirs.
  if (comp.affinity) {
    const curX = x + ((comp.current % 1) + 1) % 1 * w;
    ctx.globalAlpha = 1;
    ctx.fillStyle = freqColor(comp.current, 1.5, 1);
    ctx.beginPath();
    ctx.arc(curX, y + h / 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = p.inkSoft;
    ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('nothing here is needed. attention returns faster.', vw / 2, y + h + 24);
    ctx.restore();
    return;
  }

  // The band this strand has to land inside. Drawn as a gate rather than a
  // block, so the colour underneath stays readable.
  const bandX = x + ((comp.need % 1) + 1) % 1 * w;
  const bandW = Math.max(12, RULES.tolerance * 2 * w);
  const bl = bandX - bandW / 2;
  const br = bandX + bandW / 2;

  ctx.globalAlpha = comp.inBand ? 0.26 : 0.14;
  ctx.fillStyle = p.ink;
  ctx.fillRect(bl, y - 6, bandW, h + 12);

  ctx.globalAlpha = comp.inBand ? 1 : 0.72;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const gx of [bl, br]) {
    ctx.beginPath();
    ctx.moveTo(gx, y - 9);
    ctx.lineTo(gx, y + h + 9);
    ctx.stroke();
  }

  // Where the bundle currently averages out.
  const curX = x + ((comp.current % 1) + 1) % 1 * w;
  ctx.globalAlpha = 1;
  ctx.fillStyle = freqColor(comp.current, 1.5, 1);
  ctx.beginPath();
  ctx.arc(curX, y + h / 2, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // A caret so the marker is findable without relying on colour.
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.moveTo(curX, y - 12);
  ctx.lineTo(curX - 5, y - 20);
  ctx.lineTo(curX + 5, y - 20);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = comp.inBand ? p.ink : p.inkSoft;
  ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    comp.inBand
      ? 'this bundle now carries'
      : 'bring the bundle between the marks',
    vw / 2, y + h + 24
  );
  ctx.restore();
}

/**
 * Masking, drawn as a flatness laid over the whole world.
 *
 * Not a filter that makes things look wrong. A slight evenness, everything a
 * touch more the same as everything else, which is what presenting as fine
 * actually costs: not pain, just less of you reaching the surface.
 */
export function drawMask (ctx, vw, vh, on, time) {
  if (!on) return;
  const p = palette();
  ctx.save();
  ctx.globalAlpha = 0.30;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, vw, vh);

  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = p.inkSoft;
  ctx.lineWidth = 1;
  ctx.setLineDash([1, 7]);
  ctx.strokeRect(6, 6, vw - 12, vh - 12);
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = p.inkSoft;
  ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.2em';
  ctx.fillText('MASKED', vw / 2, 22);
  ctx.letterSpacing = '0px';
  ctx.restore();
}

/**
 * Stimming. A steady repeating motion that does nothing to the puzzle.
 * It is drawn generously because it is the one thing here that is purely
 * for the player, and it should feel like it.
 */
export function drawStim (ctx, vw, vh, on, focus, time) {
  if (!on || !focus) return;
  const p = palette();
  ctx.save();
  ctx.globalCompositeOperation = p.glow > 0 ? 'lighter' : 'source-over';

  const min = Math.min(vw, vh);
  for (let i = 0; i < 4; i++) {
    const phase = (time * STIM.rippleSpeed + i / 4) % 1;
    const r = phase * min * 0.42;
    ctx.globalAlpha = (1 - phase) * 0.22 * (p.glow > 0 ? 1 : 0.7);
    ctx.strokeStyle = p.glow > 0 ? '#7fd4c1' : p.inkSoft;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(focus.x, focus.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** The ring that fills while you hold attention on a strand. */
export function drawDescentRing (ctx, focus, progress, remembered) {
  if (!focus || progress <= 0) return;
  const p = palette();
  const r = 26;
  ctx.save();
  ctx.translate(focus.x, focus.y);

  ctx.globalAlpha = 0.30;
  ctx.strokeStyle = p.inkSoft;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();

  if (remembered) {
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** Draw one weave at one camera. Returns screen paths for hit testing. */
export function drawWeave (ctx, view, vw, vh, time) {
  const tf = makeTransform(view.cam, vw, vh);
  const paths = new Map();

  for (const s of view.weave.strands) {
    const pts = drawStrand(ctx, view, s, tf, time);
    if (pts) paths.set(s.id, pts);
  }
  for (const n of view.weave.nodes) {
    drawNode(ctx, view, n, tf, time);
  }
  return { paths, tf };
}
