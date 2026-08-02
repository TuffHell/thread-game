/**
 * The Quiet Service.
 *
 * You work the Tuesday morning in a café you have already fixed. Grind, pull,
 * steam, serve. It is deliberately the inverse of every kitchen game ever
 * made, and the inversion is the argument.
 *
 * WHY THIS IS NOT OVERCOOKED
 *
 * Overcooked's core loop is forced task-switching against expiring timers.
 * As a piece of design that is a simulator of the thing that hurts: orders
 * rot, alarms sound, and the winning play is to keep every plate spinning at
 * once. Handing that to an autistic player as "relief" would be a joke at
 * their expense.
 *
 * So every one of those pressures is removed and replaced by its opposite:
 *
 *   Orders never expire.        Nobody is ever angry, nothing is ever binned,
 *                               there is no failure state anywhere in here.
 *
 *   Switching costs, not time.  FLOW builds while you repeat one action and
 *                               collapses when you change to another. Speed
 *                               comes from depth, not from hurry.
 *
 *   Batching is optimal.        Grinding four in a row genuinely beats
 *                               grind-pull-grind-pull. The efficient strategy
 *                               and the monotropic strategy are the same
 *                               strategy, which is the entire point.
 *
 *   The room still matters.     Station distance comes from where YOU put
 *                               things in the survey. Move the grinder into
 *                               a far corner to protect Mara and the walk
 *                               gets longer — but batching absorbs it almost
 *                               completely, so the accessible layout is only
 *                               expensive if you play by task-switching.
 *
 * That last one is the honest bit. Accommodations have real costs; this shows
 * the cost and then shows it is payable, rather than pretending it is zero.
 */

import { def, thing } from './room.js';

export const STEPS = ['grind', 'pull', 'steam', 'serve', 'clear'];

export const STEP_LABEL = {
  grind: 'Grind', pull: 'Pull a shot', steam: 'Steam milk',
  serve: 'Hand it over', clear: 'Clear the table'
};

/**
 * Which object in the room you have to stand at for each step.
 *
 * The last two are not fixed points: serving happens wherever the person is
 * sitting, and clearing happens wherever they left their cup. That is the
 * whole shape of the mode now — you make a run of drinks at the bar, then
 * you walk them out into the room and give them to people, then you go back
 * round and collect the cups. It is the rhythm of an actual café shift, and
 * it puts you among the customers rather than behind a hatch.
 */
const STATION_KIND = {
  grind: 'grinder',
  pull: 'machine',
  steam: 'machine'
};

/** Steps done at the bar, in order, before a drink can be carried out. */
const PREP = ['grind', 'pull', 'steam'];

export const MODEL = {
  reach: 150,             // cm; how close you must be to work a station
  handReach: 110,         // cm; how close to hand something to somebody
  baseSeconds: 2.6,       // one action at zero flow
  handSeconds: 0.9,       // giving somebody their coffee, or picking up a cup
  flowFloor: 0.45,        // at full flow an action takes 45% of base

  // How many finished drinks you can carry at once.
  //
  // This is the batching rule made physical. One at a time would force
  // make-walk-make-walk, which is the task-switching pattern the whole mode
  // exists to argue against; a tray means the efficient thing to do is make
  // four and then deliver four, which is also the monotropic thing to do.
  trayCapacity: 4,

  flowGain: 0.15,         // per completed action of the same kind
  flowDecay: 0.5,         // proportion LOST when you switch to another kind
  // Walking between stations must not shred the run you have built, or the
  // accessible layout — where things are further apart — quietly becomes
  // the punished one. Flow ebbs slowly; only switching really costs.
  flowIdle: 0.012,

  // Drinks that ask for milk need the extra step.
  milkChance: 0.5
};

/**
 * What people say when you hand them their coffee.
 *
 * Small, ordinary, and never about the café being accessible — nobody thanks
 * a room for existing. They are here for a coffee and they got one, and the
 * work you did in the survey is the reason that was uneventful. The lines
 * are the payoff for the survey being invisible.
 */
const LINES = [
  'Oh — lovely, thank you.',
  'Perfect, cheers.',
  'You read my mind.',
  'That was quick.',
  'Thanks. I needed this.',
  'Ah, brilliant.',
  'Cheers, that\u2019s me sorted.',
  'Thank you — I\u2019ll get out of your way.',
  'Just what I wanted.',
  'Ta.'
];
const REGULARS = [
  'Same as always. You remembered.',
  'It\u2019s quieter in here than it used to be.',
  'I can actually hear myself think today.',
  'I sat down without thinking about it. That\u2019s new.'
];

function lineFor (order) {
  // Roughly one in three says something about the room rather than the
  // coffee, and never in so many words.
  const bank = order.n % 3 === 0 ? REGULARS : LINES;
  return bank[(order.n * 7 + uid) % bank.length];
}

let uid = 0;

