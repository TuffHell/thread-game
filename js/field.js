/**
 * The sensory field.
 *
 * Every domain is a scalar grid computed from the geometry of the room, so
 * moving one object changes several layers at once and never in the same way.
 * That interference is where the puzzle lives. Nothing here is authored by
 * hand; if a corner is bad it is bad because of what is near it.
 *
 * The physics is deliberately approximate and deliberately explainable. Sound
 * falls off with distance, loses energy through walls, and gains a reverb term
 * near hard surfaces. That is enough to be right about which corner of a tiled
 * café is unbearable, which is the only thing the game needs it to be right
 * about. Anything fancier would be a claim we could not defend.
 */

import {
  def, transmission, seesThrough, hardSurfaceNear, pointToSegment, MATERIALS
} from './room.js';

export const DOMAINS = ['sound', 'light', 'flicker', 'glare', 'crowd', 'clutter', 'escape', 'exposure'];

/** How much each domain hurts. A visitor profile can override this. */
export const DEFAULT_WEIGHTS = {
  sound: 1.0, light: 0.5, flicker: 0.9, glare: 0.6,
  crowd: 0.85, clutter: 0.4, escape: 0.7, exposure: 0.45
};

export function makeGrid (r, cell = 12) {
  const cols = Math.ceil(r.w / cell);
  const rows = Math.ceil(r.h / cell);
  const layers = {};
  for (const d of DOMAINS) layers[d] = new Float32Array(cols * rows);
  return {
    cell, cols, rows, layers,
    blocked: new Uint8Array(cols * rows),
    load: new Float32Array(cols * rows),
    cx: i => (i % cols + 0.5) * cell,
    cy: i => (Math.floor(i / cols) + 0.5) * cell,
    at: (x, y) => {
      const c = Math.max(0, Math.min(cols - 1, Math.floor(x / cell)));
      const rr = Math.max(0, Math.min(rows - 1, Math.floor(y / cell)));
      return rr * cols + c;
    }
  };
}

function falloff (d, radius) {
  if (d >= radius) return 0;
  // Inverse square, softened near zero so a source is not infinite at its centre.
  const n = d / radius;
  return Math.max(0, 1 / (1 + 9 * n * n) - 0.1) / 0.9;
}

/**
 * What you cannot walk through. A quiet corner is emphatically not on this
 * list: it is somewhere you go into, and treating it as an obstacle made the
 * escape search start inside a sealed box and conclude there was no refuge.
 */
function blockedBy (t) {
  return t.kind === 'counter';
}

export function compute (r, grid) {
  const { cols, rows, cell, layers } = grid;
  for (const d of DOMAINS) layers[d].fill(0);
  grid.blocked.fill(0);

  const placed = r.things.filter(t => t.placed);

  // What you cannot walk through.
  for (let i = 0; i < grid.blocked.length; i++) {
    const x = grid.cx(i), y = grid.cy(i);
    for (const w of r.walls) {
      if (pointToSegment(x, y, w.x1, w.y1, w.x2, w.y2) < cell * 0.7) { grid.blocked[i] = 1; break; }
    }
    if (grid.blocked[i]) continue;
    for (const t of placed) {
      if (!blockedBy(t)) continue;
      if (Math.hypot(x - t.x, y - t.y) < def(t).r * 0.85) { grid.blocked[i] = 1; break; }
    }
  }

  // Emitters and absorbers.
  for (let i = 0; i < cols * rows; i++) {
    const x = grid.cx(i), y = grid.cy(i);

    for (const t of placed) {
      const D = def(t);
      const dist = Math.hypot(x - t.x, y - t.y);

      if (D.emits) {
        for (const [dom, amount] of Object.entries(D.emits)) {
          const radius = (dom === 'clutter' ? D.clutterRadius : D.radius?.[dom]) ?? 260;
          const f = falloff(dist, radius);
          if (f <= 0) continue;
          // Only sound and light care about what is in the way.
          const through = (dom === 'sound' || dom === 'light' || dom === 'glare')
            ? transmission(r, t.x, t.y, x, y) : 1;
          layers[dom][i] += amount * f * through;
        }
      }

      if (D.absorbs) {
        for (const [dom, amount] of Object.entries(D.absorbs)) {
          const radius = D.radius?.[dom] ?? 220;
          const f = falloff(dist, radius);
          if (f > 0) layers[dom][i] -= amount * f;
        }
      }
    }

    // Reverb. A hard room is loud far away from anything loud.
    layers.sound[i] *= 1 + hardSurfaceNear(r, x, y) * 0.55;

    // Predictability: not being able to see the way out is its own load.
    layers.exposure[i] = seesThrough(r, x, y, r.door.x, r.door.y) ? 0 : 0.85;

    // Clamp to 0..1. Sound in particular compounds past 1 once several
    // sources and a hard room stack up, and past a point "louder than
    // unbearable" is not a distinction worth carrying into the weighting.
    for (const d of DOMAINS) layers[d][i] = Math.max(0, Math.min(1, layers[d][i]));
  }

  computeEscape(r, grid);
  return grid;
}

