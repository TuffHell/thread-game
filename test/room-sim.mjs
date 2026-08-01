/**
 * Does the room simulation behave like a room?
 *
 * This is the test that decides whether the design is worth building a game
 * on. It checks four things:
 *
 *   1. The café starts genuinely unusable, so there is a problem to solve.
 *   2. It can be made usable within the budget, so the problem is fair.
 *   3. Moving one object changes several domains at once, so decisions
 *      interact rather than being a checklist.
 *   4. Fixing the loudest thing is not sufficient on its own, so there is
 *      more than one move to find.
 *
 *   node test/room-sim.mjs
 */

import { ROOMS } from '../js/rooms.js';
import { thing, def } from '../js/room.js';
import { makeGrid, compute, combine, explain, DOMAINS } from '../js/field.js';
import { trip, PROFILE } from '../js/visitor.js';

function evaluate (r) {
  const grid = makeGrid(r, 12);
  compute(r, grid);
  combine(grid);
  return { grid, result: trip(r, grid) };
}

function pct (v) { return `${Math.round(v * 100)}%`; }

/** What is actually making a spot bad, worst domain first. */
function breakdown (grid, at) {
  return explain(grid, at.x, at.y)
    .filter(d => d.weighted > 0.005)
    .slice(0, 4)
    .map(d => `${d.domain} ${pct(d.raw)}`)
    .join('  ');
}

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

for (const spec of ROOMS) {
  console.log(`\n== ${spec.title} ==`);

  /* 1. Starts broken --------------------------------------------- */
  const r = spec.build();
  const before = evaluate(r);
  check('starts unusable', !before.result.ok,
    before.result.ok
      ? '(the room is already fine, so there is no puzzle)'
      : `trip ends ${before.result.leg}, ${before.result.reason}` +
        (before.result.blame ? `, worst domain ${before.result.blame.domain}` : ''));

  console.log(`      worst point on route: ${pct(before.result.worst.load)} ` +
    `at ${Math.round(before.result.worst.x)},${Math.round(before.result.worst.y)}`);
  console.log(`      ${breakdown(before.grid, before.result.worst)}`);

  /* 2. Fixable within budget -------------------------------------- */
  const fixed = spec.build();
  // A plausible player solution: move the grinder away from the queue, damp
  // the room, screen the door, and give them somewhere to sit that is not
  // in the middle of it.
  // Move the noisy things off the route rather than merely away from the
  // counter, and buy a refuge plus damping with the four available.
  const g = fixed.things.find(t => t.kind === 'grinder');
  g.x = 130; g.y = 80;
  const spk = fixed.things.find(t => t.kind === 'speaker');
  spk.x = 780; spk.y = 560;
  const fl = fixed.things.find(t => t.kind === 'fluorescent');
  fl.x = 780; fl.y = 80;

  const added = [
    thing('booth', 300, 220),
    // Right beside the machine, which cannot be moved, so the only way to
    // fix the queue is to damp it where it stands.
    thing('panel', 690, 250), thing('panel', 560, 90)
  ];
  added.forEach(t => { t.fromTray = true; fixed.things.push(t); });
  const cost = added.reduce((n, t) => n + (def(t).cost ?? 0), 0);

  const after = evaluate(fixed);
  check('fixable within budget', after.result.ok && cost <= fixed.budget,
    `cost ${cost} of ${fixed.budget}, ` +
    (after.result.ok
      ? `reserve left ${Math.round(after.result.reserve)}`
      : `still fails: ${after.result.reason} ${after.result.leg}`));

  console.log(`      worst point after: ${pct(after.result.worst.load)} ` +
    `at ${Math.round(after.result.worst.x)},${Math.round(after.result.worst.y)}`);
  console.log(`      ${breakdown(after.grid, after.result.worst)}`);

  /* 3. One move touches several domains --------------------------- */
  const probe = spec.build();
  const pg = evaluate(probe);
  const spot = { x: 300, y: 300 };
  const beforeDomains = explain(pg.grid, spot.x, spot.y);

  const screen = thing('screen', 320, 320);
  screen.fromTray = true;
  probe.things.push(screen);
  const pg2 = evaluate(probe);
  const afterDomains = explain(pg2.grid, spot.x, spot.y);

  const moved = DOMAINS.filter(d => {
    const a = beforeDomains.find(x => x.domain === d).raw;
    const b = afterDomains.find(x => x.domain === d).raw;
    return Math.abs(a - b) > 0.01;
  });
  check('one object moves several domains', moved.length >= 2,
    `[${moved.join(', ')}]`);

  /* 4. The loudest fix alone is not enough ------------------------ */
  const partial = spec.build();
  const pgr = partial.things.find(t => t.kind === 'grinder');
  pgr.x = 770; pgr.y = 60;
  const only = evaluate(partial);
  check('silencing the worst source alone is not enough', !only.result.ok,
    only.result.ok
      ? '(one move solves it, so there is no puzzle)'
      : `still ${only.result.reason} ${only.result.leg}`);
}

console.log(failures === 0
  ? '\nThe simulation behaves like a room.'
  : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
