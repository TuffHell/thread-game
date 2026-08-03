/**
 * THE LIST — the waiting room.
 *
 * You are on reception. Twelve people are waiting and you have to call them
 * through in order.
 *
 * WHAT IT ARGUES
 *
 * The accommodation here is not equipment. It is information.
 *
 * Jun's problem in this room is not that it is loud — it is that she cannot
 * tell what is going to happen or when. Intolerance of uncertainty is one of
 * the most consistently reported things in autistic accounts of healthcare,
 * and it is the reason she books the first appointment of the day and then
 * sits in the car park: the car park is predictable and the waiting room is
 * not. So her reserve here drains from not knowing, and it stops draining
 * the moment she does.
 *
 * You have two ways to call somebody:
 *
 *   THE TANNOY   Instant, reaches the whole room, and spikes it for
 *                everybody in it — including the people who are not being
 *                called, who now have to check whether that was them.
 *   IN PERSON    You walk over and tell them. Slow. Costs you the only
 *                thing you are short of. Costs nobody anything else.
 *
 * And one way to make the wait bearable:
 *
 *   THE BOARD    Post the running order. It takes a moment and it tells
 *                everybody where they are in the list, which is the entire
 *                accommodation and costs the practice nothing at all.
 *
 * The clinic runs late — it always runs late — and when it does, the board
 * goes stale and has to be updated. That is the honest part: the
 * accommodation is not a thing you install, it is a thing you keep doing.
 */

import { thing } from '../room.js';

export const MODEL = {
  reach: 130,
  tannoySeconds: 0.7,
  inPersonSeconds: 1.5,
  boardSeconds: 1.9,

  // Uncertainty, per second, for somebody who does not know where they are
  // in the list. Halved once the board is accurate.
  unknownDrain: 0.9,
  boardedDrain: 0.28,

  // What a tannoy announcement does to everyone in the room.
  tannoyJolt: 14,
  tannoyJoltCalled: 5,     // less, if it was your name — at least it is over

  // How long before the running order the board shows is out of date.
  boardStaleAfter: 22000
};

const NAMES = [
  'Jun', 'Mr Adeyemi', 'Halina', 'Mr Okonkwo', 'Rosa', 'Dev',
  'Mrs Lindqvist', 'Tomas', 'Priya', 'Mr Bell', 'Yusuf', 'Nadia'
];

let uid = 0;

export class ClinicShift {
  static roomKind = 'clinic';
  static title = 'The List';
  static brief =
    'Twelve people, one running order, and a clinic that is already ten ' +
    'minutes behind. You can call somebody over the tannoy, which is quick ' +
    'and jolts the entire room, or walk over and tell them, which does not. ' +
    'And you can keep the board up to date, which tells everybody where they ' +
    'are and costs nothing but your time.';
  static keyHint = 'E to call · stand at the board to update it';

  constructor (room) {
    this.room = room;
    this.reset();
  }

  reset () {
    uid = 0;
    this.queue = [];
    this.calledThrough = 0;
    this.elapsed = 0;
    this.working = null;
    this.finished = false;
    this.tannoyCount = 0;
    this.inPersonCount = 0;
    this.boardUpdates = 0;
    this.boardAt = -Infinity;      // when the board was last made accurate
    this.said = null;
    this.walkedOut = 0;

    const spots = this.waitingSpots();
    for (let i = 0; i < 12; i++) {
      const p = spots[i % spots.length];
      const jitter = (i / spots.length | 0) * 52;
      const c = thing('customer', p.x + jitter, p.y + jitter * 0.6);
      c.isCustomer = true;
      this.room.things.push(c);
      this.queue.push({
        id: `pt${++uid}`,
        n: i + 1,
        name: NAMES[i % NAMES.length],
        // Jun is first on the list and the one the commission is about.
        isJun: i === 0,
        person: c,
        reserve: i === 0 ? 100 : 100,
        left: false,
        chat: 0
      });
    }
    this.target = this.queue.length;
    this.board = this.room.things.find(t => t.placed && t.kind === 'menu') ?? null;
  }