/**
 * Distance to somewhere you could recover, walked rather than measured
 * straight, because a quiet corner behind a wall is not a quiet corner.
 */
function computeEscape (r, grid) {
  const { cols, rows, layers } = grid;
  const dist = new Float32Array(cols * rows).fill(Infinity);
  const queue = [];

  // Seed from every open cell the refuge covers, so a refuge whose centre
  // happens to sit on something still works.
  for (const t of r.things) {
    if (!t.placed || !def(t).refuge) continue;
    const rad = def(t).r;
    for (let i = 0; i < cols * rows; i++) {
      if (grid.blocked[i] || dist[i] === 0) continue;
      if (Math.hypot(grid.cx(i) - t.x, grid.cy(i) - t.y) > rad) continue;
      dist[i] = 0;
      queue.push(i);
    }
  }

  if (!queue.length) {
    // Nowhere to retreat to anywhere in the room. Bad, and it should push a
    // marginal room over the edge, but on its own it must not end every trip
    // at the front door or the first thing every level teaches is the same
    // thing.
    layers.escape.fill(0.62);
    return;
  }

  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    const c = i % cols, rr = (i / cols) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = rr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (grid.blocked[n] || dist[n] < Infinity) continue;
      dist[n] = dist[i] + 1;
      queue.push(n);
    }
  }

  const reach = Math.max(cols, rows);
  for (let i = 0; i < dist.length; i++) {
    layers.escape[i] = Math.min(1, (dist[i] === Infinity ? reach : dist[i]) / reach);
  }
}

/**
 * Combine the layers into one load field.
 *
 * Not an average, and this is the most important line in the simulation.
 *
 * An average lets a good rug offset a screaming grinder, which is precisely
 * the thing monotropic attention does not do. Narrow deep attention is
 * dominated by whatever the loudest channel is; the rest barely registers
 * until the loudest one is dealt with. So the load is mostly the worst single
 * domain, with a small contribution from everything else so that a room which
 * is mildly bad in six ways is still worse than one that is mildly bad in one.
 *
 * Building this as an average first was a real mistake: it quietly made the
 * game about aggregate comfort, which is the model the whole project exists
 * to argue against.
 */
export function combine (grid, weights = DEFAULT_WEIGHTS) {
  const { load, layers } = grid;
  const doms = DOMAINS.filter(d => (weights[d] ?? 0) > 0);
  const maxW = Math.max(...doms.map(d => weights[d]));

  for (let i = 0; i < load.length; i++) {
    let worst = 0, sum = 0;
    for (const d of doms) {
      const v = (layers[d][i] ?? 0) * (weights[d] / maxW);
      if (v > worst) worst = v;
      sum += v;
    }
    load[i] = Math.min(1, worst * 0.78 + (sum / doms.length) * 0.22);
  }
  return load;
}

export function sample (grid, x, y) {
  return grid.load[grid.at(x, y)];
}

/** Per-domain reading at a point, for explaining a bad spot to the player. */
export function explain (grid, x, y, weights = DEFAULT_WEIGHTS) {
  const i = grid.at(x, y);
  return DOMAINS
    .map(d => ({ domain: d, raw: grid.layers[d][i], weighted: grid.layers[d][i] * (weights[d] ?? 0) }))
    .sort((a, b) => b.weighted - a.weighted);
}
