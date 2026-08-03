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

export const DOMAINS = ['sound', 'light', 'flicker', 'glare', 'crowd', 'clutter', 'smell', 'escape', 'exposure'];

/** How much each domain hurts. A visitor profile can override this. */
export const DEFAULT_WEIGHTS = {
  sound: 1.0, light: 0.5, flicker: 0.9, glare: 0.6,
  crowd: 0.85, clutter: 0.4, smell: 0.55, escape: 0.7, exposure: 0.45
};

const warned = new Set();
function warnOnce (kind, dom) {
  const k = `${kind}:${dom}`;
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(`[field] "${kind}" refers to unknown domain "${dom}"; ignoring.`);
}

export function makeGrid (r, cell = 12) {
  const cols = Math.ceil(r.w / cell);
  const rows = Math.ceil(r.h / cell);
  const layers = {}, raw = {};
  for (const d of DOMAINS) {
    layers[d] = new Float32Array(cols * rows);
    raw[d] = new Float32Array(cols * rows);
  }
  return {
    cell, cols, rows, layers, raw,
    reverb: new Float32Array(cols * rows).fill(1),
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

  /*
   * Emitters and absorbers.
   *
   * This is the hot loop of the whole game — it reruns on every drag and,
   * until it was made to skip, sixty times over inside every hint. Two things
   * matter here and nothing else does. Each source's radii and layer targets
   * are worked out once instead of being pulled apart with Object.entries for
   * every one of four thousand cells; and a source that cannot possibly reach
   * a cell is rejected on a squared distance before any square root, falloff
   * or raycast happens. Most pairs fail that test, which is the point.
   */
  const srcs = [];
  for (const t of placed) {
    const D = def(t);
    const emits = [], absorbs = [];
    let maxR = 0;

    for (const dom in D.emits ?? {}) {
      if (!layers[dom]) { warnOnce(t.kind, dom); continue; }
      const radius = (dom === 'clutter' ? D.clutterRadius : D.radius?.[dom]) ?? 260;
      emits.push({
        layer: layers[dom], amount: D.emits[dom], radius,
        // Only sound and light care about what is in the way.
        occluded: dom === 'sound' || dom === 'light' || dom === 'glare'
      });
      if (radius > maxR) maxR = radius;
    }
    for (const dom in D.absorbs ?? {}) {
      if (!layers[dom]) { warnOnce(t.kind, dom); continue; }
      const radius = D.radius?.[dom] ?? 220;
      absorbs.push({ layer: layers[dom], amount: D.absorbs[dom], radius });
      if (radius > maxR) maxR = radius;
    }
    if (emits.length || absorbs.length) {
      srcs.push({ x: t.x, y: t.y, emits, absorbs, maxR2: maxR * maxR });
    }
  }

  for (let i = 0; i < cols * rows; i++) {
    const x = grid.cx(i), y = grid.cy(i);

    for (const s of srcs) {
      const dx = x - s.x, dy = y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= s.maxR2) continue;
      const dist = Math.sqrt(d2);

      for (const e of s.emits) {
        const f = falloff(dist, e.radius);
        if (f <= 0) continue;
        const through = e.occluded ? transmission(r, s.x, s.y, x, y) : 1;
        e.layer[i] += e.amount * f * through;
      }
      for (const a of s.absorbs) {
        const f = falloff(dist, a.radius);
        if (f > 0) a.layer[i] -= a.amount * f;
      }
    }

    // Reverb. A hard room is loud far away from anything loud. It depends
    // only on the walls, so it is worked out once and kept — patching a
    // moved object back in later must not pay for it again.
    grid.reverb[i] = 1 + hardSurfaceNear(r, x, y) * 0.55;

    // Predictability: not being able to see the way out is its own load.
    layers.exposure[i] = seesThrough(r, x, y, r.door.x, r.door.y) ? 0 : 0.85;
  }

  // The accumulation before reverb and clamping, which is the only form a
  // single source's contribution can be added to or taken away from.
  for (const d of DOMAINS) grid.raw[d].set(layers[d]);
  refinish(grid);

  computeEscape(r, grid);
  return grid;
}

/**
 * Turn the raw accumulation into the published layers: reverb on sound, then
 * everything clamped.
 *
 * Sound in particular compounds past 1 once several sources and a hard room
 * stack up, and past a point "louder than unbearable" is not a distinction
 * worth carrying into the weighting.
 *
 * With no cell list it does the whole grid, which is what compute wants.
 * With one it does only the cells a patch touched.
 */
