/**
 * Level solvability check.
 *
 * Simulates the policy a player actually follows: find the strand that is
 * currently blocking the signal, go into it, and tune whichever sub-strand
 * moves the bundle's average closest to what the signal needs. If that
 * policy cannot finish a level, the level is broken.
 *
 *   node test/solvable.mjs
 */

import { LEVELS } from '../js/levels.js';
import {
  solve, frontier, effectiveFreq, isLeaf, canTune, tune
} from '../js/weave.js';
import { freqDistance, RULES } from '../js/config.js';

/** Every tunable leaf inside a strand, at any depth, optionally depth capped. */
function tunableLeaves (s, out = [], depth = 0, maxDepth = Infinity) {
  if (isLeaf(s)) {
    if (canTune(s)) out.push(s);
    return out;
  }
  if (depth >= maxDepth) return out;
  for (const c of s.inner.strands) tunableLeaves(c, out, depth + 1, maxDepth);
  return out;
}

/** Run the whole policy on a fresh copy of a level and report success. */
function attempt (def, maxDepth) {
  const w = def.build().weave;
  let steps = 0;
  while (!solve(w) && steps < 400) {
    const f = frontier(w);
    if (!f) break;
    if (!stepToward(f.strand, f.need, maxDepth)) break;
    steps++;
  }
  return { solved: !!solve(w), steps };
}

/** Move a bundle's average toward a target by one tune. Returns success. */
function stepToward (holder, target, maxDepth = Infinity) {
  const leaves = tunableLeaves(holder, [], 0, maxDepth);
  if (!leaves.length) return false;

  const before = freqDistance(target, effectiveFreq(holder));
  let best = null;

  for (const leaf of leaves) {
    for (const dir of [1, -1]) {
      tune(leaf, dir);
      const after = freqDistance(target, effectiveFreq(holder));
      tune(leaf, -dir);
      if (after < before - 1e-9 && (!best || after < best.after)) {
        best = { leaf, dir, after };
      }
    }
  }
  if (!best) return false;
  tune(best.leaf, best.dir);
  return true;
}

let failures = 0;

for (const def of LEVELS) {
  const built = def.build();
  const w = built.weave;
  let steps = 0;
  const MAX = 400;

  let stuck = null;
  while (!solve(w) && steps < MAX) {
    const f = frontier(w);
    if (!f) { stuck = 'no frontier: the signal cannot leave the source'; break; }
    if (!stepToward(f.strand, f.need)) {
      stuck = `cannot move bundle ${f.strand.id} ` +
        `(at ${effectiveFreq(f.strand).toFixed(3)}) to ${f.need.toFixed(3)}; ` +
        `off by ${f.off.toFixed(3)}, tolerance ${RULES.tolerance}`;
      break;
    }
    steps++;
  }
  if (!stuck && steps >= MAX) {
    const f = frontier(w);
    stuck = `thrashing: still blocked at ${f ? f.strand.id : '?'} after ${MAX} tunes. ` +
      `Chain hops are probably too large for the tolerance.`;
  }

  const done = !!solve(w);
  const depth = (function maxDepth (weave, d = 0) {
    let m = d;
    for (const s of weave.strands) {
      if (!isLeaf(s)) m = Math.max(m, maxDepth(s.inner, d + 1));
    }
    return m;
  })(w);

  // If a level nests two deep, tuning limited to the first level down must
  // NOT be enough, or the nesting is decoration.
  let depthNote = '';
  if (depth >= 2) {
    const shallow = attempt(def, 1);
    depthNote = shallow.solved
      ? '  <-- solvable without ever going to depth 2'
      : '  (depth 2 required)';
    if (shallow.solved) failures++;
  }

  if (!done) failures++;
  console.log(
    `${done ? 'PASS' : 'FAIL'}  ${def.id.padEnd(14)}  ` +
    `tunes=${String(steps).padStart(3)}  maxDepth=${depth}  ` +
    `strands=${w.strands.length}${depthNote}`
  );
  if (stuck) console.log(`      ${stuck}`);
}

console.log(
  failures === 0
    ? `\nAll ${LEVELS.length} levels solvable.`
    : `\n${failures} level(s) not solvable by the player policy.`
);
process.exit(failures === 0 ? 0 : 1);
