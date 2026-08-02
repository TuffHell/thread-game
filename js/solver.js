/**
 * The solver.
 *
 * Shared by the test harness and by the in-game hint button, deliberately:
 * the nudge a stuck player gets is produced by the same code that proves
 * every commission is winnable. If the hint is wrong, the test fails, which
 * is a much better guarantee than hand-written tips that rot.
 *
 * It never gives the answer. It returns the single move that most improves
 * the situation, described in the owner's language, and the player still has
 * to place it themselves.
 */

import { thing, def, KINDS, checkConstraints } from './room.js';
import {
  makeGrid, compute, combine, combineCells, cloneGrid, patchSource, settle
} from './field.js';
import { visit } from './person.js';

// The grid the game itself runs on.
const FINE_CELL = 12;

/**
 * Whether a candidate can be scored by patching the field instead of
 * rebuilding it.
 *
 * Three things are outside what a patch can express, and all three change
 * something the patch leaves alone: a refuge redraws the escape field, a
 * sight blocker redraws what can be seen from the door, and a counter
 * redraws what can be walked through. Those get the slow, correct path. In
 * practice they are a small minority of the candidates in any position.
 */
function patchable (kindOrDef) {
  const D = typeof kindOrDef === 'string' ? KINDS[kindOrDef] : kindOrDef;
  return !D.refuge && !D.blocksSight && D.label !== KINDS.counter.label;
}

/**
 * Everyone walks; ok when all are through and no owner rule is broken.
 *
 * The cell size is a knob because the hint uses it. A 12cm grid is the real
 * simulation; a coarser one is the same physics sampled less finely, which is
 * wrong in the third decimal place and perfectly good for deciding which of
 * sixty candidate moves are worth looking at properly.
 */
export function evaluate (r, constraints, people, cell = FINE_CELL) {
  const grid = makeGrid(r, cell);
  compute(r, grid);
  // Each person's finished load field is kept, so a patched trial can start
  // from it instead of recombining nine layers over every cell again.
  const loads = [];
  const results = people.map(p => {
    combine(grid, p.weights);
    loads.push(grid.load.slice());
    return visit(r, grid, p);
  });
  const broken = checkConstraints(r, constraints ?? []);
  return { grid, loads, results, broken, ok: results.every(x => x.ok) && broken.length === 0 };
}

function avgLoad (res) {
  if (!res.path.length) return 1;
  return res.path.reduce((a, s) => a + s.load, 0) / res.path.length;
}

/**
 * How well one person's visit went. Getting further matters most, then the
 * height of the worst moment, then the general level along the way.
 *
 * Scoring on reserve remaining — the first thing I tried — rewards failing
 * EARLIER, because a trip that ends at the front door has spent nothing. The
 * search sat perfectly still and called it progress.
 */
export function perScore (res) {
  return res.ok ? 1e6
    : res.path.length * 20 - res.worst.load * 400 - avgLoad(res) * 150;
}

/** A commission is only as finished as its least comfortable visitor. */
export function scoreOf (ev) {
  if (ev.ok) return 1e9;
  if (ev.broken.length) return -1e9;
  return Math.min(...ev.results.map(perScore));
}

export function spentOn (r) {
  return r.things.filter(t => t.placed && t.fromTray)
    .reduce((n, t) => n + (def(t).cost ?? 0), 0);
}

/** "a" or "an", so hints do not read as machine output. */
const article = w => 'aeiou'.includes(w[0].toLowerCase()) ? 'an' : 'a';

/** Somewhere far from everywhere anyone goes. */
function quietSpot (r, results) {
  let best = null, bestD = -1;
  for (let x = 60; x < r.w - 60; x += 70) {
    for (let y = 60; y < r.h - 60; y += 70) {
      let d = Infinity;
      for (const res of results) {
        for (const s of res.path) d = Math.min(d, Math.hypot(x - s.x, y - s.y));
      }
      if (d > bestD) { bestD = d; best = { x, y }; }
    }
  }
  return best ?? { x: r.w / 2, y: r.h / 2 };
}