function refinish (grid, cells = null) {
  const { layers, raw, reverb } = grid;
  const n = grid.cols * grid.rows;
  const doms = DOMAINS.filter(d => d !== 'escape' && d !== 'exposure');
  const each = i => {
    for (const d of doms) {
      const v = d === 'sound' ? raw[d][i] * reverb[i] : raw[d][i];
      layers[d][i] = v < 0 ? 0 : (v > 1 ? 1 : v);
    }
  };
  if (cells) for (const i of cells) each(i);
  else for (let i = 0; i < n; i++) each(i);
}

/**
 * A copy of a computed field, cheap enough to make sixty of.
 *
 * The read-only parts — what is blocked, how reverberant each cell is — are
 * shared rather than copied, because moving a chair changes neither.
 */
export function cloneGrid (grid) {
  const g = { ...grid, layers: {}, raw: {} };
  for (const d of DOMAINS) {
    g.layers[d] = grid.layers[d].slice();
    g.raw[d] = grid.raw[d].slice();
  }
  g.load = grid.load.slice();
  return g;
}

/**
 * Add or take away one object's contribution, in place.
 *
 * This is what makes the hint quick. Recomputing the whole field to find out
 * what happens if you move the grinder two metres costs fifty milliseconds
 * and does four thousand cells' worth of arithmetic to answer a question
 * about one object. This touches only the cells that object can reach, and
 * only for the domains it actually affects.
 *
 * Returns the cells it changed, or null if the object does nothing to any
 * field and there was nothing to do.
 */
export function patchSource (r, grid, t, sign) {
  const D = def(t);
  const specs = [];
  let maxR = 0;

  for (const dom in D.emits ?? {}) {
    if (!grid.raw[dom]) { warnOnce(t.kind, dom); continue; }
    const radius = (dom === 'clutter' ? D.clutterRadius : D.radius?.[dom]) ?? 260;
    specs.push({
      arr: grid.raw[dom], amount: D.emits[dom], radius, way: 1,
      occluded: dom === 'sound' || dom === 'light' || dom === 'glare'
    });
    if (radius > maxR) maxR = radius;
  }
  for (const dom in D.absorbs ?? {}) {
    if (!grid.raw[dom]) { warnOnce(t.kind, dom); continue; }
    const radius = D.radius?.[dom] ?? 220;
    specs.push({ arr: grid.raw[dom], amount: D.absorbs[dom], radius, way: -1, occluded: false });
    if (radius > maxR) maxR = radius;
  }
  if (!specs.length) return null;

  const { cols, rows, cell } = grid;
  const c0 = Math.max(0, Math.floor((t.x - maxR) / cell));
  const c1 = Math.min(cols - 1, Math.floor((t.x + maxR) / cell));
  const r0 = Math.max(0, Math.floor((t.y - maxR) / cell));
  const r1 = Math.min(rows - 1, Math.floor((t.y + maxR) / cell));
  const maxR2 = maxR * maxR;
  const touched = [];

  for (let rr = r0; rr <= r1; rr++) {
    for (let cc = c0; cc <= c1; cc++) {
      const i = rr * cols + cc;
      const x = grid.cx(i), y = grid.cy(i);
      const dx = x - t.x, dy = y - t.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= maxR2) continue;
      const dist = Math.sqrt(d2);
      let hit = false;
      for (const sp of specs) {
        const f = falloff(dist, sp.radius);
        if (f <= 0) continue;
        const through = sp.occluded ? transmission(r, t.x, t.y, x, y) : 1;
        sp.arr[i] += sign * sp.way * sp.amount * f * through;
        hit = true;
      }
      if (hit) touched.push(i);
    }
  }
  return touched;
}