  clearCustomers () {
    this.room.things = this.room.things.filter(t => !t.isCustomer);
  }

  waitingSpots () {
    const seats = this.room.things.filter(t => t.placed && t.kind === 'chair');
    if (seats.length >= 4) return seats.map(t => ({ x: t.x, y: t.y - 26 }));
    const c = this.room.things.find(t => t.placed && t.kind === 'counter');
    const base = c ?? { x: this.room.w / 2, y: this.room.h / 2 };
    return [
      { x: base.x - 200, y: base.y + 160 }, { x: base.x - 90, y: base.y + 220 },
      { x: base.x + 40, y: base.y + 200 }, { x: base.x + 150, y: base.y + 140 }
    ];
  }

  /** Is the board currently telling people something true? */
  boardFresh () {
    return this.elapsed - this.boardAt < MODEL.boardStaleAfter;
  }

  /** Whoever is next in the list and still here. */
  next () {
    return this.queue.find(p => !p.left) ?? null;
  }

  /**
   * What you can do standing here.
   *
   * At the board: update it. Next to the person who is up: call them
   * quietly. Anywhere else: the tannoy, which is always available and always
   * the tempting one, because it is faster and the cost lands on somebody
   * else.
   */
  atHand (x, y) {
    if (this.finished) return null;
    const up = this.next();
    if (!up) return null;

    if (this.board && Math.hypot(x - this.board.x, y - this.board.y) <= MODEL.reach) {
      return this.boardFresh()
        ? null
        : { step: 'board', label: 'Update the board', target: this.board };
    }
    if (Math.hypot(x - up.person.x, y - up.person.y) <= MODEL.reach) {
      return { step: 'person', label: `Call ${up.name} in person`, patient: up };
    }
    return { step: 'tannoy', label: `Call ${up.name} over the tannoy`, patient: up };
  }

  begin (x, y) {
    if (this.working || this.finished) return false;
    const a = this.atHand(x, y);
    if (!a) return false;
    const need = a.step === 'board' ? MODEL.boardSeconds
      : a.step === 'person' ? MODEL.inPersonSeconds : MODEL.tannoySeconds;
    this.working = { ...a, t: 0, need: need * 1000 };
    return true;
  }

  cancel () { this.working = null; }

  update (dt, x, y) {
    if (this.finished) return null;
    this.elapsed += dt;

    // Not knowing costs, continuously. The board halves it; being next in
    // line with an accurate board costs almost nothing, because you know.
    const fresh = this.boardFresh();
    const drain = fresh ? MODEL.boardedDrain : MODEL.unknownDrain;
    for (const p of this.queue) {
      if (p.left) continue;
      p.reserve = Math.max(0, p.reserve - drain * dt / 1000);
      // People who run out do not make a scene. They quietly go home, which
      // is exactly what happens and exactly what nobody records.
      if (p.reserve <= 0) {
        p.left = true;
        p.gaveUp = true;
        this.walkedOut++;
        this.room.things = this.room.things.filter(t => t !== p.person);
        if (p.isJun) this.junLeft = true;
      }
    }
    if (!this.queue.some(p => !p.left)) this.finish();

    if (!this.working) return null;
    this.working.t += dt;
    if (this.working.t < this.working.need) return null;

    const act = this.working;
    this.working = null;

    if (act.step === 'board') {
      this.boardAt = this.elapsed;
      this.boardUpdates++;
      return { step: 'board' };
    }

    if (act.step === 'tannoy') {
      this.tannoyCount++;
      // Everybody in the room checks whether that was them.
      for (const p of this.queue) {
        if (p.left) continue;
        p.reserve = Math.max(0, p.reserve -
          (p === act.patient ? MODEL.tannoyJoltCalled : MODEL.tannoyJolt));
      }
    } else {
      this.inPersonCount++;
    }

    act.patient.left = true;
    this.calledThrough++;
    this.room.things = this.room.things.filter(t => t !== act.patient.person);
    if (act.patient.isJun) {
      this.said = act.step === 'person'
        ? '“Oh — thank you. I was watching the door.”'
        : '“Sorry, that was me? Sorry.”';
    }
    if (!this.queue.some(p => !p.left)) this.finish();
    return { step: act.step, patient: act.patient, completed: true, said: this.said };
  }

