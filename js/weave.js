/**
 * The weave: nodes joined by strands, where a strand may itself contain
 * another whole weave.
 *
 * The rule that makes the game work is here, in effectiveFreq(). A strand
 * that contains other strands does not have a frequency of its own. It is
 * the average of what it holds. You cannot change it from outside. You have
 * to go in.
 */

import { freqMean, freqDistance, RULES, settings } from './config.js';

let uid = 0;
const nid = () => `n${++uid}`;
const sid = () => `s${++uid}`;

export function node (x, y, kind = 'plain', label = '') {
  return { id: nid(), x, y, kind, label, pulse: 0 };
}

export function strand (a, b, opts = {}) {
  return {
    id: sid(),
    a, b,
    base: opts.freq ?? 0.5,
    inner: opts.inner ?? null,
    locked: opts.locked ?? false,
    affinity: opts.affinity ?? false,
    bow: opts.bow ?? 0,
    tunes: 0,
    unfurl: 1,
    lit: 0
  };
}

export function weave (nodes, strands, opts = {}) {
  return {
    nodes,
    strands,
    source: opts.source ?? null,
    bloom: opts.bloom ?? null,
    seedFreq: opts.seedFreq ?? 0
  };
}

/**
 * What a strand actually is, from outside.
 * A leaf strand is its own base frequency, rotated by however many times it
 * has been tuned. A strand with contents is the circular mean of its contents.
 */
export function effectiveFreq (s) {
  if (s.inner && s.inner.strands.length) {
    return freqMean(s.inner.strands.map(effectiveFreq));
  }
  return ((s.base + s.tunes * RULES.tuneStep) % 1 + 1) % 1;
}

export function isLeaf (s) {
  return !s.inner || s.inner.strands.length === 0;
}

export function canTune (s) {
  return isLeaf(s) && !s.locked;
}

export function tune (s, dir) {
  if (!canTune(s)) return false;
  s.tunes += dir;
  return true;
}

export function findNode (w, id) {
  return w.nodes.find(n => n.id === id) ?? null;
}

/** Every strand touching a node. */
export function strandsAt (w, nodeId) {
  return w.strands.filter(s => s.a === nodeId || s.b === nodeId);
}

export function otherEnd (s, nodeId) {
  return s.a === nodeId ? s.b : s.a;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** Cheap deterministic noise so a strand always wobbles the same way. */
function hash (n) {
  let x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const SAMPLES = 26;

/**
 * Sample a strand into a polyline. Strands bow rather than run straight, and
 * drift very slightly over time so the world reads as alive rather than
 * diagrammatic. Motion setting scales the drift to zero.
 */
export function strandPath (w, s, time = 0) {
  const A = findNode(w, s.a);
  const B = findNode(w, s.b);
  if (!A || !B) return [];

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const seed = parseInt(s.id.slice(1), 10) || 1;
  const bow = s.bow * len;
  const cx = (A.x + B.x) / 2 + nx * bow;
  const cy = (A.y + B.y) / 2 + ny * bow;

  const drift = settings.motion * 2.2;
  const pts = [];
  const upto = Math.max(2, Math.round(SAMPLES * s.unfurl));

  for (let i = 0; i < upto; i++) {
    const t = i / (SAMPLES - 1);
    const mt = 1 - t;
    let x = mt * mt * A.x + 2 * mt * t * cx + t * t * B.x;
    let y = mt * mt * A.y + 2 * mt * t * cy + t * t * B.y;

    // Taper the wobble to nothing at both ends so joints stay clean.
    const env = Math.sin(t * Math.PI);
    const ph = hash(seed + i * 0.37) * Math.PI * 2;
    const w1 = Math.sin(time * 0.0011 + ph) * drift * env;
    const w2 = Math.sin(time * 0.0007 + ph * 1.7) * drift * 0.6 * env;
    x += nx * w1 + (hash(seed * 3 + i) - 0.5) * env * 1.6;
    y += ny * w1 + w2 * 0.2 + (hash(seed * 7 + i) - 0.5) * env * 1.6;

    pts.push({ x, y, t });
  }
  return pts;
}

/** Distance from a point to a sampled strand, for hit testing. */
export function distToPath (pts, px, py) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = px - a.x, wy = py - a.y;
    const L = vx * vx + vy * vy;
    let t = L ? (wx * vx + wy * vy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t));
    if (d < best) best = d;
  }
  return best;
}

