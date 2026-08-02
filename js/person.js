/**
 * The person walking through the room.
 *
 * This file is where monotropism stops being a note in a readme and becomes
 * the simulation.
 *
 * Attention here is a single deep channel, not a pool that spreads. Three
 * things follow from that, and all three are mechanics:
 *
 *   1. Load does not average. One unbearable moment ends the trip no matter
 *      how pleasant the rest of the room is. (in field.js, combine)
 *
 *   2. Being absorbed is protective. The deeper the visitor is into what they
 *      came to do, the less the room costs them. Absorption builds while
 *      nothing disturbs them.
 *
 *   3. An interruption does not cost a little. It collapses the absorption
 *      entirely, and rebuilding it costs far more than keeping it would have.
 *      What decides whether they can rebuild is whether there is somewhere to
 *      settle within reach, which is what makes a quiet corner load bearing
 *      rather than decorative.
 *
 * Masking sits on top: where there are people close by, they hold themselves
 * together, it works, and it runs off the same reserve as everything else.
 */

import { def } from './room.js';
import { sample, explain, DEFAULT_WEIGHTS } from './field.js';

/**
 * Profiles are people, not diagnoses. Each weights the domains differently
 * because autistic people are not sensitive to the same things, which is the
 * most common thing a room designer gets wrong.
 */
export const PEOPLE = {
  mara: {
    name: 'Mara',
    blurb: 'Comes in most Tuesdays. Noise is the one that gets her, and she ' +
           'needs to be able to see the door.',
    weights: { ...DEFAULT_WEIGHTS, sound: 1.0, exposure: 0.75, crowd: 0.8, light: 0.35 },
    spike: 0.42, reserve: 100, absorbs: true
  },
  ollie: {
    name: 'Ollie',
    blurb: 'Fine with noise, undone by flicker and glare. Will not ask anyone ' +
           'to change anything.',
    weights: { ...DEFAULT_WEIGHTS, sound: 0.55, flicker: 1.0, glare: 0.95, light: 0.8 },
    spike: 0.44, reserve: 96, absorbs: true
  },
  jun: {
    name: 'Jun',
    blurb: 'Crowds and being close to strangers. Recovers quickly if there is ' +
           'anywhere at all to go.',
    weights: { ...DEFAULT_WEIGHTS, crowd: 1.0, clutter: 0.7, escape: 0.95, sound: 0.7 },
    spike: 0.46, reserve: 104, absorbs: true
  }
};

export const MODEL = {
  walkSpeed: 90,          // cm per second
  dwellCounter: 14,
  dwellSeat: 40,
  drain: 6,               // reserve per second at full load

  // Absorption. Builds while undisturbed, and discounts the load while it holds.
  absorbRate: 0.085,      // per second
  absorbRelief: 0.55,     // at full absorption, load costs 45 per cent less

  // An interruption takes all of it, and the reserve hit is the cost of
  // getting back rather than the interruption itself.
  interruptCost: 9,
  interruptSpikeBump: 0.22,

  // Settling. Only possible near a refuge, and it is what buys absorption back.
  refugeReach: 260,
  settleRate: 0.16,

  // Masking. Triggered by people being close, works, and costs.
  maskThreshold: 0.34,
  maskDrain: 3.2
};

/** Things that happen in a café. None of them are anyone being unkind. */
export const EVENTS = [
  { at: 0.16, text: 'The door bangs behind them.' },
  { at: 0.46, text: 'Someone asks if they are in the queue.' },
  { at: 0.63, text: 'A tray goes down hard on the counter.' },
  { at: 0.78, text: 'The barista calls a name twice.' },
  { at: 0.9,  text: 'Someone squeezes past, close.' }
];

/* ------------------------------------------------------------------ */

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
      seen.add(n); q.push(n);
    }
  }
  return start;
}

/**
 * A* over the grid, with a real priority queue.
 *
 * The first version kept the frontier in a plain array, scanned it linearly
 * for the cheapest node and called `includes` before every push. On a
 * seventy-by-sixty grid that is quadratic in the frontier and it was, by some
 * distance, the slowest thing in the game — three of these run per person per
 * visit, and a visit runs on every drag and sixty times inside every hint. A
 * binary heap plus an "already open" flag turns the same search into
 * something you cannot feel.
 */