function makeOrder (n) {
  const milk = Math.random() < MODEL.milkChance;
  const needs = milk ? ['grind', 'pull', 'steam', 'serve'] : ['grind', 'pull', 'serve'];
  return {
    id: `ord${++uid}`,
    n,
    name: milk ? 'flat white' : 'espresso',
    needs,
    done: 0,
    ready: false,      // prepped and on your tray
    delivered: false
  };
}

export class Service {
  constructor (room) {
    this.room = room;
    this.reset();
  }

  reset () {
    uid = 0;
    this.orders = [];
    this.served = 0;
    this.flow = 0;
    this.lastStep = null;
    this.working = null;      // { step, order, t, need }
    this.elapsed = 0;
    this.actions = 0;
    this.switches = 0;
    this.walked = 0;
    this.finished = false;
    this.tray = [];           // finished drinks in your hands
    this.messes = [];         // cups left behind, waiting to be cleared
    this.cleared = 0;
    this.said = null;         // what the last person you served said
    this.flowArea = 0;
    // The whole morning is on the board from the start.
    //
    // Drip-feeding orders as you serve them, which is how kitchen games do
    // it, makes batching impossible by construction: every completed drink
    // spawns a fresh grind and drags you back. Showing all the work at once
    // lets you see it, plan it, and work through it in runs — and it is a
    // calmer thing to look at than a queue that never ends.
    this.target = 8;
    for (let i = 0; i < this.target; i++) this.orders.push(makeOrder(i + 1));
    this.spawnCustomers();
  }

  /**
   * Put a person in the room for every order.
   *
   * They are real things in room.things, so they emit crowd and sound into
   * the same field everything else does, and they are solid to walk around.
   * The loop this creates is the good one: the café starts loud because it
   * is full, and every drink you finish is one fewer body and one less
   * voice. You are not clearing a queue, you are quieting a room.
   */
  spawnCustomers () {
    this.clearCustomers();
    const spots = this.waitingSpots();
    this.orders.forEach((o, i) => {
      const p = spots[i % spots.length];
      const jitter = (i / spots.length | 0) * 46;
      const c = thing('customer', p.x + jitter, p.y + jitter);
      c.isCustomer = true;
      o.customer = c;
      this.room.things.push(c);
    });
  }

  /** Take everyone and everything the shift put in the room back out. */
  clearCustomers () {
    this.room.things = this.room.things.filter(t => !t.isCustomer);
    this.messes = [];
  }

  /** Standing room: near the counter, and beside the tables. */
  waitingSpots () {
    const counter = this.room.things.find(t => t.placed && t.kind === 'counter');
    const out = [];
    if (counter) {
      for (const [dx, dy] of [[-150, 120], [-60, 170], [40, 190], [-200, 40]]) {
        out.push({ x: counter.x + dx, y: counter.y + dy });
      }
    }
    for (const t of this.room.things) {
      if (t.placed && t.kind === 'seat') out.push({ x: t.x + 70, y: t.y + 30 });
    }
    return out.length ? out : [{ x: this.room.w / 2, y: this.room.h / 2 }];
  }

  /** Where the station for a step physically is, in this room. */
  stationFor (step, order = null) {
    // Serving happens at the person, clearing happens at the cup.
    if (step === 'serve') return order?.customer ?? null;
    if (step === 'clear') return order ?? null;
    const kind = STATION_KIND[step];
    return this.room.things.find(t => t.placed && t.kind === kind) ?? null;
  }

  /**
   * Everything you could be doing, wherever you are standing.
   *
   * Prep only counts while there is room on the tray — full hands are the
   * game telling you to go and talk to somebody.
   */
  available () {
    const out = [];
    const room = MODEL.trayCapacity - this.tray.length;
    for (const o of this.orders) {
      if (o.delivered) continue;
      const step = o.needs[o.done];
      if (step === 'serve') {
        if (o.ready) out.push({ order: o, step: 'serve' });
        continue;
      }
      if (room > 0) out.push({ order: o, step });
    }
    for (const m of this.messes) out.push({ order: m, step: 'clear' });
    return out;
  }

  /**
   * What you could do standing exactly here.
   *
   * Stations can overlap — in the café the counter and the grinder are close
   * enough to be in reach at once — so when several actions are possible the
   * choice matters. It continues whatever you were already doing before it
   * offers you anything else. That is the batching behaviour the mode is
   * built on, and picking arbitrarily instead silently shredded it.
   */
  atHand (x, y, prefer = null) {
    const inReach = [];
    for (const a of this.available()) {
      const st = this.stationFor(a.step, a.order);
      if (!st) continue;
      const reach = a.step === 'serve' || a.step === 'clear' ? MODEL.handReach : MODEL.reach;
      if (Math.hypot(x - st.x, y - st.y) <= reach) inReach.push({ ...a, station: st });
    }
    if (!inReach.length) return null;
    // Standing in front of somebody holding their coffee, the thing you want
    // to do is give it to them. Everything else waits.
    return inReach.find(a => a.step === prefer)
      ?? inReach.find(a => a.step === 'serve')
      ?? inReach.find(a => a.step === 'clear')
      ?? inReach.find(a => a.step === this.lastStep)
      ?? inReach[0];
  }

