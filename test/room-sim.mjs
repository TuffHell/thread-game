/**
 * Does every commission behave like a puzzle, and can it actually be won?
 *
 * The solver plays each commission the way a player would: look at what is
 * breaking the visit for whoever is failing, try the moves available — move
 * an emitter, move a table, buy an absorber — and keep whatever helps. Moves
 * that break the owner's rules are discarded, exactly as the game discards
 * them at sign-off.
 *
 * If the search cannot win a commission within budget, the commission is not
 * fair, and this exits non-zero.
 *
 *   node test/room-sim.mjs
 */

import { COMMISSIONS } from '../js/campaign.js';
import { BUILDERS } from '../js/rooms.js';
import { thing, def, KINDS, checkConstraints } from '../js/room.js';
import { makeGrid, compute, combine, explain, DOMAINS } from '../js/field.js';
import { visit, PEOPLE } from '../js/person.js';

function buildFor (c) {
  const r = BUILDERS[c.room]();
  if (c.budget != null) r.budget = c.budget;
  return r;
}

/** Everyone walks; the commission is ok when all are and no rule is broken. */
function evaluate (r, c, people) {
  const grid = makeGrid(r, 12);
  compute(r, grid);
  const results = people.map(p => {
    combine(grid, p.weights);
    return visit(r, grid, p);
  });
  const broken = checkConstraints(r, c.constraints ?? []);
  return { grid, results, broken, ok: results.every(x => x.ok) && broken.length === 0 };
}

const pct = v => `${Math.round(v * 100)}%`;

function spentOn (r) {
  return r.things.filter(t => t.placed && t.fromTray)
    .reduce((n, t) => n + (def(t).cost ?? 0), 0);
}

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
  return best;
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
 * Score an attempt. min across people, because the commission is only as
 * done as its least comfortable visitor. Getting further matters most;
 * lowering the worst moment breaks ties. Scoring on reserve remaining
 * rewarded failing EARLIER (a trip that dies at the door has spent nothing),
 * which is a mistake this file gets to keep as a warning.
 */
function avgLoad (res) {
  if (!res.path.length) return 1;
  return res.path.reduce((a, s2) => a + s2.load, 0) / res.path.length;
}

function perScore (res) {
  return res.ok ? 1e6
    : res.path.length * 20 - res.worst.load * 400 - avgLoad(res) * 150;
}

function scoreOf (ev) {
  if (ev.ok) return 1e9;
  if (ev.broken.length) return -1e9;
  return Math.min(...ev.results.map(perScore));
}

function play (c, rounds = 16) {
  const people = c.people.map(k => PEOPLE[k]);
  const r = buildFor(c);
  let cur = evaluate(r, c, people);
  const log = [];

  for (let n = 0; n < rounds && !cur.ok; n++) {
    // Fix the worst-off person, not the first on the list. In a three-person
    // commission the first pass of this targeted whoever happened to be
    // index zero and polished their route while someone else died at the door.
    const failing = cur.results.filter(res => !res.ok)
      .sort((a, b) => perScore(a) - perScore(b))[0] ?? cur.results[0];
    const blame = failing.blame?.domain;
    const at = failing.at ?? failing.worst;
    const candidates = [];

    const spot = quietSpot(r, cur.results);
    const dumps = [
      spot,
      { x: 70, y: 70 }, { x: r.w - 70, y: 70 },
      { x: 70, y: r.h - 70 }, { x: r.w - 70, y: r.h - 70 }
    ];
    for (const t of r.things) {
      if (!t.placed || !t.movable || !def(t).emits?.[blame]) continue;
      for (const to of dumps) {
        candidates.push({ kind: 'move', t, to, label: `move ${def(t).label}` });
      }
    }

    const calm = calmestSpot(r, cur.grid);
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
      for (const to of targets) {
        candidates.push({ kind: 'move', t, to, label: `move ${def(t).label}` });
      }
    }

    // Crowding is made of chairs; spreading them is a real move.
    if (blame === 'crowd') {
      for (const t of r.things.filter(x => x.placed && x.kind === 'chair').slice(0, 6)) {
        for (const to of dumps) {
          candidates.push({ kind: 'move', t, to, label: 'move Chair' });
        }
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
        candidates.push({ kind: 'place', k, at: near, label: `place ${D.label}` });
      }
    }

    let best = null;
    for (const cand of candidates) {
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
      const trial = evaluate(r, c, people);
      const score = scoreOf(trial);
      if (!best || score > best.score) best = { cand, score };
      undo();
    }

    if (!best || best.score <= scoreOf(cur) + 1e-6) break;

    const cand = best.cand;
    if (cand.kind === 'move') { cand.t.x = cand.to.x; cand.t.y = cand.to.y; }
    else { const t = thing(cand.k, cand.at.x, cand.at.y); t.fromTray = true; r.things.push(t); }
    log.push(cand.label);
    cur = evaluate(r, c, people);
  }

  return { r, cur, log, cost: spentOn(r) };
}

/* ------------------------------------------------------------------ */

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

for (const c of COMMISSIONS) {
  const people = c.people.map(k => PEOPLE[k]);
  console.log(`\n== ${c.title}  (${people.map(p => p.name).join(', ')}) ==`);

  const start = evaluate(buildFor(c), c, people);
  const failing = start.results.find(r => !r.ok);
  check('owner rules hold at the start', start.broken.length === 0,
    start.broken.map(b => b.text).join(' '));
  check('starts unusable', !!failing,
    failing
      ? `${failing.person.name}: ${failing.reason} ${failing.leg}` +
        (failing.blame ? `, worst domain ${failing.blame.domain}` : '')
      : '(already fine, so there is no puzzle)');
  if (failing) {
    console.log(`        worst for ${failing.person.name}: ${pct(failing.worst.load)}`);
  }

  const solved = play(c);
  check('solvable within budget and rules', solved.cur.ok && solved.cost <= solved.r.budget,
    solved.cur.ok
      ? `${solved.log.length} moves, cost ${solved.cost} of ${solved.r.budget}, ` +
        `tightest reserve ${Math.round(Math.min(...solved.cur.results.map(x => x.reserve)))}`
      : 'search gave up: ' + (solved.cur.broken.length
          ? 'owner rules'
          : (rr => rr ? `${rr.person.name} ${rr.reason} ${rr.leg}` : '??')(solved.cur.results.find(x => !x.ok))));
  if (solved.log.length) console.log(`        ${solved.log.join(' → ')}`);

  check('needs more than one move', solved.log.length >= 2, `${solved.log.length} move(s)`);

  check('interruptions still occur in the finished room',
    solved.cur.results.some(res => res.events.length > 0),
    `${solved.cur.results.reduce((n, res) => n + res.events.length, 0)} across the signed-off visit`);
}

console.log(failures === 0
  ? '\nEvery commission starts unfair and can be finished fairly.'
  : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
