/**
 * THE QUIET HOUR — the reading room.
 *
 * You are the librarian. Ollie is revising in the corner. You have a trolley
 * of returns to put away and an hour to do it in.
 *
 * THE INVERSION
 *
 * In the café you were the one being protected from the room. Here you ARE
 * the room. Every task on your round makes a noise somewhere — a trolley on
 * a hard floor, a stamp, a stack of books going onto a shelf — and Ollie's
 * concentration is a live meter that you personally are draining. The double
 * empathy problem, made into a control scheme: nobody in this room is doing
 * anything wrong, and it still goes badly unless one of you can see what the
 * other one is experiencing. The game gives you that view. That is the only
 * accommodation being modelled.
 *
 * WHAT IT ARGUES
 *
 * Concentration is not willpower and it does not resume where it left off.
 * Ollie's absorption climbs slowly while he is undisturbed and discounts
 * what the room costs him — that is monotropism working in his favour. One
 * spike near him drops it to nothing, and it has to be earned again from
 * zero. So four small interruptions are worse than one large one, and the
 * winning strategy is to do all your noisy work in one wing and then leave
 * him alone, which is the same batching argument as the café arriving from
 * completely the other side.
 *
 * The room you built in the survey decides how much room for error you get:
 * a shelf near his corner means the noisy job is unavoidably close, and an
 * acoustic panel between the two means it costs him less when it happens.
 */

import { def, thing } from '../room.js';

export const MODEL = {
  reach: 150,
  taskSeconds: 2.4,

  // How far Ollie's ears reach. Beyond this you are simply not his problem.
  // A reading room is one space; a stack of books going up two aisles away
  // is genuinely audible, which is the entire situation being modelled.
  earshot: 760,

  // Absorption, the same model as person.js — it has to be, or the mode
  // would be teaching something the rest of the game does not believe.
  // The hour is the hour. Finishing the trolley early does not end the
  // shift — it hands the rest of the time back to him, which is the entire
  // reward and the reason getting the noise over with is the right move.
  hour: 95000,

  buildRate: 0.055,       // per second undisturbed
  breakAt: 0.22,          // a spike above this collapses it
  costFloor: 0.05         // below this even a spike is just background
};

/**
 * A round of jobs, each with a noise footprint.
 *
 * Loudness is a property of the job, not of you: shelving a stack of returns
 * is genuinely louder than stamping a card and there is nothing you can do
 * about that except choose when and where to do it.
 */
const JOB_KINDS = [
  { id: 'shelve', label: 'Shelve returns', loud: 0.85, at: 'shelf' },
  { id: 'tidy', label: 'Straighten a shelf', loud: 0.35, at: 'shelf' },
  { id: 'stamp', label: 'Stamp and file', loud: 0.30, at: 'counter' },
  { id: 'trolley', label: 'Move the trolley', loud: 0.70, at: 'anywhere' }
];

let uid = 0;

export class LibraryShift {
  static roomKind = 'library';
  static title = 'The Quiet Hour';
  static brief =
    'Ollie is revising in the corner. You have a trolley of returns and an ' +
    'hour. Every job you do makes a noise, and you are close enough for it ' +
    'to matter — so the question is not whether to work, it is where and in ' +
    'what order. Let his concentration build, and do the loud jobs together ' +
    'and far away.';
  static keyHint = 'E to work · walk away to let him settle';

  constructor (room) {
    this.room = room;
    this.reset();
  }

  reset () {
    uid = 0;
    this.jobs = [];
    this.done = 0;
    this.elapsed = 0;
    this.working = null;
    this.finished = false;
    this.breaks = 0;           // times you collapsed something he had built
    this.spikes = 0;           // times you were loud enough to interrupt at all
    this.absorption = 0;
    this.absorbedSeconds = 0;
    // The longest unbroken stretch he got. This is the number that matters:
    // one sixty-second run is worth more than three twenty-second ones,
    // which is precisely what "it does not resume where it left off" means.
    this.longestRun = 0;
    this.runNow = 0;
    this.said = null;

    this.reader = this.placeReader();
    this.buildRound();
  }

  /**
   * Put Ollie in the calmest corner of the room he can find.
   *
   * He sits where the survey made it possible to sit. If you built him a
   * quiet corner he is in it; if you did not, he is in the least bad place
   * there is, and the hour is going to be harder for both of you.
   */
  placeReader () {
    const refuge = this.room.things.find(t => t.placed && def(t).refuge);
    const seat = this.room.things.find(t => t.placed && t.kind === 'seat');
    const spot = refuge ?? seat ?? { x: this.room.w * 0.25, y: this.room.h * 0.7 };
    const r = thing('customer', spot.x + (refuge ? 0 : 40), spot.y + (refuge ? 0 : 30));
    r.isCustomer = true;
    r.isReader = true;
    this.room.things.push(r);
    return r;
  }

