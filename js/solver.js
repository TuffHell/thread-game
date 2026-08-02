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
import { makeGrid, compute, combine } from './field.js';
import { visit } from './person.js';

/** Everyone walks; ok when all are through and no owner rule is broken. */
export function evaluate (r, constraints, people) {
  const grid = makeGrid(r, 12);
  compute(r, grid);
  const results = people.map(p => {
    combine(grid, p.weights);
    return visit(r, grid, p);
  });
  const broken = checkConstraints(r, constraints ?? []);
  return { grid, results, broken, ok: results.every(x => x.ok) && broken.length === 0 };
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

/** Try a candidate, score it, put everything back. */
function trial (r, constraints, people, cand) {
  let undo;
  if (cand.kind === 'move') {
    const old = { x: cand.t.x, y: cand.t.y };
    cand.t.x = cand.to.x; cand.t.y = cand.to.y;
    undo = () => { cand.t.x = old.x; cand.t.y = old.y; };
  } else {
    const t = thing(cand.k, cand.at.x, cand.at.y);
    t.fromTray = true;
    r.things.push(t);
    undo = () => { r.things = r.things.filter(x => x !== t); };
  }
  const ev = evaluate(r, constraints, people);
  const score = scoreOf(ev);
  undo();
  return score;
}

/** The best single move available right now, or null if nothing helps. */
export function bestMove (r, constraints, people, ev, cap = Infinity) {
  const { list, failing, blame, at } = candidates(r, ev);
  const pool = cap === Infinity ? list : list.slice(0, cap);
  let best = null;
  for (const cand of pool) {
    const score = trial(r, constraints, people, cand);
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
    const best = bestMove(r, constraints, people, ev);
    if (!best) break;
    applyMove(r, best.cand);
    log.push(best.cand.label);
    ev = evaluate(r, constraints, people);
  }
  return { ev, log, cost: spentOn(r) };
}
