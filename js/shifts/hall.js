/**
 * THE COFFEE MORNING — the community hall.
 *
 * Mara, Ollie and Jun are all here, at once, in the room you signed off.
 *
 * WHAT IT ARGUES
 *
 * Access is not a fitting. It is maintenance.
 *
 * The survey mode lets you solve a room once, on paper, with nothing moving.
 * That is a real skill and it is also a lie about how buildings work: on the
 * day, somebody opens the blinds because it is dark, somebody wheels the urn
 * out because people want tea, a group arrives together and stands in the
 * doorway talking. None of them are being thoughtless. Every one of those
 * things is somebody meeting a genuine need, and each one lands on one of
 * the three people differently.
 *
 * So this is the survey played live and under time. Events fire, three people
 * are being brought down by three unrelated things at once, and the room you
 * signed off cannot hold on its own.
 *
 * A NOTE ON WHAT THIS DOES AND DOES NOT CLAIM
 *
 * The first version of this file claimed that going to whatever is hurting
 * the person with the least left beats going to whatever is nearest. The
 * test said otherwise — across a whole sweep of tunings the two strategies
 * came out level, and nearest sometimes won, because events land near the
 * person they affect and crossing the room to be clever costs more time than
 * the cleverness is worth.
 *
 * That claim has been removed rather than tuned into existence. What the
 * model does support, and what is tested, is narrower and truer:
 *
 *   A signed-off room still fails if nobody maintains it. Left alone, this
 *   morning loses all three of them, and every single thing that did it was
 *   somebody meeting an ordinary need.
 *
 *   The three of them go down for different reasons. There is no such thing
 *   as tidying the room in general — the urn is nothing to Ollie and the end
 *   of the morning for Mara, and a host who only knows "keep it nice" is
 *   working blind.
 */

import { def, thing, KINDS, spreadOut } from '../room.js';
import { PEOPLE } from '../person.js';

export const MODEL = {
  reach: 150,
  actionSeconds: 1.6,

  // A new thing happens roughly this often.
  eventEvery: 7200,
  eventJitter: 3000,

  // How long the morning runs.
  duration: 150000,

  // What each guest loses per second, scaled by what the room is doing to
  // them in their own weighting.
  drainScale: 7.0
};

/**
 * Things that happen because people are living their lives.
 *
 * Each has a fix, and the fix is always at a place you have to walk to.
 * Nothing here is sabotage — read them as a list of ordinary, reasonable
 * acts, because that is what they are and it is the point.
 */
const EVENTS = [
  {
    id: 'blinds', label: 'Someone opened the blinds',
    why: 'It was dark by the tea table.',
    domain: 'glare', fixLabel: 'Half-close them',
    apply: s => s.spawn('window', 'glare', 0.55, 'ollie'),
    hurts: 'ollie'
  },
  {
    id: 'urn', label: 'The urn has been wheeled into the middle',
    why: 'People wanted the tea nearer the chairs.',
    domain: 'sound', fixLabel: 'Move it to the wall',
    apply: s => s.spawn('grinder', 'sound', 0.5, 'mara'),
    hurts: 'mara'
  },
  {
    id: 'group', label: 'A group has stopped in the doorway',
    why: 'They are catching up. It has been a while.',
    domain: 'crowd', fixLabel: 'Open the second door',
    apply: s => s.spawn('rope', 'crowd', 0.6, 'jun'),
    hurts: 'jun'
  },
  {
    id: 'strip', label: 'The strip light over the far end has started up',
    why: 'The switch is on a timer nobody can find.',
    domain: 'flicker', fixLabel: 'Kill the circuit',
    apply: s => s.spawn('fluorescent', 'flicker', 0.7, 'ollie'),
    hurts: 'ollie'
  },
  {
    id: 'chairs', label: 'The chairs have been pulled into a circle',
    why: 'Somebody thought it would be friendlier.',
    domain: 'exposure', fixLabel: 'Leave a way out of it',
    apply: s => s.spawn('rope', 'crowd', 0.4, 'jun'),
    hurts: 'jun'
  },
  {
    id: 'music', label: 'Someone put music on',
    why: 'The quiet felt awkward to them.',
    domain: 'sound', fixLabel: 'Turn it down',
    apply: s => s.spawn('speaker', 'sound', 0.62, 'mara'),
    hurts: 'mara'
  }
];

let uid = 0;

export class HallShift {
  static roomKind = 'hall';
  static title = 'The Coffee Morning';
  static brief =
    'All three of them, one morning, one room — the one you signed off. ' +
    'Things will keep happening, because people have needs and are meeting ' +
    'them. Nobody is being thoughtless. You have the morning and your own ' +
    'two feet, and you cannot get to everything, so notice who each one is ' +
    'landing on.';
  static keyHint = 'E to deal with what is in front of you';

  constructor (room) {
    this.room = room;
    this.reset();
  }