  secondsFor () {
    return MODEL.baseSeconds * (1 - (1 - MODEL.flowFloor) * this.flow);
  }

  /** Begin an action. Returns false if there is nothing here to do. */
  begin (x, y, prefer = null) {
    if (this.working || this.finished) return false;
    const a = this.atHand(x, y, prefer);
    if (!a) return false;
    // Handing a cup over and picking one up are quick; the machine work is
    // where the time is.
    const quick = a.step === 'serve' || a.step === 'clear';
    this.working = {
      step: a.step, order: a.order, t: 0,
      need: (quick ? MODEL.handSeconds * 1000 : this.secondsFor() * 1000)
    };
    return true;
  }

  cancel () { this.working = null; }

  update (dt, x, y) {
    if (this.finished) return null;
    this.elapsed += dt;
    // Flow over the whole shift, not at the end of it. The end is always a
    // run of the same action — the last few cups — so a final reading
    // flatters the task-switcher for the one stretch where they finally
    // stopped switching.
    this.flowArea += this.flow * dt;

    if (!this.working) {
      // Flow ebbs while you are walking or deciding, slowly.
      this.flow = Math.max(0, this.flow - MODEL.flowIdle * dt / 1000);
      return null;
    }

    // Walking away from the station abandons the action, without penalty.
    const st = this.stationFor(this.working.step, this.working.order);
    const lim = (this.working.step === 'serve' || this.working.step === 'clear'
      ? MODEL.handReach : MODEL.reach) * 1.25;
    if (st && Math.hypot(x - st.x, y - st.y) > lim) {
      this.working = null;
      return null;
    }

    this.working.t += dt;
    if (this.working.t < this.working.need) return null;

    const { step, order } = this.working;
    this.working = null;
    this.actions++;

    // Flow: deeper on repetition, most of it gone on a switch.
    if (this.lastStep === step) {
      this.flow = Math.min(1, this.flow + MODEL.flowGain);
    } else {
      if (this.lastStep !== null) this.switches++;
      this.flow = Math.max(0, this.flow * (1 - MODEL.flowDecay));
    }
    this.lastStep = step;

    if (step === 'clear') {
      this.messes = this.messes.filter(m => m !== order);
      this.room.things = this.room.things.filter(t => t !== order);
      this.cleared++;
      this.checkDone();
      return { step, cleared: order };
    }

    order.done++;

    if (step === 'serve') {
      // Handed over. They drink it, they go, and they leave a cup behind —
      // which is the last thing on your round and the reason the room is
      // properly yours again at the end rather than just emptier.
      this.tray = this.tray.filter(o => o !== order);
      order.delivered = true;
      this.orders = this.orders.filter(o => o !== order);
      this.served++;
      this.said = lineFor(order);
      if (order.customer) {
        const c = order.customer;
        this.room.things = this.room.things.filter(t => t !== c);
        const cup = thing('mess', c.x, c.y);
        cup.isCustomer = true;    // cleaned up with everything else on exit
        cup.order = order;
        this.messes.push(cup);
        this.room.things.push(cup);
      }
      this.checkDone();
      return { step, order, completed: order, said: this.said };
    }

    // A prep step. When the last one is done the drink goes onto your tray.
    if (order.needs[order.done] === 'serve') {
      order.ready = true;
      this.tray.push(order);
      return { step, order, picked: order };
    }
    return { step, order };
  }

  /** The morning is over when everyone has their coffee and the cups are in. */
  checkDone () {
    if (this.served >= this.target && this.messes.length === 0) this.finished = true;
  }

  /**
   * The debrief. No score and no stars: it reports how the morning went and
   * lets the numbers make the argument themselves.
   */
  report () {
    const perAction = this.actions ? this.elapsed / this.actions / 1000 : 0;
    const batched = this.actions - this.switches;
    return {
      served: this.served,
      cleared: this.cleared,
      actions: this.actions,
      switches: this.switches,
      batchedRun: batched,
      seconds: Math.round(this.elapsed / 1000),
      perAction: perAction.toFixed(1),
      flow: this.flow,
      meanFlow: this.elapsed ? this.flowArea / this.elapsed : 0,
      note: this.switches <= Math.max(2, this.actions * 0.25)
        ? 'You worked in runs — grind, grind, grind — and the whole morning ' +
          'moved faster for it. That is not a trick of this game. Attention ' +
          'that is allowed to stay on one thing is quicker at it.'
        : 'You switched tasks often, and every switch cost you the run you ' +
          'had built. Try doing all the grinding first next time and watch ' +
          'the same work take less of the morning.'
    };
  }
}
