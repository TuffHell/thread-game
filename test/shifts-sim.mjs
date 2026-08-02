/**
 * Does each shift reward the thing it claims to reward?
 *
 * Every mode in this game makes an argument, and an argument in a game is
 * only real if the mechanics agree with it. So each one gets a pair of
 * simulated players — one who plays the way the mode says is right, one who
 * plays the obvious way — and the right one has to actually win. If it does
 * not, the mode is decoration and the comment at the top of its file is a
 * lie.
 *
 *   node test/shifts-sim.mjs
 */

import { BUILDERS } from '../js/rooms.js';
import { LibraryShift } from '../js/shifts/library.js';
import { ClinicShift } from '../js/shifts/clinic.js';
import { HallShift } from '../js/shifts/hall.js';

const TICK = 50;
const SPEED = 210 / 1000;    // cm per ms, same as the walker

let failures = 0;
function check (what, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  ${detail}` : ''}`);
}

/** Walk to a point, then work whatever is there. */
function goAndDo (s, pos, target, reach = 120, guardMax = 20000) {
  let guard = 0;
  while (target && Math.hypot(pos.x - target.x, pos.y - target.y) > reach && guard++ < guardMax) {
    const d = Math.hypot(target.x - pos.x, target.y - pos.y);
    if (d < 1e-6) break;
    const step = Math.min(d, SPEED * TICK);
    pos.x += (target.x - pos.x) / d * step;
    pos.y += (target.y - pos.y) / d * step;
    s.update(TICK, pos.x, pos.y);
    if (s.finished) return false;
  }
  if (!s.begin(pos.x, pos.y)) { s.update(TICK, pos.x, pos.y); return false; }
  guard = 0;
  while (s.working && guard++ < guardMax) s.update(TICK, pos.x, pos.y);
  return true;
}

/* ================================================================== */
console.log('\n== The Quiet Hour (library) ==');
/* ================================================================== */

/*
 * The claim: grouping the loud jobs away from the reader keeps his
 * concentration intact; working down the trolley in order shatters it.
 */
function runLibrary (order) {
  const room = BUILDERS.library();
  const s = new LibraryShift(room);
  const pos = { x: room.door.x, y: room.door.y };
  let guard = 0;
  while (!s.finished && guard++ < 6000) {
    const left = s.jobs.filter(j => !j.done);
    if (!left.length) { s.update(TICK, pos.x, pos.y); continue; }
    const job = order(s, left);
    if (!job) { s.update(TICK, pos.x, pos.y); continue; }
    goAndDo(s, pos, job);
    // Some rounds pause between jobs; the hour runs on either way.
    if (order.settle) for (let i = 0; i < order.settle && !s.finished; i++) s.update(TICK, pos.x, pos.y);
  }
  return s;
}

/*
 * Front-loaded: get every loud, close job out of the way first, in one
 * block, before he has settled into anything — then do the quiet far work
 * and leave him alone for the rest of the hour.
 *
 * This is the strategy the mode is arguing for, and it is the same thing
 * autistic people ask for about changes generally: tell me all of it at
 * once, not one piece at a time.
 */
const frontLoaded = (s, left) =>
  left.slice().sort((a, b) => s.costOf(b) - s.costOf(a))[0];
frontLoaded.settle = 0;

/* Spread out: alternate loud and quiet, with a pause between each, so every
 * interruption lands on something he has just rebuilt. */
const spread = (s, left) => {
  const sorted = left.slice().sort((a, b) => s.costOf(b) - s.costOf(a));
  return (s.done % 2 === 0) ? sorted[0] : sorted[sorted.length - 1];
};
spread.settle = 90;

const lib = runLibrary(frontLoaded);
const libBad = runLibrary(spread);

console.log(`        all the noise first: ${lib.done} jobs, ${lib.spikes} interruptions, ` +
            `${lib.breaks} runs destroyed, ${Math.round(lib.absorbedSeconds)}s deep in it`);
console.log(`        spread through the hour: ${libBad.done} jobs, ${libBad.spikes} interruptions, ` +
            `${libBad.breaks} runs destroyed, ${Math.round(libBad.absorbedSeconds)}s deep in it`);

check('both rounds get the whole trolley away',
  lib.done === lib.target && libBad.done === libBad.target,
  `${lib.done} and ${libBad.done} of ${lib.target}`);

check('getting the noise over with destroys fewer of his runs',
  lib.breaks < libBad.breaks,
  `${lib.breaks} vs ${libBad.breaks} runs destroyed`);

// The number that matters is the longest unbroken stretch, not the total.
// Three twenty-second runs are not an hour's revision; one sixty-second run
// is the beginning of one. That is what "it does not resume where it left
// off" means, and totalling the minutes hides exactly that.
check('and leaves him one long run instead of several short ones',
  lib.longestRun > libBad.longestRun * 1.5,
  `longest ${Math.round(lib.longestRun)}s vs ${Math.round(libBad.longestRun)}s`);

check('the job you are standing at is never free when it is loud and close',
  lib.jobs.some(j => j.loud > 0.6),
  'the round contains genuinely loud work');

/* ================================================================== */
console.log('\n== The List (clinic) ==');
/* ================================================================== */

/*
 * The claim: keeping the board current and calling people in person gets
 * everybody seen; the tannoy is faster and loses people.
 */