  reset () {
    uid = 0;
    this.elapsed = 0;
    this.live = [];             // events currently in the room
    this.handled = 0;
    this.missed = 0;
    this.working = null;
    this.finished = false;
    this.nextEventAt = 3000;
    this.said = null;
    this.log = [];

    // The three of them, in the room, with live reserves.
    this.guests = ['mara', 'ollie', 'jun'].map((k, i) => {
      const p = PEOPLE[k];
      const spot = this.guestSpot(i);
      const c = thing('customer', spot.x, spot.y);
      c.isCustomer = true;
      this.room.things.push(c);
      return { key: k, person: p, thing: c, reserve: 100, worst: 100, chat: 0, left: false };
    });
    spreadOut(this.guests.map(g => g.thing), 96,
              { w: this.room.w, h: this.room.h, pad: 70 });
  }

  guestSpot (i) {
    const seats = this.room.things.filter(t => t.placed && t.kind === 'seat');
    if (seats[i]) return { x: seats[i].x + 60, y: seats[i].y + 20 };
    return { x: this.room.w * (0.28 + i * 0.22), y: this.room.h * 0.62 };
  }

  clearCustomers () {
    this.room.things = this.room.things.filter(t => !t.isCustomer && !t.isEvent);
  }

  /** Put a real object in the room, so the field genuinely changes. */
  spawn (kind, domain, strength, who = null) {
    const spot = this.eventSpot(who);
    const t = thing(kind, spot.x, spot.y);
    t.isEvent = true;
    t.eventStrength = strength;
    this.room.things.push(t);
    return t;
  }

  /**
   * Events land near the person they affect.
   *
   * Not decoration — it is what makes the mode a decision. If everything
   * happened in the middle of the room then "deal with whatever is nearest"
   * and "deal with whatever is hurting the person with least left" would be
   * the same instruction, and the level would have nothing to teach.
   */
  eventSpot (who = null) {
    const g = this.guests.filter(x => !x.left);
    const pick = g.find(x => x.key === who) ?? g[(uid + 1) % (g.length || 1)];
    const base = pick ? pick.thing : { x: this.room.w / 2, y: this.room.h / 2 };
    const a = uid * 2.4;
    return {
      x: Math.max(60, Math.min(this.room.w - 60, base.x + Math.cos(a) * 130)),
      y: Math.max(60, Math.min(this.room.h - 60, base.y + Math.sin(a) * 115))
    };
  }

  /**
   * The load on one guest, in their own weighting, from the live events.
   *
   * Deliberately per-person: the same strip light is nothing to Mara and the
   * end of the morning for Ollie. Averaging these — which is what a room
   * "generally being fine" means — is the mistake the whole game is about.
   */
  loadOn (g) {
    let worst = 0, worstId = null;
    for (const e of this.live) {
      const t = e.thing;
      if (!t) continue;
      const d = Math.hypot(t.x - g.thing.x, t.y - g.thing.y);
      const reach = (def(t).radius?.[e.def.domain] ?? 300) * 1.2;
      if (d >= reach) continue;
      const near = 1 - d / reach;
      const w = g.person.weights[e.def.domain] ?? 0.3;
      const v = e.def.apply ? e.strength * near * w : 0;
      if (v > worst) { worst = v; worstId = e.def.id; }
    }
    // Kept so the debrief can say what actually did it to each of them,
    // which is the only way the averaging point can be made concretely.
    if (worstId) {
      g.hitBy = g.hitBy ?? {};
      g.hitBy[worstId] = (g.hitBy[worstId] ?? 0) + 1;
    }
    return worst;
  }

