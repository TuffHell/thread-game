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

export const STEPS = ['grind', 'pull', 'steam', 'serve'];

export const STEP_LABEL = {
  grind: 'Grind', pull: 'Pull a shot', steam: 'Steam milk', serve: 'Serve'
};

/** Which object in the room you have to stand at for each step. */
const STATION_KIND = {
  grind: 'grinder',
  pull: 'machine',
  steam: 'machine',
  serve: 'counter'
};

export const MODEL = {
  reach: 150,             // cm; how close you must be to work a station
  baseSeconds: 2.6,       // one action at zero flow
  flowFloor: 0.45,        // at full flow an action takes 45% of base

  flowGain: 0.15,         // per completed action of the same kind
  flowDecay: 0.5,         // proportion LOST when you switch to another kind
  // Walking between stations must not shred the run you have built, or the
  // accessible layout — where things are further apart — quietly becomes
  // the punished one. Flow ebbs slowly; only switching really costs.
  flowIdle: 0.012,

  // Drinks that ask for milk need the extra step.
  milkChance: 0.5
};

let uid = 0;

function makeOrder (n) {
  const milk = Math.random() < MODEL.milkChance;
  const needs = milk ? ['grind', 'pull', 'steam', 'serve'] : ['grind', 'pull', 'serve'];
  return {
    id: `ord${++uid}`,
    n,
    name: milk ? 'flat white' : 'espresso',
    needs,
    done: 0
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

  clearCustomers () {
    this.room.things = this.room.things.filter(t => !t.isCustomer);
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
  stationFor (step) {
    const kind = STATION_KIND[step];
    return this.room.things.find(t => t.placed && t.kind === kind) ?? null;
  }

  /** Every step that could be worked right now, cheapest-queued first. */
  available () {
    const out = [];
    for (const o of this.orders) {
      if (o.done >= o.needs.length) continue;
      out.push({ order: o, step: o.needs[o.done] });
    }
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
      const st = this.stationFor(a.step);
      if (!st) continue;
      if (Math.hypot(x - st.x, y - st.y) <= MODEL.reach) inReach.push({ ...a, station: st });
    }
    if (!inReach.length) return null;
    return inReach.find(a => a.step === prefer)
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
    this.working = { step: a.step, order: a.order, t: 0, need: this.secondsFor() * 1000 };
    return true;
  }

  cancel () { this.working = null; }

  update (dt, x, y) {
    if (this.finished) return null;
    this.elapsed += dt;

    if (!this.working) {
      // Flow ebbs while you are walking or deciding, slowly.
      this.flow = Math.max(0, this.flow - MODEL.flowIdle * dt / 1000);
      return null;
    }

    // Walking away from the station abandons the action, without penalty.
    const st = this.stationFor(this.working.step);
    if (st && Math.hypot(x - st.x, y - st.y) > MODEL.reach * 1.25) {
      this.working = null;
      return null;
    }

    this.working.t += dt;
    if (this.working.t < this.working.need) return null;

    const { step, order } = this.working;
    this.working = null;
    order.done++;
    this.actions++;

    // Flow: deeper on repetition, most of it gone on a switch.
    if (this.lastStep === step) {
      this.flow = Math.min(1, this.flow + MODEL.flowGain);
    } else {
      if (this.lastStep !== null) this.switches++;
      this.flow = Math.max(0, this.flow * (1 - MODEL.flowDecay));
    }
    this.lastStep = step;

    let completed = null;
    if (order.done >= order.needs.length) {
      this.orders = this.orders.filter(o => o !== order);
      // They take their coffee and go, and the room gets quieter for it.
      if (order.customer) {
        this.room.things = this.room.things.filter(t => t !== order.customer);
      }
      this.served++;
      completed = order;
      if (this.served >= this.target) this.finished = true;
    }
    return { step, order, completed };
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
      actions: this.actions,
      switches: this.switches,
      batchedRun: batched,
      seconds: Math.round(this.elapsed / 1000),
      perAction: perAction.toFixed(1),
      flow: this.flow,
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
