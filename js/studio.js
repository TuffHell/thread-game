/**
 * The playable loop.
 *
 * Drag something, the field recomputes, and every person on the commission
 * walks the room again. You sign off when all of them make it and none of
 * the owner's rules are broken. That is the game; everything else is
 * surfaces around it.
 */

import { settings } from './config.js';
import { BUILDERS } from './rooms.js';
import { def, KINDS, spent, thing, checkConstraints } from './room.js';
import { makeGrid, compute, combine, explain, DOMAINS } from './field.js';
import { visit, PEOPLE } from './person.js';
import {
  fit, toScreen, toRoom, renderPixelPlan, drawPixelLabels
} from './plan.js';

const READABLE = {
  sound: 'noise', light: 'brightness', flicker: 'flicker', glare: 'glare',
  crowd: 'people close by', clutter: 'visual clutter', smell: 'smell',
  escape: 'nowhere to retreat to', exposure: 'cannot see the way out'
};

export class Studio {
  constructor (canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.mode = 'load';
    this.held = null;
    this.hover = null;
    this.dirty = true;
  }

  /** Take a commission: a room, its people, the owner's rules. */
  load (commission) {
    this.commission = commission;
    this.room = BUILDERS[commission.room]();
    if (commission.budget != null) this.room.budget = commission.budget;
    this.constraints = commission.constraints ?? [];
    this.people = commission.people.map(k => PEOPLE[k]);
    this.viewIdx = 0;
    this.grid = makeGrid(this.room, 12);
    this.held = null;
    this.trayPick = null;
    this.moves = 0;
    this.recompute();
    this.ui.onRoom(this);
  }

  get person () { return this.people[this.viewIdx]; }
  get result () { return this.results?.[this.viewIdx]; }

  setViewPerson (i) {
    this.viewIdx = Math.max(0, Math.min(this.people.length - 1, i));
    // Re-lay the display field in this person's weights so the heatmap shows
    // the room as it is for them, which is the entire point of profiles.
    combine(this.grid, this.person.weights);
    this.stamp = (this.stamp ?? 0) + 1;
    this.dirty = true;
    this.ui.onResult(this);
  }

  /** The only expensive thing in the game, and it runs on every change. */
  recompute () {
    compute(this.room, this.grid);
    // Everyone walks. The same layers, weighted per person, so the same room
    // fails differently for each of them.
    this.results = this.people.map(p => {
      combine(this.grid, p.weights);
      return visit(this.room, this.grid, p);
    });
    combine(this.grid, this.person.weights);
    this.broken = checkConstraints(this.room, this.constraints);
    this.stamp = (this.stamp ?? 0) + 1;
    this.dirty = true;
    this.ui.onResult(this);
  }

  /** Everyone through, nothing broken, ready for the owner's signature. */
  ready () {
    return this.results.every(r => r.ok) && this.broken.length === 0;
  }

  /** Plain words for where it stands, worst news first. */
  verdict () {
    if (!this.results) return null;

    if (this.broken.length) {
      return {
        ok: false, owner: true,
        headline: 'The owner will not sign this off.',
        detail: this.broken.map(b => b.text).join(' ')
      };
    }

    const bad = this.results.find(r => !r.ok);
    if (!bad) {
      const names = this.results.map(r => r.person.name);
      const worstReserve = Math.min(...this.results.map(r => Math.round(r.reserve)));
      const list = names.length === 1 ? names[0]
        : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
      return {
        ok: true,
        headline: `${list} ${names.length === 1 ? 'made' : 'all made'} it in, ordered, and left.`,
        detail: `The tightest margin was ${worstReserve}% of someone's reserve. Ready to sign off.`
      };
    }

    const who = bad.person.name;
    if (bad.reason === 'blocked') {
      return { ok: false, headline: 'There is no way through.', detail: `Blocked ${bad.leg}.` };
    }
    const cause = bad.blame ? READABLE[bad.blame.domain] ?? bad.blame.domain : 'the room';
    const broke = bad.events.length
      ? ` ${who} had been interrupted ${bad.events.length} time${bad.events.length > 1 ? 's' : ''} by then` +
        (bad.events.some(e => !e.recoverable) ? ', with nowhere to settle after.' : '.')
      : '';

    if (bad.reason === 'spike') {
      return {
        ok: false,
        headline: `It became too much for ${who}, ${bad.leg}.`,
        detail: `One spot is past what ${who} can take, and the reason is ${cause}. ` +
                'Nothing elsewhere in the room makes up for it.' + broke
      };
    }
    return {
      ok: false,
      headline: `${who} ran out, ${bad.leg}.`,
      detail: `Nothing was unbearable by itself, but ${cause} across the whole ` +
              `visit added up to more than ${who} had.` + broke
    };
  }

