/**
 * Interruptions.
 *
 * Two rules shape this system.
 *
 * First, nothing arrives without warning. The game says something is coming
 * before it comes, because a world that ambushes you is a world you have to
 * spend attention guarding against, and that is the resource the whole game
 * is about. Surprise would be cheap and would also make it unplayable for a
 * good part of the audience.
 *
 * Second, an interruption is never dangerous. It cannot kill you, fail you
 * or end a level. It only ever takes your depth, which is quite enough.
 */

import { TIMING, MASK, settings } from './config.js';
import { sfx } from './audio.js';

/**
 * The calls are mundane on purpose. None of these people are being cruel and
 * most of them think they are being kind, which is exactly what makes the
 * cost invisible to everyone except the person paying it.
 */
const CALLS = [
  'Someone says your name from the next room.',
  'A hand lands on your shoulder.',
  'Quick question, it will only take a second.',
  'Are you listening?',
  'Just checking how you are getting on.',
  'Can you look at this for a moment?',
  'We are all waiting on you.',
  'Sorry, I know you are busy, but.',
  'The phone goes.',
  'You have been very quiet.',
  'Look at me when I am talking to you.',
  'You have been at that for hours.',
  'Come and join in, it will do you good.',
  'It is rude to keep doing that while I am here.',
  'Why do you always have to be so intense about it?'
];

export class Interruptions {
  constructor (onChange) {
    this.onChange = onChange;
    this.reset();
  }

  reset () {
    this.masked = false;
    this.enabled = false;
    this.state = 'idle';   // idle | warning | pending
    this.timer = 0;
    this.next = 9000;
    this.text = '';
    this.canRefuse = true;
    this.refuseCooldown = 0;
    this.log = { answered: 0, refused: 0, forced: 0, depthLost: 0 };
  }

  start () {
    this.enabled = true;
    this.state = 'idle';
    this.timer = 0;
    this.next = 7000 + Math.random() * 5000;
  }

  stop () {
    this.enabled = false;
    this.state = 'idle';
    this.onChange?.();
  }

  /** Fraction of the grace period remaining, for the UI ring. */
  get pressure () {
    if (this.state !== 'pending') return 0;
    return Math.min(1, this.timer / TIMING.interruptGrace);
  }

  update (dt, ctx) {
    if (this.refuseCooldown > 0) {
      this.refuseCooldown = Math.max(0, this.refuseCooldown - dt);
      if (this.refuseCooldown === 0) this.canRefuse = true;
    }
    if (!this.enabled) return null;

    this.timer += dt;

    if (this.state === 'idle') {
      // Interruptions are drawn toward you when you are deep, because that
      // is how it actually goes. Masking pushes them away, which is the
      // reason anybody masks.
      const pull = (1 + ctx.depth * 0.55) * (this.masked ? MASK.interruptMultiplier : 1);
      if (this.timer * pull >= this.next) {
        this.text = CALLS[Math.floor(Math.random() * CALLS.length)];
        this.timer = 0;
        this.state = settings.announce ? 'warning' : 'pending';
        if (!settings.announce) sfx.knock();
        this.onChange?.();
      }
      return null;
    }

    if (this.state === 'warning') {
      if (this.timer >= TIMING.interruptWarning) {
        this.timer = 0;
        this.state = 'pending';
        sfx.knock();
        this.onChange?.();
      }
      return null;
    }

    if (this.state === 'pending' && this.timer >= TIMING.interruptGrace) {
      return this.resolve('forced');
    }
    return null;
  }

  /** answer | refuse | forced */
  resolve (how) {
    if (this.state === 'idle') return null;
    this.log[how === 'answer' ? 'answered' : how === 'refuse' ? 'refused' : 'forced']++;

    if (how === 'refuse') {
      sfx.refuse();
      this.canRefuse = false;
      this.refuseCooldown = TIMING.refusalCooldown;
    }

    this.state = 'idle';
    this.timer = 0;
    this.next = (how === 'refuse' ? 4200 : 8000) + Math.random() * 5200;
    this.onChange?.();
    return how;
  }

  noteDepthLost (levels) {
    this.log.depthLost += levels;
  }
}