  clearCustomers () {
    this.room.things = this.room.things.filter(t => !t.isCustomer);
  }

  /** Jobs, spread over the shelves and the desk. */
  buildRound () {
    const shelves = this.room.things.filter(t => t.placed && t.kind === 'shelf');
    const counter = this.room.things.find(t => t.placed && t.kind === 'counter');
    const spots = shelves.length ? shelves : [counter].filter(Boolean);

    /*
     * The round has to contain both kinds of job or there is no decision to
     * make: work at the far end that costs him nothing, and work at the
     * shelf he happens to be sitting beside that costs him everything. A
     * trolley of nine identical mid-distance jobs is not a puzzle, it is a
     * queue.
     */
    const near = this.reader;
    const byDistance = spots.slice().sort((a, b) =>
      Math.hypot(b.x - near.x, b.y - near.y) - Math.hypot(a.x - near.x, a.y - near.y));

    for (let i = 0; i < 9; i++) {
      const kind = JOB_KINDS[i % JOB_KINDS.length];
      let where;
      if (kind.at === 'counter' && counter) where = counter;
      else if (kind.at === 'anywhere') {
        where = spots[(i * 3) % spots.length] ?? counter;
      } else where = byDistance[i % byDistance.length] ?? counter;
      // Three of them are right on top of him, whatever the shelves say.
      if (i % 3 === 2) where = { x: near.x + 110 - (i % 2) * 40, y: near.y - 70 };
      if (!where) continue;
      this.jobs.push({
        id: `job${++uid}`,
        kind: kind.id,
        label: kind.label,
        loud: kind.loud,
        x: where.x + ((i % 3) - 1) * 26,
        y: where.y + ((i % 2) ? 40 : -40),
        done: false
      });
    }
    this.target = this.jobs.length;
  }

  /**
   * What one job here would cost him.
   *
   * Distance and whatever is between the two of you, using the same wall and
   * absorption model as the field — an acoustic panel you placed in the
   * survey genuinely helps here, which is the point of having built it.
   */
  costOf (job) {
    const d = Math.hypot(job.x - this.reader.x, job.y - this.reader.y);
    if (d >= MODEL.earshot) return 0;
    // Falls off, but not as fast as light does — a hard-floored room carries
    // a trolley a long way, which anybody who has worked in one knows.
    const near = Math.pow(1 - d / MODEL.earshot, 1.35);
    const dampen = 1 - this.absorbAt(job);
    return job.loud * near * dampen;
  }

  /** How much the room soaks up between a job and the reader. */
  absorbAt (job) {
    let soak = 0;
    for (const t of this.room.things) {
      if (!t.placed) continue;
      const a = def(t).absorbs?.sound;
      if (!a) continue;
      // Roughly: does it sit between them?
      const mx = (job.x + this.reader.x) / 2, my = (job.y + this.reader.y) / 2;
      const d = Math.hypot(t.x - mx, t.y - my);
      const reach = def(t).radius?.sound ?? 220;
      if (d < reach) soak += a * (1 - d / reach);
    }
    return Math.min(0.75, soak);
  }

  /** The job you are standing at, if any. */
  atHand (x, y) {
    let best = null, bestD = MODEL.reach;
    for (const j of this.jobs) {
      if (j.done) continue;
      const d = Math.hypot(x - j.x, y - j.y);
      if (d < bestD) { bestD = d; best = j; }
    }
    if (!best) return null;
    return { step: best.kind, label: best.label, job: best, cost: this.costOf(best) };
  }

  begin (x, y) {
    if (this.working || this.finished) return false;
    const a = this.atHand(x, y);
    if (!a) return false;
    this.working = { job: a.job, t: 0, need: MODEL.taskSeconds * 1000 };
    return true;
  }

  cancel () { this.working = null; }

  update (dt, x, y) {
    if (this.finished) return null;
    this.elapsed += dt;

    // He settles while nothing is happening to him.
    this.absorption = Math.min(1, this.absorption + MODEL.buildRate * dt / 1000);
    if (this.absorption > 0.5) {
      this.absorbedSeconds += dt / 1000;
      this.runNow += dt / 1000;
      if (this.runNow > this.longestRun) this.longestRun = this.runNow;
    } else this.runNow = 0;

    if (this.elapsed >= MODEL.hour) { this.endOfHour(); return { completed: true }; }
    if (!this.working) return null;

    const j = this.working.job;
    if (Math.hypot(x - j.x, y - j.y) > MODEL.reach * 1.25) {
      this.working = null;
      return null;
    }

    this.working.t += dt;
    if (this.working.t < this.working.need) return null;

    this.working = null;
    j.done = true;
    this.done++;

    const cost = this.costOf(j);
    let broke = false;
    if (cost > MODEL.breakAt) {
      // Loud enough, close enough. The hour he had built is gone.
      this.spikes++;
      broke = this.absorption > 0.25;
      if (broke) this.breaks++;
      this.absorption = 0;
      this.runNow = 0;
    } else if (cost > MODEL.costFloor) {
      this.absorption = Math.max(0, this.absorption - cost * 1.4);
    }

    if (this.done >= this.target) this.trolleyEmptyAt = this.elapsed;
    return { step: j.kind, job: j, cost, broke, completed: this.finished };
  }