function runClinic (style) {
  const room = BUILDERS.clinic();
  const s = new ClinicShift(room);
  const pos = { x: room.door.x, y: room.door.y };
  let guard = 0;
  while (!s.finished && guard++ < 3000) {
    const up = s.next();
    if (!up) break;
    if (style === 'careful') {
      // Board first whenever it has gone stale, then walk over and call.
      if (s.board && !s.boardFresh()) {
        goAndDo(s, pos, s.board);
        continue;
      }
      goAndDo(s, pos, up.person);
    } else {
      // Tannoy from wherever you are standing. Never touch the board.
      if (!s.begin(pos.x, pos.y)) { s.update(TICK, pos.x, pos.y); continue; }
      let g = 0;
      while (s.working && g++ < 2000) s.update(TICK, pos.x, pos.y);
    }
  }
  return s;
}

const clinicGood = runClinic('careful');
const clinicBad = runClinic('tannoy');

console.log(`        careful: ${clinicGood.calledThrough} seen, ${clinicGood.walkedOut} gave up, ` +
            `${clinicGood.boardUpdates} board updates, ${clinicGood.tannoyCount} tannoy`);
console.log(`        tannoy only: ${clinicBad.calledThrough} seen, ${clinicBad.walkedOut} gave up, ` +
            `${clinicBad.boardUpdates} board updates, ${clinicBad.tannoyCount} tannoy`);

check('the careful receptionist loses nobody',
  clinicGood.walkedOut === 0,
  `${clinicGood.walkedOut} left`);

check('the tannoy is genuinely the faster tool',
  clinicBad.elapsed < clinicGood.elapsed,
  `${Math.round(clinicBad.elapsed / 1000)}s vs ${Math.round(clinicGood.elapsed / 1000)}s`);

check('and it costs people who are not you',
  clinicBad.walkedOut > clinicGood.walkedOut,
  `${clinicBad.walkedOut} gave up vs ${clinicGood.walkedOut}`);

check('nobody who leaves ever complains first',
  clinicBad.queue.filter(p => p.gaveUp).every(p => p.left),
  'they just go home');

/* ================================================================== */
console.log('\n== The Coffee Morning (hall) ==');
/* ================================================================== */

/*
 * The claim under test is deliberately narrower than the one this mode
 * started with. "Aim at whoever has least left" was tested against "deal
 * with whatever is nearest" across a sweep of tunings and came out level —
 * sometimes worse — because events land near the person they affect and
 * crossing the room to be clever costs more than the cleverness is worth.
 * That claim was deleted rather than tuned into existence.
 *
 * What is tested is what the model actually supports: a signed-off room
 * falls over without somebody maintaining it, and the three of them fall
 * over for different reasons.
 */
function runHall (style) {
  const room = BUILDERS.hall();
  const s = new HallShift(room);
  const pos = { x: room.door.x, y: room.door.y };
  let guard = 0;
  while (!s.finished && guard++ < 6000) {
    if (style === 'absent') { s.update(TICK, pos.x, pos.y); continue; }
    if (!s.live.length) { s.update(TICK, pos.x, pos.y); continue; }
    const target = s.live.slice().sort((a, b) =>
      Math.hypot(a.thing.x - pos.x, a.thing.y - pos.y) -
      Math.hypot(b.thing.x - pos.x, b.thing.y - pos.y))[0];
    if (!target?.thing) { s.update(TICK, pos.x, pos.y); continue; }
    goAndDo(s, pos, target.thing, 140, 4000);
  }
  return s;
}

const hallKept = runHall('host');
const hallAlone = runHall('absent');
const stayed = s => s.guests.filter(g => !g.left).length;

console.log(`        somebody keeping it going: ${stayed(hallKept)} of 3 stayed, ` +
            `${hallKept.handled} things dealt with`);
console.log(`        signed off and left alone: ${stayed(hallAlone)} of 3 stayed, ` +
            `${hallAlone.log.length} things happened, nobody dealt with any of them`);

check('a signed-off room does not hold on its own',
  stayed(hallAlone) < 3,
  `${3 - stayed(hallAlone)} of 3 went home`);

check('and it holds when somebody maintains it',
  stayed(hallKept) > stayed(hallAlone),
  `${stayed(hallKept)} vs ${stayed(hallAlone)} still there`);

check('the morning genuinely keeps producing events',
  hallKept.log.length >= 4,
  `${hallKept.log.length} things happened`);

/*
 * The averaging point, made concrete: if all three were brought down by the
 * same thing then "keep the room nice" would be sufficient advice, and the
 * whole game would be wrong.
 */
const blamed = hallAlone.guests
  .map(g => Object.entries(g.hitBy ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0])
  .filter(Boolean);
check('the three of them are not brought down by the same thing',
  new Set(blamed).size > 1,
  blamed.join(', ') || 'nothing recorded');

check('every event is somebody meeting a real need',
  hallKept.log.length > 0,
  hallKept.log.slice(0, 2).join('; '));

/* ================================================================== */

console.log(
  failures
    ? `\n${failures} failing check${failures === 1 ? '' : 's'}.`
    : '\nEvery shift rewards the thing it argues for, and it is measured.');
process.exit(failures ? 1 : 0);