  atHand (x, y) {
    if (this.finished) return null;
    let best = null, bestD = MODEL.reach;
    for (const e of this.live) {
      if (!e.thing) continue;
      const d = Math.hypot(x - e.thing.x, y - e.thing.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return null;
    return { step: best.def.id, label: best.def.fixLabel, event: best };
  }

  begin (x, y) {
    if (this.working || this.finished) return false;
    const a = this.atHand(x, y);
    if (!a) return false;
    this.working = { event: a.event, t: 0, need: MODEL.actionSeconds * 1000 };
    return true;
  }

  cancel () { this.working = null; }

  update (dt, x, y) {
    if (this.finished) return null;
    this.elapsed += dt;

    // Something new happens.
    if (this.elapsed >= this.nextEventAt && this.elapsed < MODEL.duration - 12000) {
      this.nextEventAt = this.elapsed + MODEL.eventEvery +
        (Math.random() - 0.5) * MODEL.eventJitter;
      const pool = EVENTS.filter(e => !this.live.some(l => l.def.id === e.id));
      if (pool.length) {
        const d = pool[(uid++) % pool.length];
        const ev = { def: d, strength: 1, at: this.elapsed, thing: null };
        ev.thing = d.apply(this);
        ev.strength = ev.thing?.eventStrength ?? 0.5;
        this.live.push(ev);
        this.log.push(d.label);
      }
    }

    // Everyone pays, in their own currency.
    for (const g of this.guests) {
      if (g.left) continue;
      const load = this.loadOn(g);
      g.reserve = Math.max(0, g.reserve - load * MODEL.drainScale * dt / 1000);
      g.worst = Math.min(g.worst, g.reserve);
      if (g.reserve <= 0) {
        g.left = true;
        this.room.things = this.room.things.filter(t => t !== g.thing);
        this.said = `${g.person.name} has gone outside.`;
      }
    }

    if (this.elapsed >= MODEL.duration || this.guests.every(g => g.left)) {
      this.missed = this.live.length;
      this.finished = true;
      return { completed: true };
    }

    if (!this.working) return null;
    const e = this.working.event;
    if (e.thing && Math.hypot(x - e.thing.x, y - e.thing.y) > MODEL.reach * 1.25) {
      this.working = null;
      return null;
    }
    this.working.t += dt;
    if (this.working.t < this.working.need) return null;

    this.working = null;
    this.live = this.live.filter(l => l !== e);
    this.room.things = this.room.things.filter(t => t !== e.thing);
    this.handled++;
    return { step: e.def.id, event: e, handled: true };
  }

  /** Whatever is landing hardest on whoever has the least left. */
  nextTarget () {
    if (this.finished || !this.live.length) return null;
    const worst = this.guests.filter(g => !g.left)
      .sort((a, b) => a.reserve - b.reserve)[0];
    const ref = worst ? worst.thing : { x: this.room.w / 2, y: this.room.h / 2 };
    const e = this.live.slice().sort((a, b) =>
      Math.hypot(a.thing.x - ref.x, a.thing.y - ref.y) -
      Math.hypot(b.thing.x - ref.x, b.thing.y - ref.y))[0];
    if (!e?.thing) return null;
    return { x: e.thing.x, y: e.thing.y, label: e.def.fixLabel.toLowerCase(), y0: 150 };
  }

  talkTarget (x, y) {
    let best = null, bestD = MODEL.reach * 1.1;
    for (const g of this.guests) {
      if (g.left) continue;
      const d = Math.hypot(x - g.thing.x, y - g.thing.y);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  }

  talk (x, y) {
    const g = this.talkTarget(x, y);
    if (!g) return null;
    const struggling = g.reserve < 50;
    const bank = {
      mara: struggling
        ? ['“Is that urn staying there?”', '“It is fine. It is just very present.”']
        : ['“This is nice, actually.”', '“I can hear the person I am talking to.”'],
      ollie: struggling
        ? ['“Is one of those lights buzzing, or is it me?”', '“It is not me, is it.”']
        : ['“I did not think I would stay this long.”', '“No, it is good. Genuinely.”'],
      jun: struggling
        ? ['“I am going to stand by the door for a minute.”', '“Not leaving. Just — near it.”']
        : ['“I can see the way out from here. That is all I need.”']
    }[g.key];
    const line = bank[Math.min(bank.length - 1, g.chat)];
    g.chat++;
    return { text: line };
  }

  hud () {
    const worst = this.guests.filter(g => !g.left)
      .sort((a, b) => a.reserve - b.reserve)[0];
    return {
      rows: this.live.slice(0, 5).map(e => ({
        label: e.def.label,
        marks: PEOPLE[e.def.hurts]?.name ?? '',
        warn: true
      })),
      empty: 'nothing needs you right now',
      meter: {
        label: worst ? `${worst.person.name}, the tightest of the three` : 'everyone',
        value: (worst?.reserve ?? 100) / 100
      },
      note: this.live.length
        ? 'each of these is somebody meeting a real need'
        : 'a good moment — it will not last',
      count: `${Math.max(0, Math.round((MODEL.duration - this.elapsed) / 1000))}s left · ` +
        `${this.guests.filter(g => !g.left).length} of 3 still here`
    };
  }

  /** What actually brought each of them down, in their own words. */
  blame () {
    const bits = [];
    for (const g of this.guests) {
      const hits = Object.entries(g.hitBy ?? {}).sort((a, b) => b[1] - a[1])[0];
      if (!hits) continue;
      const ev = EVENTS.find(e => e.id === hits[0]);
      if (ev) bits.push(`${g.person.name}: ${ev.label.toLowerCase()}`);
    }
    return bits.length ? bits.join('; ') + '.' : '';
  }

  report () {
    const stayed = this.guests.filter(g => !g.left);
    return {
      grid: [
        ['still here at the end', `${stayed.length} of 3`, ''],
        ['things you dealt with', this.handled, ''],
        ['left running', this.missed, ''],
        ['tightest margin', `${Math.round(Math.min(...this.guests.map(g => g.worst)))}%`, '']
      ],
      headline: stayed.length === 3
        ? 'All three of them stayed for the whole morning.'
        : `${3 - stayed.length} of them went outside and did not come back.`,
      note: stayed.length === 3
        ? 'Nothing that happened this morning was anybody being thoughtless. ' +
          'Every one of them was a person meeting a real need, and the room ' +
          'you signed off could not absorb them on its own. It held because ' +
          'somebody was here keeping it holding.'
        : 'The room was signed off and it still failed somebody, because a ' +
          'room is not finished when you leave it. ' + this.blame(),
      evidence:
        'Measured, not asserted: left completely alone, this morning loses ' +
        'all three of them, and every single thing that did it was somebody ' +
        'meeting an ordinary need — the blinds, the urn, the tea queue. And ' +
        'they do not go down together or for the same reason. ' + this.blame() +
        ' There is no such thing as tidying the room in general.'
    };
  }
}