  budgetLeft () {
    return this.room.budget - spent(this.room);
  }

  /* -------------------------------------------------------------- */
  /* Interaction                                                     */
  /* -------------------------------------------------------------- */

  /**
   * The room-to-screen mapping.
   *
   * The pixel renderer rounds the room into a whole number of buffer pixels,
   * so its fit is very slightly different from the old continuous one. Using
   * the renderer's own numbers is what keeps a grabbed table under the
   * cursor instead of a pixel or two adrift.
   */
  view () {
    return this.pixelView ??
      fit(this.room, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  thingAt (sx, sy) {
    const v = this.view();
    const p = toRoom(v, sx, sy);
    let best = null, bestD = Infinity;
    for (const t of this.room.things) {
      if (!t.placed || !t.movable) continue;
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d < def(t).r && d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  onDown (sx, sy) {
    if (this.trayPick) {
      const v = this.view();
      const p = toRoom(v, sx, sy);
      const kind = this.trayPick;
      const cost = KINDS[kind].cost ?? 0;
      if (cost > this.budgetLeft()) {
        this.ui.say('Not enough of the owner’s goodwill left for that.');
        return;
      }
      const t = thing(kind, clamp(p.x, 20, this.room.w - 20), clamp(p.y, 20, this.room.h - 20));
      t.fromTray = true;
      this.room.things.push(t);
      this.trayPick = null;
      this.held = t.id;
      this.moves++;
      this.recompute();
      this.ui.syncTray(this);
      return;
    }

    const t = this.thingAt(sx, sy);
    if (t) this.held = t.id;
  }

  onMove (sx, sy) {
    const v = this.view();
    const p = toRoom(v, sx, sy);

    if (this.held) {
      const t = this.room.things.find(x => x.id === this.held);
      if (t) {
        t.x = clamp(p.x, 16, this.room.w - 16);
        t.y = clamp(p.y, 16, this.room.h - 16);
        this.recompute();
      }
      return;
    }
    const h = this.thingAt(sx, sy);
    this.hover = h ? h.id : null;
    this.probe = { x: p.x, y: p.y };
    this.dirty = true;
  }

  onUp () {
    if (this.held) { this.moves++; this.held = null; }
  }

  /** Send a bought item back and refund it. */
  removeHeld () {
    const t = this.room.things.find(x => x.id === this.held || x.id === this.hover);
    if (!t || !t.fromTray) return;
    this.room.things = this.room.things.filter(x => x !== t);
    this.held = null;
    this.recompute();
    this.ui.syncTray(this);
  }

  setMode (m) { this.mode = m; this.dirty = true; }

  /** The worst channel at an arbitrary point, for the free-walk readout. */
  probeAt (x, y) {
    return explain(this.grid, x, y, this.person.weights)
      .filter(d => d.raw > 0.05)[0] ?? null;
  }

  /** What is worst at the point under the cursor, in this person's terms. */
  probeReading () {
    if (!this.probe) return null;
    const top = explain(this.grid, this.probe.x, this.probe.y, this.person.weights)
      .filter(d => d.raw > 0.04)
      .slice(0, 3);
    if (!top.length) return null;
    return top.map(d => `${READABLE[d.domain] ?? d.domain} ${Math.round(d.raw * 100)}%`);
  }

  /* -------------------------------------------------------------- */

  render () {
    const c = this.canvas;
    const vw = c.clientWidth, vh = c.clientHeight;
    // A canvas mid-layout has no box; fitting a room into it produces a
    // negative scale and negative-radius arcs. Skip the frame instead.
    if (vw < 2 || vh < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== vw * dpr || c.height !== vh * dpr) {
      c.width = vw * dpr; c.height = vh * dpr;
      this.dirty = true;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The scene is drawn small and blown up; the view it returns is in screen
    // pixels, so pointer hit-testing and labels agree with what is on screen.
    this.pixelView = renderPixelPlan(ctx, vw, vh, this.room, this.grid, {
      mode: this.mode,
      result: this.result,
      held: this.held,
      hover: this.hover,
      stamp: this.stamp
    });
    drawPixelLabels(ctx, this.pixelView, this.room,
                    { hover: this.hover, held: this.held });
  }
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
