/**
 * The visitor, and whether the trip works.
 *
 * Two rules decide it, and the first one is the whole game.
 *
 * Monotropic attention is deep and narrow, so it does not average. One bad
 * moment anywhere on the route ends the trip regardless of how pleasant the
 * rest of the room is. You cannot compensate for a screaming grinder by
 * putting a nice rug somewhere else. That single rule is what stops this
 * being a decorating game: there is no scoring well on aggregate, there is
 * only the worst place they have to stand.
 *
 * The second rule is ordinary depletion, so a route that is tolerable
 * everywhere can still be too long.
 */

import { def, pointToSegment } from './room.js';
import { sample, explain } from './field.js';

export const PROFILE = {
  // Above this at any single point and the trip ends there.
  //
  // Tuned so that a bad room fails HERE rather than by running the reserve
  // down. The monotropic rule has to be the primary failure or the game is
  // secretly about averages again, which is the thing it exists to reject.
  spike: 0.42,
  // Total reserve spent walking and waiting.
  reserve: 100,
  // Per second of exposure at full load. Waiting hurts more than walking
  // only because you do it for longer, not because of a separate penalty.
  drain: 6,
  walkSpeed: 90,      // cm per second
  dwellCounter: 14,   // seconds waiting to order
  dwellSeat: 40       // seconds sitting
};

/** Nearest walkable cell to a point, since counters cannot be stood inside. */
function nearestOpen (grid, x, y) {
  const start = grid.at(x, y);
  if (!grid.blocked[start]) return start;
  const seen = new Set([start]);
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const c = i % grid.cols, r = (i / grid.cols) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      const n = nr * grid.cols + nc;
      if (seen.has(n)) continue;
      if (!grid.blocked[n]) return n;
      seen.add(n);
      q.push(n);
    }
  }
  return start;
}

/**
 * Cheapest path by load, not by distance. People do route around the awful
 * corner, and the player's job is to make sure a survivable route exists at
 * all rather than to control which one gets taken.
 */
export function route (grid, from, to) {
  const start = nearestOpen(grid, from.x, from.y);
  const goal = nearestOpen(grid, to.x, to.y);
  const { cols, rows } = grid;

  const g = new Float32Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const open = [start];
  g[start] = 0;

  const gx = i => i % cols, gy = i => (i / cols) | 0;
  const h = i => Math.hypot(gx(i) - gx(goal), gy(i) - gy(goal));

  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) {
      if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
    }
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;

    const c = gx(cur), r = gy(cur);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (grid.blocked[n]) continue;
      const step = Math.hypot(dc, dr) * (1 + grid.load[n] * 6);
      if (g[cur] + step < g[n]) {
        g[n] = g[cur] + step;
        came[n] = cur;
        if (!open.includes(n)) open.push(n);
      }
    }
  }

  if (g[goal] === Infinity) return null;
  const path = [];
  for (let i = goal; i !== -1; i = came[i]) path.push(i);
  return path.reverse();
}

/**
 * Walk the whole trip and report what happened.
 *
 * Returns the full path, the reserve remaining, and if it failed, the exact
 * point and the domain most responsible. Telling someone their room scored
 * 62 is useless. Telling them the trip ended two metres inside the door
 * because of the grinder is something they can act on.
 */
export function trip (r, grid, profile = PROFILE) {
  const legs = [
    { from: r.door, to: r.goal, dwell: profile.dwellCounter, name: 'to the counter' },
    { from: r.goal, to: seatOf(r), dwell: profile.dwellSeat, name: 'to a seat' },
    { from: seatOf(r), to: r.door, dwell: 0, name: 'back out' }
  ];

  let reserve = profile.reserve;
  const full = [];
  let worst = { load: -1, x: 0, y: 0 };

  for (const leg of legs) {
    const p = route(grid, leg.from, leg.to);
    if (!p) {
      return { ok: false, reason: 'blocked', leg: leg.name, path: full, reserve, worst };
    }

    for (let k = 0; k < p.length; k++) {
      const i = p[k];
      const x = grid.cx(i), y = grid.cy(i);
      const load = grid.load[i];
      full.push({ x, y, load });

      if (load > worst.load) worst = { load, x, y };

      if (load >= profile.spike) {
        return {
          ok: false, reason: 'spike', leg: leg.name,
          at: { x, y, load }, path: full, reserve,
          worst, blame: explain(grid, x, y)[0]
        };
      }

      const seconds = grid.cell / profile.walkSpeed;
      reserve -= load * profile.drain * seconds;
      if (reserve <= 0) {
        return {
          ok: false, reason: 'spent', leg: leg.name,
          at: { x, y, load }, path: full, reserve: 0,
          worst, blame: explain(grid, x, y)[0]
        };
      }
    }

    // Standing still costs the same load for longer.
    if (leg.dwell) {
      const end = full[full.length - 1];
      if (end.load >= profile.spike) {
        return {
          ok: false, reason: 'spike', leg: `waiting ${leg.name}`,
          at: end, path: full, reserve, worst, blame: explain(grid, end.x, end.y)[0]
        };
      }
      reserve -= end.load * profile.drain * leg.dwell;
      if (reserve <= 0) {
        return {
          ok: false, reason: 'spent', leg: `waiting ${leg.name}`,
          at: end, path: full, reserve: 0, worst,
          blame: explain(grid, end.x, end.y)[0]
        };
      }
    }
  }

  return { ok: true, path: full, reserve, worst };
}

function seatOf (r) {
  const s = r.things.find(t => t.placed && t.kind === 'seat');
  return s ? { x: s.x, y: s.y } : r.goal;
}