/** The most comfortable open place to stand still for a while. */
function calmestSpot (r, grid) {
  let best = null, low = Infinity;
  for (let i = 0; i < grid.load.length; i++) {
    if (grid.blocked[i]) continue;
    const x = grid.cx(i), y = grid.cy(i);
    if (x < 80 || y < 80 || x > r.w - 80 || y > r.h - 80) continue;
    if (grid.load[i] < low) { low = grid.load[i]; best = { x, y }; }
  }
  return best ?? { x: r.w / 2, y: r.h / 2 };
}

/**
 * Every move a player could make against whatever is currently breaking the
 * visit. Emitters get dumped in corners, seats and refuges get relocated,
 * absorbers get bought and placed both at the trouble and at its source.
 */
export function candidates (r, ev) {
  const failing = ev.results.filter(res => !res.ok)
    .sort((a, b) => perScore(a) - perScore(b))[0] ?? ev.results[0];
  const blame = failing.blame?.domain;
  const at = failing.at ?? failing.worst;
  const out = [];

  const spot = quietSpot(r, ev.results);
  const dumps = [
    spot,
    { x: 70, y: 70 }, { x: r.w - 70, y: 70 },
    { x: 70, y: r.h - 70 }, { x: r.w - 70, y: r.h - 70 }
  ];
  for (const t of r.things) {
    if (!t.placed || !t.movable || !def(t).emits?.[blame]) continue;
    for (const to of dumps) out.push({ kind: 'move', t, to, label: `move the ${def(t).label.toLowerCase()}` });
  }

  const calm = calmestSpot(r, ev.grid);
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const targets = [
    calm,
    { x: cl(at.x + 130, 60, r.w - 60), y: cl(at.y + 130, 60, r.h - 60) },
    { x: cl(at.x - 130, 60, r.w - 60), y: cl(at.y - 130, 60, r.h - 60) },
    { x: r.w / 2, y: r.h / 2 }
  ];
  for (const t of r.things) {
    if (!t.placed || !t.movable) continue;
    if (t.kind !== 'seat' && !def(t).refuge) continue;
    for (const to of targets) out.push({ kind: 'move', t, to, label: `move the ${def(t).label.toLowerCase()}` });
  }

  if (blame === 'crowd') {
    for (const t of r.things.filter(x => x.placed && x.kind === 'chair').slice(0, 6)) {
      for (const to of dumps) out.push({ kind: 'move', t, to, label: 'spread the chairs out' });
    }
  }

  const left = r.budget - spentOn(r);
  for (const k of r.tray) {
    const D = KINDS[k];
    if ((D.cost ?? 0) > left) continue;
    if (!(D.absorbs?.[blame] || D.refuge)) continue;
    const spots = [at, { x: at.x + 90, y: at.y }, { x: at.x, y: at.y + 90 }];
    for (const t of r.things) {
      if (t.placed && def(t).emits?.[blame]) spots.push({ x: t.x, y: t.y });
    }
    for (const near of spots) {
      const lower = D.label.toLowerCase();
      out.push({ kind: 'place', k, at: near, label: `add ${article(lower)} ${lower}` });
    }
  }

  return { list: out, failing, blame, at };
}

/** Put a candidate in place, hand back the way to undo it. */
function stage (r, cand) {
  if (cand.kind === 'move') {
    const old = { x: cand.t.x, y: cand.t.y };
    cand.t.x = cand.to.x; cand.t.y = cand.to.y;
    return { thing: cand.t, from: old, undo: () => { cand.t.x = old.x; cand.t.y = old.y; } };
  }
  const t = thing(cand.k, cand.at.x, cand.at.y);
  t.fromTray = true;
  r.things.push(t);
  return { thing: t, from: null, undo: () => { r.things = r.things.filter(x => x !== t); } };
}

