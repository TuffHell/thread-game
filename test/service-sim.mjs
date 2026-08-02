/**
 * Does the Quiet Service actually reward the thing it claims to reward?
 *
 * The mode's whole argument is that deep, batched attention is the efficient
 * strategy — not a moral preference, an actual mechanical advantage. That is
 * a testable claim, so it is tested. Two simulated players work identical
 * mornings in an identical café:
 *
 *   BATCHER   fills the tray with grinds, then pulls, then steams, then walks
 *             the whole tray out and hands them over, then collects the cups.
 *             Monotropic play.
 *   SWITCHER  takes whatever order is oldest and pushes it one step, round
 *             robin — make one, walk it out, come back. Classic kitchen-game
 *             play, and now literally more walking as well as more switching.
 *
 * If the switcher wins, or ties, the mechanic is decoration and the claim in
 * service.js is false.
 *
 *   node test/service-sim.mjs
 */

import { BUILDERS } from '../js/rooms.js';
import { Service, STEPS } from '../js/service.js';

const TICK = 50;   // ms per simulated frame

/** Walk toward a station at a plausible pace, then work it. */
function runMorning (pickNext, opts = {}) {
  const room = BUILDERS.cafe();
  const svc = new Service(room);
  svc.target = opts.target ?? 8;

  // Start at the door.
  let x = room.door.x, y = room.door.y;
  const speed = 210 / 1000;      // cm per ms, same as the walker
  let guard = 0;

  while (!svc.finished && guard++ < 200000) {
    const choice = pickNext(svc);
    if (!choice) { svc.update(TICK, x, y); continue; }

    const st = svc.stationFor(choice.step, choice.order);
    if (!st) { svc.update(TICK, x, y); continue; }

    // Serving and clearing happen at a person or a cup, not at the bar.
    const near = choice.step === 'serve' || choice.step === 'clear' ? 100 : 140;

    // Walk to it.
    while (Math.hypot(x - st.x, y - st.y) > near && guard++ < 200000) {
      const d = Math.hypot(st.x - x, st.y - y);
      if (d < 1e-6) break;
      const step = Math.min(d, speed * TICK);
      x += (st.x - x) / d * step;
      y += (st.y - y) / d * step;
      svc.walked += step;
      svc.update(TICK, x, y);
    }

    // Work it.
    if (!svc.begin(x, y, choice.step)) { svc.update(TICK, x, y); continue; }
    while (svc.working && guard++ < 200000) svc.update(TICK, x, y);
  }
  return svc;
}

/** Monotropic: exhaust one kind of action before moving to the next. */
const batcher = svc => {
  const avail = svc.available();
  for (const step of STEPS) {
    const hit = avail.find(a => a.step === step);
    if (hit) return hit;
  }
  return null;
};

/** Task-switching: push the oldest order along, whatever it needs. */
const switcher = svc => svc.available()[0] ?? null;

/* ------------------------------------------------------------------ */

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

console.log('\n== The Quiet Service ==');

const b = runMorning(batcher);
const s = runMorning(switcher);

const bSec = Math.round(b.elapsed / 1000);
const sSec = Math.round(s.elapsed / 1000);
console.log(`        batching : ${b.served} served in ${bSec}s, ` +
  `${b.switches} switches, flow ended ${b.flow.toFixed(2)}`);
console.log(`        switching: ${s.served} served in ${sSec}s, ` +
  `${s.switches} switches, flow ended ${s.flow.toFixed(2)}`);

check('both approaches finish the morning', b.served === 8 && s.served === 8,
  `${b.served} and ${s.served} served`);

// The headline claim.
check('batching is meaningfully faster than task-switching', bSec < sSec * 0.92,
  `${bSec}s vs ${sSec}s (${Math.round((1 - bSec / sSec) * 100)}% quicker)`);

// Mean flow across the whole shift, not the reading at the end. Both players
// finish on a run of the same action — collecting the last few cups — so the
// final number flatters the switcher for the one stretch where they stopped
// switching. What the mode actually claims is about the whole morning.
const bFlow = b.flowArea / b.elapsed, sFlow = s.flowArea / s.elapsed;
check('batching holds flow across the shift, switching keeps losing it',
  bFlow > sFlow + 0.2,
  `mean ${bFlow.toFixed(2)} vs ${sFlow.toFixed(2)}`);

check('switching really does switch more', s.switches > b.switches * 2,
  `${s.switches} vs ${b.switches}`);

// No failure state anywhere: nothing expires, nothing is lost, nobody is angry.
const svc = new Service(BUILDERS.cafe());
const before = svc.orders.length;
for (let i = 0; i < 4000; i++) svc.update(TICK, 0, 0);   // stand still for 200s
check('orders never expire while you do nothing',
  svc.orders.length === before && svc.served === 0,
  `${svc.orders.length} still waiting, none lost`);

// The accessible layout must stay playable: exile the grinder and the morning
// should get a little longer, not become a different game.
const far = BUILDERS.cafe();
const g = far.things.find(t => t.kind === 'grinder');
g.x = 100; g.y = 90;
const svcFar = new Service(far);
let fx = far.door.x, fy = far.door.y, guard = 0;
const speed = 210 / 1000;
while (!svcFar.finished && guard++ < 200000) {
  const choice = batcher(svcFar);
  if (!choice) { svcFar.update(TICK, fx, fy); continue; }
  const st = svcFar.stationFor(choice.step, choice.order);
  const nearF = choice.step === 'serve' || choice.step === 'clear' ? 100 : 140;
  while (st && Math.hypot(fx - st.x, fy - st.y) > nearF && guard++ < 200000) {
    const d = Math.hypot(st.x - fx, st.y - fy);
    if (d < 1e-6) break;
    const step = Math.min(d, speed * TICK);
    fx += (st.x - fx) / d * step; fy += (st.y - fy) / d * step;
    svcFar.update(TICK, fx, fy);
  }
  if (!svcFar.begin(fx, fy, choice.step)) { svcFar.update(TICK, fx, fy); continue; }
  while (svcFar.working && guard++ < 200000) svcFar.update(TICK, fx, fy);
}
const farSec = Math.round(svcFar.elapsed / 1000);
console.log(`        grinder exiled, batching: ${farSec}s (vs ${bSec}s in place)`);
check('an accessible layout stays comfortably playable when batched',
  svcFar.served === 8 && farSec < bSec * 1.6,
  `${farSec}s, ${Math.round((farSec / bSec - 1) * 100)}% longer`);

console.log(failures === 0
  ? '\nDeep attention is the efficient strategy, and it is measured, not asserted.'
  : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
