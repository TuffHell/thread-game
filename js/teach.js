/**
 * The first few minutes.
 *
 * Every prompt is triggered by what the player is currently doing or failing
 * to do, never by a timer, and each one clears itself the moment the thing it
 * asked for happens. Nothing is modal, nothing blocks input, and the whole
 * system switches off for good once the first weave is finished.
 *
 * The rule it follows: never explain something the player has not yet run
 * into. A wall of instructions up front is the same as no instructions.
 */

export const STEPS = [
  {
    id: 'look',
    // Opening line. Says where you are and what the goal is, nothing else.
    when: g => g.depth === 0 && g.stats.descents === 0 && g.time > 1200,
    done: g => g.holdTarget || g.stats.descents > 0,
    text: 'Light enters at the source and has to reach the bloom. This strand ' +
          'will not carry it. Its colour is wrong.'
  },
  {
    id: 'hold',
    when: g => g.depth === 0 && g.stats.descents === 0 && g.time > 5200,
    done: g => g.holdTarget || g.stats.descents > 0,
    escalates: true,
    text: 'Press and hold it. Not a click. Hold.'
  },
  {
    id: 'inside',
    when: g => g.depth === 1 && g.stats.tunes === 0,
    done: g => g.stats.tunes > 0,
    text: 'It was never one strand. The colour it showed you out there is the ' +
          'average of these. Change these and you change that.'
  },
  {
    id: 'gate',
    when: (g, t) => g.depth === 1 && g.stats.tunes === 0 && t.since('inside', g) > 3200,
    done: g => g.stats.tunes > 0,
    escalates: true,
    text: 'The two marks along the bottom are where this bundle has to end up. ' +
          'Click a strand to move it. Hold shift to move it the other way.'
  },
  {
    id: 'attention',
    when: g => g.attention < 1 && g.depth > 0,
    done: g => g.attention >= 1,
    text: 'Out of attention. It comes back while you stay down here, faster the ' +
          'deeper you are. Nothing is lost by waiting.'
  },
  {
    id: 'carried',
    when: g => g.solved,
    done: () => false,
    text: 'It carries.'
  }
];

export class Teacher {
  constructor (ui) {
    this.ui = ui;
    this.enabled = true;
    this.current = null;
    this.fired = new Set();
  }

  reset (levelIndex) {
    // Only the first weave is taught. After that the player knows.
    this.enabled = levelIndex === 0;
    this.current = null;
    this.fired.clear();
    this.firedAt = new Map();
    this.ui.teach(null);
  }

  /**
   * How long since a given prompt appeared. Escalations are timed from the
   * advice they are escalating, not from the start of the level, or a player
   * who takes their time earlier gets both versions at once.
   */
  since (id, game) {
    const t = this.firedAt.get(id);
    return t == null ? -Infinity : game.time - t;
  }

  stop () {
    this.enabled = false;
    this.current = null;
    this.ui.teach(null);
  }

  update (game) {
    if (!this.enabled) return;

    if (this.current && this.current.done(game)) {
      this.current = null;
      this.ui.teach(null);
    }

    for (const step of STEPS) {
      if (this.fired.has(step.id)) continue;
      if (!step.when(game, this)) continue;
      // A prompt normally waits for the player rather than talking over
      // itself. The exception is a step marked as an escalation, which is a
      // blunter version of the advice already on screen and is exactly what
      // someone who is stuck needs to see.
      if (this.current && !step.escalates) continue;
      this.fired.add(step.id);
      this.firedAt.set(step.id, game.time);
      this.current = step;
      this.ui.teach(step.text);
      return;
    }
  }
}