class Heap {
  constructor () { this.a = []; this.f = []; }
  get size () { return this.a.length; }
  push (i, f) {
    const a = this.a, ff = this.f;
    a.push(i); ff.push(f);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (ff[p] <= ff[k]) break;
      [a[p], a[k]] = [a[k], a[p]];
      [ff[p], ff[k]] = [ff[k], ff[p]];
      k = p;
    }
  }
  pop () {
    const a = this.a, ff = this.f;
    const top = a[0];
    const li = a.pop(), lf = ff.pop();
    if (a.length) {
      a[0] = li; ff[0] = lf;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < a.length && ff[l] < ff[m]) m = l;
        if (r < a.length && ff[r] < ff[m]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        [ff[m], ff[k]] = [ff[k], ff[m]];
        k = m;
      }
    }
    return top;
  }
}

// Reused between calls; routing happens thousands of times and the arrays
// are the same shape every time.
const scratch = { n: -1 };
function pads (n) {
  if (scratch.n !== n) {
    scratch.n = n;
    scratch.g = new Float32Array(n);
    scratch.came = new Int32Array(n);
    scratch.state = new Uint8Array(n);
  }
  scratch.g.fill(Infinity);
  scratch.came.fill(-1);
  scratch.state.fill(0);
  return scratch;
}

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
];

export function route (grid, from, to) {
  const start = nearestOpen(grid, from.x, from.y);
  const goal = nearestOpen(grid, to.x, to.y);
  const { cols, rows, load, blocked } = grid;
  const n = cols * rows;
  const { g, came, state } = pads(n);

  const gcol = goal % cols, grow = (goal / cols) | 0;
  const h = i => {
    const dx = (i % cols) - gcol, dy = ((i / cols) | 0) - grow;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const open = new Heap();
  g[start] = 0;
  open.push(start, h(start));
  state[start] = 1;

  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (state[cur] === 2) continue;
    state[cur] = 2;

    const c = cur % cols, r = (cur / cols) | 0;
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nx = nr * cols + nc;
      if (blocked[nx]) continue;
      // Load is a cost, not a wall: a loud route is walkable and expensive,
      // which is what makes the route bend around trouble rather than refuse.
      const step = cost * (1 + load[nx] * 6);
      const alt = g[cur] + step;
      if (alt < g[nx]) {
        g[nx] = alt; came[nx] = cur;
        open.push(nx, alt + h(nx));
        state[nx] = 1;
      }
    }
  }

  if (g[goal] === Infinity) return null;
  const path = [];
  for (let i = goal; i !== -1; i = came[i]) path.push(i);
  return path.reverse();
}

/** Is there anywhere to settle from here? */
function refugeNear (room, x, y) {
  for (const t of room.things) {
    if (!t.placed || !def(t).refuge) continue;
    if (Math.hypot(x - t.x, y - t.y) <= MODEL.refugeReach) return t;
  }
  return null;
}

/**
 * Walk the whole visit and record it moment by moment.
 *
 * The returned steps are what the first person camera follows and what the
 * charts read, so the animation and the verdict cannot disagree: they are the
 * same run.
 */