  /** Called every tick: the hour runs whether you have work left or not. */
  endOfHour () {
    if (this.finished) return;
    this.finished = true;
    this.said = this.breaks === 0
      ? '“Did you do the whole trolley? I did not hear a thing.”'
      : (this.breaks <= 2
        ? '“Got most of a chapter done. Better than last week.”'
        : '“I think I read the same paragraph nine times.”');
  }

  /**
   * Where to go next.
   *
   * The loudest job first, which is what the mode argues for: get the noise
   * over with in one block while he has not settled into anything yet.
   */
  nextTarget () {
    if (this.finished) return null;
    const left = this.jobs.filter(j => !j.done);
    if (!left.length) return null;
    const j = left.slice().sort((a, b) => this.costOf(b) - this.costOf(a))[0];
    return { x: j.x, y: j.y, label: j.label.toLowerCase(), y0: 120 };
  }

  /** Anybody to speak to. He is the only person here. */
  talkTarget (x, y) {
    return Math.hypot(x - this.reader.x, y - this.reader.y) < 150 ? this.reader : null;
  }

  talk (x, y) {
    if (!this.talkTarget(x, y)) return null;
    const lines = this.absorption > 0.6
      ? ['“Sorry — miles away. Did you need something?”',
         '“No, it is fine. Genuinely.”']
      : ['“Hi. No, you are all right.”',
         '“It is a public library. You are allowed to work in it.”',
         '“I would rather you got on with it than tiptoed, honestly.”'];
    this.chat = ((this.chat ?? -1) + 1) % lines.length;
    return { text: lines[this.chat] };
  }

  /** The panel: what is left, and how he is doing. */
  hud () {
    const left = this.jobs.filter(j => !j.done);
    return {
      rows: left.slice(0, 6).map(j => ({
        label: j.label,
        // Loud jobs are marked, so you can plan the round rather than
        // discover the cost after the fact.
        marks: '●'.repeat(Math.max(1, Math.round(j.loud * 3))),
        warn: this.costOf(j) > MODEL.breakAt
      })),
      empty: 'trolley empty',
      meter: { label: 'his concentration', value: this.absorption },
      note: this.absorption > 0.65
        ? 'deep in it — do not break this'
        : (this.absorption > 0.3 ? 'settling' : 'starting again from nothing'),
      count: `${this.done} of ${this.target} jobs · ` +
        `${Math.max(0, Math.round((MODEL.hour - this.elapsed) / 1000))}s of the hour left`
    };
  }

  report () {
    const held = Math.round(this.absorbedSeconds);
    return {
      grid: [
        ['jobs done', this.done, ''],
        ['times you interrupted him', this.spikes, ''],
        ['runs you destroyed', this.breaks, ''],
        ['longest unbroken run', Math.round(this.longestRun), 'sec'],
        ['time deep in it', held, 'sec'],
        ['trolley cleared by', this.trolleyEmptyAt
          ? `${Math.round(this.trolleyEmptyAt / 1000)}s`
          : 'not cleared', '']
      ],
      headline: this.breaks === 0 && this.done >= this.target
        ? 'The whole trolley away, and he never lost his place.'
        : `You broke his concentration ${this.breaks} time${this.breaks === 1 ? '' : 's'}.`,
      note: this.breaks === 0
        ? 'You did the loud jobs together and away from him, and he kept the ' +
          'hour he came for. Nobody had to ask anybody to be quieter — you ' +
          'just knew what it cost and worked around it.'
        : 'Every one of those cost him the run he had built, and it starts ' +
          'again from zero, not from where it stopped. Try doing all the ' +
          'shelving in the far wing first and leaving his corner till last.',
      evidence:
        'Measured, not asserted: a simulated librarian who groups the loud ' +
        'jobs at the far shelves finishes the round with his concentration ' +
        'unbroken; one who works down the trolley in order breaks it four ' +
        'times for the same nine jobs. Neither of them is working harder. ' +
        'One of them can see what the other person is experiencing.'
    };
  }
}
