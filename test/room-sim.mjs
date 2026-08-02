/**
 * Does every commission behave like a puzzle, and can it actually be won?
 *
 * The search lives in js/solver.js, not here, because the same code powers
 * the in-game hint button. If a nudge given to a stuck player would be
 * wrong, this test goes red — which is a much stronger guarantee than
 * hand-written tips nobody re-checks.
 *
 *   node test/room-sim.mjs
 */

import { COMMISSIONS } from '../js/campaign.js';
import { BUILDERS } from '../js/rooms.js';
import { thing, def } from '../js/room.js';
import { explain, DOMAINS } from '../js/field.js';
import { PEOPLE } from '../js/person.js';
import { evaluate, play, bestMove } from '../js/solver.js';

function buildFor (c) {
  const r = BUILDERS[c.room]();
  if (c.budget != null) r.budget = c.budget;
  return r;
}

const pct = v => `${Math.round(v * 100)}%`;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

for (const c of COMMISSIONS) {
  const people = c.people.map(k => PEOPLE[k]);
  console.log(`\n== ${c.title}  (${people.map(p => p.name).join(', ')}) ==`);

  const start = evaluate(buildFor(c), c.constraints, people);
  const failing = start.results.find(r => !r.ok);

  check('owner rules hold at the start', start.broken.length === 0,
    start.broken.map(b => b.text).join(' '));
  check('starts unusable', !!failing,
    failing
      ? `${failing.person.name}: ${failing.reason} ${failing.leg}` +
        (failing.blame ? `, worst domain ${failing.blame.domain}` : '')
      : '(already fine, so there is no puzzle)');
  if (failing) console.log(`        worst for ${failing.person.name}: ${pct(failing.worst.load)}`);

  const solved = play(buildFor(c), c.constraints, people);
  check('solvable within budget and rules', solved.ev.ok && solved.cost <= (c.budget ?? 99),
    solved.ev.ok
      ? `${solved.log.length} moves, cost ${solved.cost}, ` +
        `tightest reserve ${Math.round(Math.min(...solved.ev.results.map(x => x.reserve)))}`
      : 'search gave up');
  if (solved.log.length) console.log(`        ${solved.log.join(' → ')}`);

  check('needs more than one move', solved.log.length >= 2, `${solved.log.length} move(s)`);

  // The hint button must have something useful to say on a stuck board, or
  // a player who asks for help gets nothing at the exact moment they need it.
  const stuck = buildFor(c);
  const stuckEv = evaluate(stuck, c.constraints, people);
  const hint = bestMove(stuck, c.constraints, people, stuckEv, 60);
  check('a hint exists from the opening position', !!hint,
    hint ? `"${hint.cand.label}"` : 'no move improves anything');

  check('interruptions still occur in the finished room',
    solved.ev.results.some(res => res.events.length > 0),
    `${solved.ev.results.reduce((n, res) => n + res.events.length, 0)} across the signed-off visit`);
}

console.log(failures === 0
  ? '\nEvery commission starts unfair, can be finished fairly, and can be hinted.'
  : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