/** Try a candidate, score it, put everything back. */
function trial (r, constraints, people, cand, cell = FINE_CELL) {
  const st = stage(r, cand);
  const score = scoreOf(evaluate(r, constraints, people, cell));
  st.undo();
  return score;
}

/**
 * The same trial, at the same resolution, without rebuilding the field.
 *
 * Everything a candidate changes is one object appearing, disappearing, or
 * doing both a couple of metres apart. So take the field that was already
 * computed, subtract the object where it was, add it where it would be, and
 * republish only the cells that moved. Everyone then walks the real
 * full-resolution room. It is not an approximation of the answer — it is the
 * answer, arrived at without doing the other ninety-five per cent of the
 * arithmetic again.
 *
 * Returns null when the candidate is one a patch cannot express.
 */
function trialPatched (r, constraints, people, cand, base) {
  const D = cand.kind === 'move' ? def(cand.t) : KINDS[cand.k];
  if (!patchable(D)) return null;

  const st = stage(r, cand);
  const grid = cloneGrid(base);
  const touched = [];
  if (st.from) {
    const off = patchSource(r, grid, { ...st.thing, ...st.from }, -1);
    if (off) touched.push(...off);
  }
  const on = patchSource(r, grid, st.thing, 1);
  if (on) touched.push(...on);
  settle(grid, touched);

  const results = people.map((p, i) => {
    if (base.loads?.[i]) {
      grid.load.set(base.loads[i]);
      combineCells(grid, p.weights, touched);
    } else {
      combine(grid, p.weights);
    }
    return visit(r, grid, p);
  });
  const broken = checkConstraints(r, constraints ?? []);
  st.undo();

  return scoreOf({ grid, results, broken, ok: results.every(x => x.ok) && broken.length === 0 });
}

/**
 * The best single move available right now, or null if nothing helps.
 *
 * Two passes. Scoring sixty candidates at full resolution meant the hint
 * button sat there for twelve seconds, which in a game about not being
 * overwhelmed is its own small joke. So every candidate is tried once on a
 * coarse grid — cheap, and quite good enough to tell a promising move from a
 * pointless one — and only the handful that survive are scored properly. The
 * answer that comes back is still an exact full-resolution score; the
 * shortlist is the only thing that was ever approximate.
 *
 * `exact: true` skips the shortlist and does what it always did, which is
 * what the test harness wants when it is proving a level is winnable.
 */
export function bestMove (r, constraints, people, ev, cap = Infinity, opts = {}) {
  const { exact = false } = opts;
  const { list, failing, blame, at } = candidates(r, ev);
  const pool = cap === Infinity ? list : list.slice(0, cap);
  if (!pool.length) return null;

  let best = null;
  for (const cand of pool) {
    const score = exact
      ? trial(r, constraints, people, cand)
      : (trialPatched(r, constraints, people, cand, ev.grid)
         ?? trial(r, constraints, people, cand));
    if (!best || score > best.score) best = { cand, score };
  }
  if (!best || best.score <= scoreOf(ev) + 1e-6) return null;
  return { ...best, failing, blame, at };
}

/** Apply a move for real. */
export function applyMove (r, cand) {
  if (cand.kind === 'move') { cand.t.x = cand.to.x; cand.t.y = cand.to.y; }
  else {
    const t = thing(cand.k, cand.at.x, cand.at.y);
    t.fromTray = true;
    r.things.push(t);
  }
}

/** Play a whole commission out, for the test harness. */
export function play (r, constraints, people, rounds = 16) {
  let ev = evaluate(r, constraints, people);
  const log = [];
  for (let n = 0; n < rounds && !ev.ok; n++) {
    const best = bestMove(r, constraints, people, ev, Infinity, { exact: true });
    if (!best) break;
    applyMove(r, best.cand);
    log.push(best.cand.label);
    ev = evaluate(r, constraints, people);
  }
  return { ev, log, cost: spentOn(r) };
}