/** Republish the cells a patch touched. */
export function settle (grid, cells) {
  refinish(grid, cells);
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
    layers.escape.fill(0.5);
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

  // Scaled gently. Distance-to-help matters, but it grows as a background
  // unease, not as a wall: at full punishment a big room spiked at its own
  // front door before crowding — the thing the person actually struggles
  // with — ever had a chance to matter.
  const reach = Math.max(cols, rows) * 1.5;
  for (let i = 0; i < dist.length; i++) {
    layers.escape[i] = Math.min(0.85, (dist[i] === Infinity ? reach : dist[i]) / reach);
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
/**
 * Combine the layers into one load field, for one person.
 *
 * `floors` is the second half of sensory difference and the half that games
 * about autism almost always leave out. Hyper-reactivity — too much noise,
 * too much light — is the familiar story. Hypo-reactivity is just as real:
 * some people need a certain amount of input to feel present in a room at
 * all, and a silent, still, evenly lit space is not neutral to them, it is
 * its own kind of unbearable. Under-stimulation drives distress and drives
 * seeking, and a designer who only knows the first story will build a room
 * that fails the second person while looking, on paper, perfect.
 *
 * So a floor is a minimum: the shortfall below it is load, weighted exactly
 * like an excess above it, and it goes through the same worst-channel
 * combine. That means "make everything quiet" — the strategy this game
 * otherwise rewards all the way through — will straightforwardly fail
 * somebody, which is the point of putting it in.
 */
export function combine (grid, weights = DEFAULT_WEIGHTS, floors = null) {
  const { load, layers } = grid;
  // The arrays and scale factors are pulled out of the loop: this runs once
  // per person per visit, over every cell, and property lookups through two
  // objects four thousand times a call are most of what it used to cost.
  const arrs = [], scale = [], floor = [];
  let maxW = 0;
  for (const d of DOMAINS) if ((weights[d] ?? 0) > maxW) maxW = weights[d];
  for (const d of DOMAINS) {
    const w = weights[d] ?? 0;
    if (w <= 0) continue;
    arrs.push(layers[d]);
    scale.push(w / maxW);
    floor.push(floors?.[d] ?? 0);
  }
  const k = arrs.length;
  const spread = 0.22 / k;

  for (let i = 0; i < load.length; i++) {
    let worst = 0, sum = 0;
    for (let j = 0; j < k; j++) {
      const raw = arrs[j][i];
      // Too much costs. So does too little, for anyone who has a floor.
      const off = floor[j] > 0 && raw < floor[j] ? (floor[j] - raw) : raw;
      const v = off * scale[j];
      if (v > worst) worst = v;
      sum += v;
    }
    const v = worst * 0.78 + sum * spread;
    load[i] = v > 1 ? 1 : v;
  }
  return load;
}

/**
 * Recombine only the cells a patch touched.
 *
 * Everything else in the load field is already right for these weights,
 * provided the caller put the right person's load array back first — which
 * is the whole trick that makes a patched trial cheap.
 */
export function combineCells (grid, weights, cells, floors = null) {
  const { load, layers } = grid;
  const arrs = [], scale = [], floor = [];
  let maxW = 0;
  for (const d of DOMAINS) if ((weights[d] ?? 0) > maxW) maxW = weights[d];
  for (const d of DOMAINS) {
    const w = weights[d] ?? 0;
    if (w <= 0) continue;
    arrs.push(layers[d]);
    scale.push(w / maxW);
    floor.push(floors?.[d] ?? 0);
  }
  const k = arrs.length;
  const spread = 0.22 / k;

  for (const i of cells) {
    let worst = 0, sum = 0;
    for (let j = 0; j < k; j++) {
      const raw = arrs[j][i];
      const off = floor[j] > 0 && raw < floor[j] ? (floor[j] - raw) : raw;
      const v = off * scale[j];
      if (v > worst) worst = v;
      sum += v;
    }
    const v = worst * 0.78 + sum * spread;
    load[i] = v > 1 ? 1 : v;
  }
  return load;
}

export function sample (grid, x, y) {
  return grid.load[grid.at(x, y)];
}

/** Per-domain reading at a point, for explaining a bad spot to the player. */
export function explain (grid, x, y, weights = DEFAULT_WEIGHTS, floors = null) {
  const i = grid.at(x, y);
  return DOMAINS
    .map(d => {
      const raw = grid.layers[d][i];
      const f = floors?.[d] ?? 0;
      // A shortfall is reported as its own thing, so the verdict can say
      // "there is nothing here at all" rather than blaming a level of nought.
      const short = f > 0 && raw < f;
      const off = short ? f - raw : raw;
      return { domain: d, raw: off, actual: raw, short, weighted: off * (weights[d] ?? 0) };
    })
    .sort((a, b) => b.weighted - a.weighted);
}
