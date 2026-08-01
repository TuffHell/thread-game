/**
 * The game.
 *
 * Attention is the only resource. It accrues while you are deep and
 * undisturbed, faster inside the strand you are drawn to, and barely at all
 * up on the surface. Tuning spends it. Nothing else does.
 *
 * There is no failure state anywhere in this file. Running out of attention
 * costs you time and nothing more, because a game about the cost of losing
 * focus should not also punish you for losing focus.
 */

import {
  TIMING, RULES, MASK, STIM, INERTIA, settings, palette, freqDistance
} from './config.js';
import { fragmentsFor } from './fragments.js';
import {
  solve, litStrands, effectiveFreq, isLeaf, canTune, tune,
  requirementFor, strandPath, distToPath, findNode
} from './weave.js';
import { LEVELS } from './levels.js';
import { fitTo, Transition, makeTransform } from './camera.js';
import {
  background, drawWeave, drawLens, drawComposite, drawDescentRing,
  drawMask, drawStim
} from './render.js';
import { Interruptions } from './interrupt.js';
import { Teacher } from './teach.js';
import { sfx } from './audio.js';

const ATTENTION_MAX = 5;

export class Game {
  constructor (canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.time = 0;
    this.levelIndex = 0;
    this.running = false;
    this.lastPaths = new Map();
    this.transition = new Transition();
    this.interrupts = new Interruptions(() => this.ui.syncInterrupt(this));
    this.teacher = new Teacher(ui);
    this.pointer = { x: 0, y: 0, down: false, inside: false };
    this.keyboardMode = false;
    this.selected = 0;
  }

  /* -------------------------------------------------------------- */

  loadLevel (i) {
    const def = LEVELS[i];
    if (!def) return;
    this.levelIndex = i;
    this.def = def;
    const built = def.build();

    this.root = built.weave;
    this.path = [];
    this.remembered = new Set();
    this.attention = 5;
    this.warnedDirection = false;
    this.holdTarget = null;
    this.hold = 0;
    this.sharpness = 0;
    this.solved = false;
    this.solvedAt = 0;
    this.celebrated = false;
    this.affinityDwell = 0;
    this.selected = 0;

    this.masked = false;
    this.stimming = false;
    this.ascentHold = 0;
    this.fragments = [...fragmentsFor(def.id)];
    this.seenFragments = 0;

    this.stats = {
      started: performance.now(),
      descents: 0, ascents: 0, tunes: 0,
      forcedUp: 0, deepest: 0, affinityTime: 0,
      maskedTime: 0, maskedCost: 0, stimTime: 0
    };

    this.interrupts.reset();
    if (built.interrupted && settings.interruptions !== 'off') {
      this.interrupts.start();
    }
    this.time = 0;
    this.teacher.reset(i);

    this.cam = fitTo(this.root, this.canvas.clientWidth, this.canvas.clientHeight);
    this.ui.onLevel(this);
    this.running = true;
  }