export function pathPoint (pts, t) {
  if (!pts.length) return { x: 0, y: 0 };
  const i = Math.min(pts.length - 1, Math.max(0, Math.floor(t * (pts.length - 1))));
  return pts[i];
}

/** Centre of a weave's contents, used when the camera moves inward. */
export function weaveBounds (w) {
  if (!w.nodes.length) return { x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of w.nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
  }
  return {
    x: x0, y: y0, w: x1 - x0, h: y1 - y0,
    cx: (x0 + x1) / 2, cy: (y0 + y1) / 2
  };
}

/* ------------------------------------------------------------------ */
/* Solving                                                             */
/* ------------------------------------------------------------------ */

/**
 * Walk the signal outward from the source. A strand carries the signal when
 * its frequency sits close enough to whatever the signal currently is, and
 * the signal adopts that frequency as it passes. So a route is a chain of
 * small shifts, not a single match.
 *
 * Returns the ordered path of strand ids the signal took, or null.
 */
export function solve (w) {
  if (!w.source || !w.bloom) return null;

  const start = { node: w.source, freq: w.seedFreq, path: [], seen: new Set() };
  const queue = [start];
  const best = new Map();

  while (queue.length) {
    const cur = queue.shift();
    if (cur.node === w.bloom) return cur.path;

    for (const s of strandsAt(w, cur.node)) {
      if (cur.seen.has(s.id)) continue;
      const f = effectiveFreq(s);
      if (freqDistance(cur.freq, f) > RULES.tolerance) continue;

      const next = otherEnd(s, cur.node);
      const key = `${next}:${f.toFixed(3)}`;
      if (best.has(key)) continue;
      best.set(key, true);

      const seen = new Set(cur.seen);
      seen.add(s.id);
      queue.push({ node: next, freq: f, path: [...cur.path, s.id], seen });
    }
  }
  return null;
}

/** Which strands are currently carrying, for rendering. */
export function litStrands (w) {
  const p = solve(w);
  return p ? new Set(p) : new Set();
}

/**
 * What frequency the signal would arrive with at a given strand.
 *
 * This is what makes descending worth it. From outside, a strand is simply
 * wrong. From inside, you can be shown the exact band it has to land in.
 */
export function requirementFor (w, strandId) {
  if (!w.source) return null;
  const target = w.strands.find(s => s.id === strandId);
  if (!target) return null;

  const visited = new Map([[w.source, w.seedFreq]]);
  const queue = [{ node: w.source, freq: w.seedFreq }];

  while (queue.length) {
    const cur = queue.shift();
    if (cur.node === target.a || cur.node === target.b) return cur.freq;

    for (const s of strandsAt(w, cur.node)) {
      if (s.id === strandId) continue;
      const f = effectiveFreq(s);
      if (freqDistance(cur.freq, f) > RULES.tolerance) continue;
      const next = otherEnd(s, cur.node);
      if (visited.has(next)) continue;
      visited.set(next, f);
      queue.push({ node: next, freq: f });
    }
  }
  // Unreachable for now, so aim at whatever the source is putting out.
  return w.seedFreq;
}

/**
 * A hint that does not solve the puzzle for you: which strand on the frontier
 * is closest to carrying, and how far off it is.
 */
export function frontier (w) {
  if (!w.source) return null;
  const visited = new Set([w.source]);
  const queue = [{ node: w.source, freq: w.seedFreq }];
  let nearest = null;

  while (queue.length) {
    const cur = queue.shift();
    for (const s of strandsAt(w, cur.node)) {
      const f = effectiveFreq(s);
      const d = freqDistance(cur.freq, f);
      if (d <= RULES.tolerance) {
        const next = otherEnd(s, cur.node);
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({ node: next, freq: f });
        }
      } else if (!nearest || d < nearest.off) {
        nearest = { strand: s, off: d, need: cur.freq };
      }
    }
  }
  return nearest;
}