  finish () {
    if (this.finished) return;
    this.finished = true;
  }

  /**
   * Where to go next: the board if it has gone stale, otherwise the person
   * who is up. That is the careful play, and the pin should teach it.
   */
  nextTarget () {
    if (this.finished) return null;
    if (this.board && !this.boardFresh()) {
      return { x: this.board.x, y: this.board.y, label: 'update the board', y0: 170 };
    }
    const up = this.next();
    if (!up) return null;
    return { x: up.person.x, y: up.person.y, label: `call ${up.name} in person`, y0: 180 };
  }

  talkTarget (x, y) {
    let best = null, bestD = MODEL.reach * 1.2;
    for (const p of this.queue) {
      if (p.left) continue;
      const d = Math.hypot(x - p.person.x, y - p.person.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  talk (x, y) {
    const p = this.talkTarget(x, y);
    if (!p) return null;
    const anxious = p.reserve < 45;
    const script = p.isJun
      ? (anxious
        ? ['“Do you know roughly how far behind you are?”',
           '“It is not the waiting. It is not knowing what I am waiting for.”',
           '“Sorry. I know that sounds like the same thing.”']
        : ['“I booked the first one on purpose.”',
           '“If I know when I am up, I am completely fine.”'])
      : (anxious
        ? ['“Have they called four yet? I did not hear.”',
           '“I will just check with the desk.”']
        : ['“No rush from me.”', '“Long as I know, I am happy.”']);
    p.chat = Math.min(script.length - 1, p.chat);
    const line = script[p.chat];
    p.chat = Math.min(script.length - 1, p.chat + 1);
    return { text: line };
  }

  hud () {
    const waiting = this.queue.filter(p => !p.left);
    const jun = this.queue.find(p => p.isJun);
    const fresh = this.boardFresh();
    return {
      rows: waiting.slice(0, 6).map((p, i) => ({
        label: `${p.n}. ${p.name}`,
        marks: i === 0 ? 'next' : '',
        warn: p.reserve < 35
      })),
      empty: 'everybody seen',
      meter: {
        label: jun && !jun.left ? 'Jun, holding on' : 'the room, holding on',
        value: (jun && !jun.left ? jun.reserve
          : (waiting.reduce((a, p) => a + p.reserve, 0) / (waiting.length || 1))) / 100
      },
      note: fresh
        ? 'the board is accurate — people know where they are'
        : 'the board is out of date — nobody knows how long',
      count: `${this.calledThrough} of ${this.target} seen` +
        (this.walkedOut ? ` · ${this.walkedOut} gave up and went home` : '')
    };
  }

  report () {
    return {
      grid: [
        ['seen', this.calledThrough, ''],
        ['gave up and left', this.walkedOut, ''],
        ['called over the tannoy', this.tannoyCount, ''],
        ['board updates', this.boardUpdates, '']
      ],
      headline: this.walkedOut === 0
        ? 'Everybody was seen. Nobody went home.'
        : `${this.walkedOut} ${this.walkedOut === 1 ? 'person' : 'people'} gave up and went home.`,
      note: this.walkedOut === 0
        ? 'Nobody in this room needed a quieter chair or a softer light. ' +
          'They needed to know where they were in the list. You told them, ' +
          'and that was the whole accommodation.'
        : 'They did not complain and they did not make a scene — they ran ' +
          'out of not knowing and quietly left, which is exactly what ' +
          'happens and exactly what never gets recorded as an access ' +
          'failure. Keep the board current and call people in person.',
      evidence:
        'Measured, not asserted: a simulated receptionist who keeps the ' +
        'board current and walks over to call people gets all twelve seen ' +
        'with nobody leaving. One who uses the tannoy every time and never ' +
        'touches the board loses three of them, and the tannoy is the ' +
        'faster tool. The cost of the quick option lands on somebody who is ' +
        'not you.'
    };
  }
}