  refit () {
    if (!this.root) return;
    this.cam = fitTo(this.current, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  get depth () { return this.path.length; }

  get current () {
    return this.path.length ? this.path[this.path.length - 1].inner : this.root;
  }

  get parentWeave () {
    if (this.path.length === 0) return null;
    return this.path.length === 1 ? this.root : this.path[this.path.length - 2].inner;
  }

  get insideAffinity () {
    return this.path.some(s => s.affinity);
  }

  /* -------------------------------------------------------------- */
  /* Movement through depth                                          */
  /* -------------------------------------------------------------- */

  /* -------------------------------------------------------------- */
  /* Masking and stimming                                            */
  /* -------------------------------------------------------------- */

  toggleMask () {
    this.masked = !this.masked;
    this.interrupts.masked = this.masked;
    this.ui.say(
      this.masked
        ? 'Masked. They will mostly leave you alone now.'
        : 'Unmasked.',
      'note'
    );
    this.ui.syncMeters(this);
  }

  setStim (on) {
    if (this.stimming === on) return;
    this.stimming = on;
    if (on) this.ui.say('Settling.', 'quiet');
  }

  /** A fragment surfaces when you go somewhere new, never on a schedule. */
  offerFragment () {
    if (!this.fragments.length) return;
    const f = this.fragments.shift();
    this.seenFragments++;
    setTimeout(() => this.ui.fragment(f.text), 900);
  }

  /* -------------------------------------------------------------- */
  /* Movement through depth                                          */
  /* -------------------------------------------------------------- */

  descend (s) {
    if (!s || isLeaf(s) || this.transition.active) return;
    const w = this.current;
    const pts = strandPath(w, s, this.time);
    const mid = pts[Math.floor(pts.length / 2)] ?? { x: 0, y: 0 };

    this.transition.begin('down', TIMING.descentTravel, {
      from: this.current, to: s.inner, focus: mid
    });
    this.pendingDescend = s;
    this.stats.descents++;
    const firstTime = !this.remembered.has(s.id);
    this.remembered.add(s.id);
    sfx.descend(this.depth + 1);
    this.ui.say(`Descended into a bundle of ${s.inner.strands.length}.`);
    if (firstTime) this.offerFragment();
  }

  /**
   * Choosing to leave takes a moment, because shifting attention is hard in
   * both directions. Being pulled out by someone else takes none, which is
   * the entire point and only reads if you have felt the difference.
   */
  requestAscend (dt) {
    if (!this.path.length || this.transition.active) return;
    this.ascentHold += dt;
    if (this.ascentHold >= INERTIA.voluntaryAscentHold) {
      this.ascentHold = 0;
      this.ascend();
    }
  }

  ascend (reason = 'chose') {
    if (!this.path.length || this.transition.active) return;
    const leaving = this.path[this.path.length - 1];
    const parent = this.parentWeave;
    const pts = strandPath(parent, leaving, this.time);
    const mid = pts[Math.floor(pts.length / 2)] ?? { x: 0, y: 0 };

    this.transition.begin('up', TIMING.ascentTravel, {
      from: this.current, to: parent, focus: mid
    });
    this.pendingAscend = true;
    this.stats.ascents++;
    if (reason === 'forced') this.stats.forcedUp++;
    sfx.ascend(Math.max(0, this.depth - 1));
  }

  /** An interruption does not take one level of depth. It takes all of it. */
  surface (reason) {
    const lost = this.depth;
    if (!lost) return;
    this.interrupts.noteDepthLost(lost);
    this.path = [];
    this.hold = 0;
    this.holdTarget = null;
    this.sharpness = 0;
    this.cam = fitTo(this.root, this.canvas.clientWidth, this.canvas.clientHeight);
    this.stats.forcedUp++;
    sfx.ascend(0);
    this.ui.syncMeters(this);
    this.ui.say(
      reason === 'forced'
        ? `Pulled all the way out. ${lost} ${lost === 1 ? 'level' : 'levels'} of depth gone.`
        : `You answered. ${lost} ${lost === 1 ? 'level' : 'levels'} of depth gone.`,
      'loss'
    );
  }

  /* -------------------------------------------------------------- */
  /* Tuning                                                          */
  /* -------------------------------------------------------------- */

  tryTune (s, dir) {
    if (!s || !canTune(s)) {
      if (s && s.locked) this.ui.say('That one is bound. It will not move.', 'note');
      else if (s && !isLeaf(s)) this.ui.say('That is a bundle. Hold it to go inside.', 'note');
      return;
    }
    if (this.attention < 1) {
      this.ui.say('Nothing left to spend. Stay down here and it will come back.', 'note');
      return;
    }

    // Measure the bundle against its requirement before and after, so the
    // game can tell you when you have just made things worse. Tune direction
    // is otherwise the one thing here that is genuinely hard to guess.
    const parent = this.parentWeave;
    const holder = this.path[this.path.length - 1];
    const before = parent && holder
      ? freqDistance(requirementFor(parent, holder.id), effectiveFreq(holder))
      : null;

    this.attention -= 1;
    tune(s, dir);
    this.stats.tunes++;
    // Hand the target over so the two notes can beat against each other.
    sfx.tune(
      holder ? effectiveFreq(holder) : effectiveFreq(s),
      parent && holder ? requirementFor(parent, holder.id) : null
    );

    if (before !== null) {
      const after = freqDistance(requirementFor(parent, holder.id), effectiveFreq(holder));
      if (after > before + 0.001 && !this.warnedDirection) {
        this.warnedDirection = true;
        this.ui.say(
          this.keyboardMode
            ? 'That moved it further away. Press [ to go the other way.'
            : 'That moved it further away. Shift and click to go the other way.',
          'note'
        );
      }
    }

    this.checkSolved();
    this.ui.syncMeters(this);
  }

  checkSolved () {
    const was = this.solved;
    const path = solve(this.root);
    this.solved = !!path;
    if (this.solved && !was) {
      this.solvedAt = this.time;
      sfx.solved(this.root.seedFreq);
      this.ui.say('It carries.', 'good');
    }
  }

  /* -------------------------------------------------------------- */
  /* Frame                                                           */
  /* -------------------------------------------------------------- */

  update (dt) {
    this.time += dt;
    if (!this.running) return;

    // Transition bookkeeping.
    if (this.transition.update(dt)) {
      if (this.pendingDescend) {
        this.path.push(this.pendingDescend);
        this.pendingDescend = null;
        this.stats.deepest = Math.max(this.stats.deepest, this.depth);
      }
      if (this.pendingAscend) {
        this.path.pop();
        this.pendingAscend = null;
      }
      this.cam = fitTo(this.current, this.canvas.clientWidth, this.canvas.clientHeight);
      this.selected = 0;
      this.ui.syncMeters(this);
    }

    // Attention. Depth generates it, the surface barely does, and the strand
    // you are drawn to generates it fastest.
    let rate = this.depth === 0 ? 0.14 : 0.5 * (1 + this.depth * 0.35);
    if (this.insideAffinity) {
      rate *= 2.6;
      this.affinityDwell += dt;
      this.stats.affinityTime += dt;
    } else {
      this.affinityDwell = 0;
    }
    if (this.interrupts.state === 'pending') rate *= 0.25;

    // Masking runs off the same attention as the work, whether or not you are
    // using any. It is the cost you pay before you have done anything.
    if (this.masked) {
      rate *= MASK.regenMultiplier;
      const cost = MASK.drainPerSecond * dt / 1000;
      rate -= MASK.drainPerSecond;
      this.stats.maskedTime += dt;
      this.stats.maskedCost += cost;
    }

    // Stimming is the one thing masking does not suppress.
    if (this.stimming) {
      rate += STIM.regenPerSecond;
      this.stats.stimTime += dt;
    }

    const before = Math.floor(this.attention);
    this.attention = Math.max(0, Math.min(ATTENTION_MAX, this.attention + rate * dt / 1000));
    if (Math.floor(this.attention) !== before) {
      if (this.insideAffinity && rate > 0) sfx.surplus();
      this.ui.syncMeters(this);
    }

    // Sight sharpens where attention rests and softens when it moves.
    const moving = this.pointerMoved;
    this.sharpness = Math.max(0, Math.min(1,
      this.sharpness + (moving ? -0.0032 : 0.0016) * dt
    ));
    this.pointerMoved = false;

    // Choosing to surface, which takes a moment.
    if (this.ascending) this.requestAscend(dt);
    else this.ascentHold = Math.max(0, this.ascentHold - dt * 2);

    // Holding a bundle to go inside.
    if (this.holdTarget && !this.transition.active) {
      const needed = this.remembered.has(this.holdTarget.id)
        ? TIMING.rememberedDescentHold
        : TIMING.descentHold;
      this.hold += dt;
      if (this.hold >= needed) {
        const t = this.holdTarget;
        this.holdTarget = null;
        this.hold = 0;
        this.descend(t);
      }
    }

    this.teacher.update(this);

    // Interruptions.
    const outcome = this.interrupts.update(dt, { depth: this.depth });
    if (outcome === 'forced') this.surface('forced');
    this.ui.syncInterrupt(this);

    if (this.solved && !this.celebrated && this.time - this.solvedAt > 2200) {
      this.celebrated = true;
      this.running = false;
      this.ui.showReflection(this);
    }
  }

  render () {
    const c = this.canvas;
    const vw = c.clientWidth;
    const vh = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== vw * dpr || c.height !== vh * dpr) {
      c.width = vw * dpr;
      c.height = vh * dpr;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The loop runs from boot, before any weave exists, so the title screen
    // still gets a living background behind it.
    if (!this.root) {
      background(ctx, vw, vh, this.time, null);
      return;
    }

    const focus = this.focusPoint(vw, vh);
    // Mid-descent the water should already be changing, so the tint follows
    // the transition rather than snapping when it lands.
    const shown = this.transition.active
      ? this.depth + (this.transition.kind === 'down' ? this.transition.t : -this.transition.t)
      : this.depth;
    background(ctx, vw, vh, this.time, focus, shown);

    const lit = this.depth === 0 ? litStrands(this.root) : new Set();

    if (this.transition.active) {
      const fromBase = fitTo(this.transition.from, vw, vh);
      const toBase = fitTo(this.transition.to, vw, vh);
      const out = this.transition.outgoing(fromBase, vw, vh);
      const inn = this.transition.incoming(toBase, vw, vh);

      drawWeave(ctx, {
        weave: this.transition.from, cam: out.cam, alpha: out.alpha,
        lit, focusStrand: null, solved: this.solved
      }, vw, vh, this.time);

      const r = drawWeave(ctx, {
        weave: this.transition.to, cam: inn.cam, alpha: inn.alpha,
        lit: new Set(), focusStrand: null, solved: this.solved
      }, vw, vh, this.time);
      this.lastPaths = r.paths;
      this.tf = r.tf;
    } else {
      const r = drawWeave(ctx, {
        weave: this.current, cam: this.cam, alpha: 1,
        lit, focusStrand: this.hoverStrandId(), solved: this.solved
      }, vw, vh, this.time);
      this.lastPaths = r.paths;
      this.tf = r.tf;
    }

    drawLens(ctx, vw, vh, focus, this.sharpness);
    drawStim(ctx, vw, vh, this.stimming, focus, this.time);
    drawMask(ctx, vw, vh, this.masked, this.time);

    if (this.depth > 0 && !this.transition.active) {
      const s = this.path[this.path.length - 1];
      const parent = this.parentWeave;
      const need = requirementFor(parent, s.id);
      const cur = effectiveFreq(s);
      // The meter is drawn on the canvas but has to share the bottom of the
      // screen with real DOM controls, whose height and position change with
      // viewport and with whatever is on screen. Rather than guess, measure
      // whatever is currently down there and sit above the highest of them.
      let floor = vh;
      for (const sel of ['#interrupt', '#teach', '.tools']) {
        const el = document.querySelector(sel);
        if (!el || el.hidden || el.offsetParent === null) continue;
        floor = Math.min(floor, el.getBoundingClientRect().top);
      }
      const lift = Math.max(0, (vh - 96) - (floor - 78));

      drawComposite(ctx, vw, vh, {
        need, current: cur, lift,
        affinity: this.insideAffinity,
        inBand: freqDistance(need, cur) <= RULES.tolerance
      });
    }

    if (this.holdTarget) {
      const needed = this.remembered.has(this.holdTarget.id)
        ? TIMING.rememberedDescentHold : TIMING.descentHold;
      drawDescentRing(ctx, focus, Math.min(1, this.hold / needed),
        this.remembered.has(this.holdTarget.id));
    } else if (this.ascentHold > 0) {
      drawDescentRing(ctx, focus,
        Math.min(1, this.ascentHold / INERTIA.voluntaryAscentHold), false);
    }
  }

  /* -------------------------------------------------------------- */
  /* Input                                                           */
  /* -------------------------------------------------------------- */

  focusPoint (vw, vh) {
    if (this.keyboardMode) {
      const s = this.current.strands[this.selected];
      if (s && this.lastPaths.has(s.id)) {
        const pts = this.lastPaths.get(s.id);
        return pts[Math.floor(pts.length / 2)];
      }
    }
    if (this.pointer.inside) return { x: this.pointer.x, y: this.pointer.y };
    return { x: vw / 2, y: vh / 2 };
  }

  hoverStrandId () {
    const s = this.strandAt(this.focusPoint(this.canvas.clientWidth, this.canvas.clientHeight));
    return s ? s.id : null;
  }

  strandAt (pt) {
    if (!pt) return null;
    let best = null, bestD = 26;
    for (const s of this.current.strands) {
      const pts = this.lastPaths.get(s.id);
      if (!pts) continue;
      const d = distToPath(pts, pt.x, pt.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  onPointerMove (x, y) {
    this.keyboardMode = false;
    if (Math.hypot(x - this.pointer.x, y - this.pointer.y) > 2) this.pointerMoved = true;
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.inside = true;

    if (this.holdTarget) {
      const s = this.strandAt({ x, y });
      if (!s || s.id !== this.holdTarget.id) {
        this.holdTarget = null;
        this.hold = 0;
      }
    }
  }

  onPointerDown (x, y, shift) {
    this.pointer.down = true;
    const s = this.strandAt({ x, y });
    if (!s) return;
    if (isLeaf(s)) this.tryTune(s, shift ? -1 : 1);
    else { this.holdTarget = s; this.hold = 0; }
  }

  onPointerUp () {
    this.pointer.down = false;
    this.holdTarget = null;
    this.hold = 0;
  }

  onKeyUp (e) {
    if (e.key === 'Escape' || e.key === 'Backspace') this.ascending = false;
    if (e.key === 's' || e.key === 'S') this.setStim(false);
  }

  onKey (e) {
    const k = e.key;
    if (e.repeat) return;

    if (k === 'Escape' || k === 'Backspace') {
      e.preventDefault();
      if (this.interrupts.state !== 'idle') return;
      this.ascending = true;
      return;
    }

    if (k === 'm' || k === 'M') { e.preventDefault(); this.toggleMask(); return; }
    if (k === 's' || k === 'S') { e.preventDefault(); this.setStim(true); return; }

    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'Tab') {
      e.preventDefault();
      this.keyboardMode = true;
      this.pointerMoved = true;
      const n = this.current.strands.length;
      this.selected = (this.selected + (e.shiftKey ? -1 : 1) + n) % n;
      this.announceSelected();
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowUp') {
      e.preventDefault();
      this.keyboardMode = true;
      this.pointerMoved = true;
      const n = this.current.strands.length;
      this.selected = (this.selected - 1 + n) % n;
      this.announceSelected();
      return;
    }

    if (k === '[' || k === ']') {
      e.preventDefault();
      this.keyboardMode = true;
      const s = this.current.strands[this.selected];
      this.tryTune(s, k === '[' ? -1 : 1);
      return;
    }

    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      this.keyboardMode = true;
      const s = this.current.strands[this.selected];
      if (!s) return;
      if (isLeaf(s)) this.tryTune(s, e.shiftKey ? -1 : 1);
      else this.descend(s);
    }
  }

  announceSelected () {
    const s = this.current.strands[this.selected];
    if (!s) return;
    const f = effectiveFreq(s);
    const kind = isLeaf(s)
      ? (s.locked ? 'bound strand' : 'strand')
      : `bundle of ${s.inner.strands.length}`;
    this.ui.say(
      `${kind}, ${Math.round(f * 360)} degrees${s.affinity ? ', yours' : ''}.`,
      'quiet'
    );
  }
}