export function visit (room, grid, person = PEOPLE.mara) {
  const legs = [
    { to: room.goal, dwell: MODEL.dwellCounter, name: 'on the way to the counter' },
    { to: seatOf(room), dwell: MODEL.dwellSeat, name: 'on the way to a seat' },
    { to: room.door, dwell: 0, name: 'on the way back out' }
  ];

  let at = room.door;
  let reserve = person.reserve;
  let absorption = 0;
  let masked = false;

  const steps = [];
  const events = [];
  let worst = { load: -1, x: at.x, y: at.y };
  let maskedSeconds = 0, settledSeconds = 0, absorbedSeconds = 0;
  let outcome = null;

  const totalGuess = 140;   // for placing events along the visit

  for (const leg of legs) {
    const p = route(grid, at, leg.to);
    if (!p) {
      outcome = { ok: false, reason: 'blocked', leg: leg.name };
      break;
    }

    for (let k = 0; k < p.length && !outcome; k++) {
      const i = p[k];
      const x = grid.cx(i), y = grid.cy(i);
      const raw = grid.load[i];
      const seconds = grid.cell / MODEL.walkSpeed;

      // Absorption discounts what the room costs, and grows while undisturbed.
      const relief = 1 - absorption * MODEL.absorbRelief;
      const felt = raw * relief;

      // Masking, if there are people close enough to be held together for.
      const crowd = grid.layers.crowd[i];
      masked = crowd > MODEL.maskThreshold;

      if (felt > worst.load) worst = { load: felt, x, y };

      // Anything past the spike ends it, and absorption raises the bar a
      // little, which is why an absorbed person can walk past something that
      // would stop them cold on the way back out.
      const ceiling = person.spike + absorption * MODEL.interruptSpikeBump;
      if (felt >= ceiling) {
        outcome = {
          ok: false, reason: 'spike', leg: leg.name,
          at: { x, y, load: felt }, blame: explain(grid, x, y, person.weights)[0]
        };
        break;
      }

      reserve -= felt * MODEL.drain * seconds;
      if (masked) { reserve -= MODEL.maskDrain * seconds; maskedSeconds += seconds; }

      // Settling, if there is somewhere to do it and they need to.
      const refuge = refugeNear(room, x, y);
      if (refuge && absorption < 0.6) {
        absorption = Math.min(1, absorption + MODEL.settleRate * seconds * 3);
        settledSeconds += seconds;
      } else {
        absorption = Math.min(1, absorption + MODEL.absorbRate * seconds);
      }
      if (absorption > 0.5) absorbedSeconds += seconds;

      steps.push({
        x, y, load: felt, raw, absorption, reserve: Math.max(0, reserve),
        masked, refuge: !!refuge
      });

      // Something happens. It collapses absorption, which is the whole cost.
      const progress = steps.length / totalGuess;
      for (const ev of EVENTS) {
        if (ev.fired || progress < ev.at) continue;
        ev.fired = true;
        const hadRefuge = !!refuge;
        absorption = 0;
        reserve -= MODEL.interruptCost * (hadRefuge ? 0.55 : 1);
        events.push({
          text: ev.text, x, y, index: steps.length - 1,
          recoverable: hadRefuge
        });
      }

      if (reserve <= 0) {
        outcome = {
          ok: false, reason: 'spent', leg: leg.name,
          at: { x, y, load: felt }, blame: explain(grid, x, y, person.weights)[0]
        };
        break;
      }
    }

    if (outcome) break;

    // Standing still, integrated rather than charged as one lump.
    //
    // Absorption keeps building while they wait, so a long sit costs less per
    // second as it goes on. That is the point of the whole model: someone
    // settled at a table with their coffee is deep in something, and the room
    // recedes. Charging the whole dwell at the absorption they arrived with
    // made sitting down uniformly fatal and quietly deleted the mechanic.
    if (leg.dwell) {
      const end = steps[steps.length - 1];
      if (end) {
        const slices = 8;
        const dt = leg.dwell / slices;
        for (let n = 0; n < slices && !outcome; n++) {
          const relief = 1 - absorption * MODEL.absorbRelief;
          const felt = end.raw * relief;
          if (felt >= person.spike + absorption * MODEL.interruptSpikeBump) {
            outcome = {
              ok: false, reason: 'spike', leg: `waiting, ${leg.name}`,
              at: end, blame: explain(grid, end.x, end.y, person.weights)[0]
            };
            break;
          }
          reserve -= felt * MODEL.drain * dt;
          absorption = Math.min(1, absorption + MODEL.absorbRate * dt);
          if (reserve <= 0) {
            outcome = {
              ok: false, reason: 'spent', leg: `waiting, ${leg.name}`,
              at: end, blame: explain(grid, end.x, end.y, person.weights)[0]
            };
            break;
          }
        }
        if (outcome) break;
      }
    }
    at = leg.to;
  }

  for (const ev of EVENTS) ev.fired = false;

  if (!outcome) outcome = { ok: true };
  return {
    ...outcome,
    person,
    path: steps,
    events,
    reserve: Math.max(0, reserve),
    worst,
    maskedSeconds, settledSeconds, absorbedSeconds
  };
}

function seatOf (room) {
  const s = room.things.find(t => t.placed && t.kind === 'seat');
  return s ? { x: s.x, y: s.y } : room.goal;
}
