/**
 * Does each room behave like a room, and can it actually be solved?
 *
 * The earlier version of this test hardcoded one hand-written solution for
 * one café, which stopped meaning anything the moment the room changed. This
 * one searches for a solution instead: it looks at what is currently breaking
 * the visit, tries the moves a player would try, and keeps whatever helps.
 *
 * If the search cannot finish a room within budget, the room is not fair.
 *
 *   node test/room-sim.mjs
 */

import { ROOMS } from '../js/rooms.js';
import { thing, def, KINDS } from '../js/room.js';
import { makeGrid, compute, combine, explain, DOMAINS } from '../js/field.js';
import { visit, PEOPLE } from '../js/person.js';

function evaluate (r, person) {
  const grid = makeGrid(r, 12);
  compute(r, grid);
  combine(grid, person.weights);
  return { grid, result: visit(r, grid, person) };
}

const pct = v => `${Math.round(v * 100)}%`;

function breakdown (grid, at, person) {
  return explain(grid, at.x, at.y, person.weights)
    .filter(d => d.weighted > 0.005)
    .slice(0, 4)
    .map(d => `${d.domain} ${pct(d.raw)}`)
    .join('  ');
}

function spentOn (r) {
  return r.things.filter(t => t.placed && t.fromTray)
    .reduce((n, t) => n + (def(t).cost ?? 0), 0);
}

/** Somewhere far from everywhere the visitor goes. */
function quietSpot (r, result) {
  let best = null, bestD = -1;
  for (let x = 60; x < r.w - 60; x += 70) {
    for (let y = 60; y < r.h - 60; y += 70) {
      let d = Infinity;
      for (const s of result.path) d = Math.min(d, Math.hypot(x - s.x, y - s.y));
      if (d > bestD) { bestD = d; best = { x, y }; }
    }
  }
  return best;
}

/** The most comfortable place in the room to stand still for a while. */
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
 * How good is an attempt?
 *
 * Getting further into the visit is the thing that matters, plus lowering the
 * worst moment. Scoring on reserve remaining, which was the first thing I
 * tried, rewards failing EARLIER, because a trip that ends at the front door
 * has barely spent anything. The search happily sat still.
 */
const scoreOf = res =>
  res.ok ? 1e9 : res.path.length * 20 - res.worst.load * 400;

/**
 * Play the room. Each round: find what is breaking it, try every move a
 * player could make against that, keep the one that helps most.
 */
function play (spec, rounds = 14) {
  const person = PEOPLE[spec.person] ?? PEOPLE.mara;
  const r = spec.build();
  let cur = evaluate(r, person);
  const log = [];

  for (let n = 0; n < rounds && !cur.result.ok; n++) {
    const blame = cur.result.blame?.domain;
    const at = cur.result.at ?? cur.result.worst;
    const candidates = [];

    // Move whatever is emitting the thing that is breaking it, somewhere the
    // visitor never goes.
    const spot = quietSpot(r, cur.result);
    for (const t of r.things) {
      if (!t.placed || !t.movable || !def(t).emits?.[blame]) continue;
      candidates.push({ kind: 'move', t, to: spot, label: `move ${def(t).label}` });
    }

    // Move where they are allowed to sit. Running out during the forty
    // seconds at a table is usually not about the route at all, it is about
    // the only free table being next to the grinder, and relocating it is
    // the first thing any real person would try.
    const calm = calmestSpot(r, cur.grid);
    for (const t of r.things) {
      if (!t.placed || t.kind !== 'seat') continue;
      candidates.push({ kind: 'move', t, to: calm, label: `move ${def(t).label}` });
    }

    // Or buy something that absorbs it, and put it where it is worst.
    const left = r.budget - spentOn(r);
    for (const k of r.tray) {
      const D = KINDS[k];
      if ((D.cost ?? 0) > left) continue;
      const helps = D.absorbs?.[blame] || D.refuge;
      if (!helps) continue;
      for (const near of [at, { x: at.x + 90, y: at.y }, { x: at.x, y: at.y + 90 }]) {
        candidates.push({ kind: 'place', k, at: near, label: `place ${D.label}` });
      }
    }

    let best = null;
    for (const c of candidates) {
      let undo;
      if (c.kind === 'move') {
        const old = { x: c.t.x, y: c.t.y };
        c.t.x = c.to.x; c.t.y = c.to.y;
        undo = () => { c.t.x = old.x; c.t.y = old.y; };
      } else {
        const t = thing(c.k, c.at.x, c.at.y);
        t.fromTray = true;
        r.things.push(t);
        undo = () => { r.things = r.things.filter(x => x !== t); };
      }
      const trial = evaluate(r, person);
      const score = scoreOf(trial.result);
      if (!best || score > best.score) best = { c, score, trial };
      undo();
    }

    if (!best || best.score <= scoreOf(cur.result) + 1e-6) break;

    const c = best.c;
    if (c.kind === 'move') { c.t.x = c.to.x; c.t.y = c.to.y; }
    else { const t = thing(c.k, c.at.x, c.at.y); t.fromTray = true; r.things.push(t); }
    log.push(c.label);
    cur = evaluate(r, person);
  }

  return { r, person, cur, log, cost: spentOn(r) };
}

/* ------------------------------------------------------------------ */

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

for (const spec of ROOMS) {
  const person = PEOPLE[spec.person] ?? PEOPLE.mara;
  console.log(`\n== ${spec.title}  (${person.name}) ==`);

  const start = evaluate(spec.build(), person);
  check('starts unusable', !start.result.ok,
    start.result.ok ? '(already fine, so there is no puzzle)'
      : `${start.result.reason} ${start.result.leg}, worst domain ${start.result.blame?.domain}`);
  console.log(`        worst ${pct(start.result.worst.load)} · ` +
    breakdown(start.grid, start.result.worst, person));

  const solved = play(spec);
  check('solvable within budget', solved.cur.result.ok && solved.cost <= solved.r.budget,
    solved.cur.result.ok
      ? `${solved.log.length} moves, cost ${solved.cost} of ${solved.r.budget}, ` +
        `reserve ${Math.round(solved.cur.result.reserve)}`
      : `search gave up: ${solved.cur.result.reason} ${solved.cur.result.leg}`);
  if (solved.log.length) console.log(`        ${solved.log.join(' → ')}`);

  check('needs more than one move', solved.log.length >= 2,
    `${solved.log.length} move(s)`);

  // Interruptions have to actually bite, or the monotropism model is inert.
  check('interruptions occur during the visit', start.result.events.length > 0,
    `${start.result.events.length} during the failed attempt`);

  // One object should disturb several channels, or placement is a checklist.
  const probe = spec.build();
  const before = evaluate(probe, person);
  const spot = { x: before.result.worst.x, y: before.result.worst.y };
  const b4 = explain(before.grid, spot.x, spot.y, person.weights);
  const scr = thing('screen', spot.x + 20, spot.y + 20);
  scr.fromTray = true;
  probe.things.push(scr);
  const after = evaluate(probe, person);
  const af = explain(after.grid, spot.x, spot.y, person.weights);
  const moved = DOMAINS.filter(d =>
    Math.abs(b4.find(z => z.domain === d).raw - af.find(z => z.domain === d).raw) > 0.01);
  check('one object moves several channels', moved.length >= 2, `[${moved.join(', ')}]`);
}

console.log(failures === 0
  ? '\nEvery room is unfair to start with and fair to finish.'
  : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
