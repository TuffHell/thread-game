/**
 * The playable loop.
 *
 * Drag something, the field recomputes, the visitor walks it again, and you
 * find out immediately whether the trip works and what broke it. That is the
 * whole game and everything else is decoration on top of it.
 */

import { settings } from './config.js';
import { ROOMS } from './rooms.js';
import { def, KINDS, spent, thing } from './room.js';
import { makeGrid, compute, combine, explain, DOMAINS } from './field.js';
import { trip, PROFILE } from './visitor.js';
import {
  fit, toScreen, toRoom, drawBackdrop, drawHeat, drawWalls,
  drawRoute, drawThings, drawMarkers
} from './plan.js';

const READABLE = {
  sound: 'noise', light: 'brightness', flicker: 'flicker', glare: 'glare',
  crowd: 'people close by', clutter: 'visual clutter',
  escape: 'nowhere to retreat to', exposure: 'cannot see the way out'
};

export class Studio {
  constructor (canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.index = 0;
    this.mode = 'load';
    this.held = null;
    this.hover = null;
    this.dirty = true;
  }

  load (i) {
    const spec = ROOMS[i] ?? ROOMS[0];
    this.index = i;
    this.spec = spec;
    this.room = spec.build();
    this.grid = makeGrid(this.room, 12);
    this.held = null;
    this.trayPick = null;
    this.moves = 0;
    this.recompute();
    this.ui.onRoom(this);
  }

  /** The only expensive thing in the game, and it runs on every change. */
  recompute () {
    compute(this.room, this.grid);
    combine(this.grid);
    this.result = trip(this.room, this.grid, PROFILE);
    this.dirty = true;
    this.ui.onResult(this);
  }

  /** Plain words for what is wrong, at the place it went wrong. */
  verdict () {
    const r = this.result;
    if (!r) return null;
    if (r.ok) {
      return {
        ok: true,
        headline: 'They made it in, ordered, sat down and left.',
        detail: `Comfortable enough the whole way, with ${Math.round(r.reserve)}% left over.`
      };
    }
    if (r.reason === 'blocked') {
      return { ok: false, headline: 'There is no way through.', detail: `Blocked ${r.leg}.` };
    }
    const cause = r.blame ? READABLE[r.blame.domain] ?? r.blame.domain : 'the room';
    if (r.reason === 'spike') {
      return {
        ok: false,
        headline: `It became too much ${r.leg}.`,
        detail: `One spot on the route is unbearable, and the reason is ${cause}. ` +
                'Nothing elsewhere makes up for it.'
      };
    }
    return {
      ok: false,
      headline: `They ran out ${r.leg}.`,
      detail: `Nothing here was unbearable on its own, but ${cause} across the ` +
              'whole trip added up to more than they had.'
    };
  }

  budgetLeft () {
    return this.room.budget - spent(this.room);
  }

  /* -------------------------------------------------------------- */
  /* Interaction                                                     */
  /* -------------------------------------------------------------- */

  view () {
    return fit(this.room, this.canvas.clientWidth, this.canvas.clientHeight);
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
    // Placing something from the tray.
    if (this.trayPick) {
      const v = this.view();
      const p = toRoom(v, sx, sy);
      const kind = this.trayPick;
      const cost = KINDS[kind].cost ?? 0;
      if (cost > this.budgetLeft()) {
        this.ui.say('Not enough budget left for that.');
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
    if (t) {
      this.held = t.id;
      this.grabbed = { dx: 0, dy: 0 };
    }
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

  /** Send an item back to the tray and refund it. */
  removeHeld () {
    const t = this.room.things.find(x => x.id === this.held || x.id === this.hover);
    if (!t || !t.fromTray) return;
    this.room.things = this.room.things.filter(x => x !== t);
    this.held = null;
    this.recompute();
    this.ui.syncTray(this);
  }

  setMode (m) { this.mode = m; this.dirty = true; }

  /** What is worst at the point under the cursor. */
  probeReading () {
    if (!this.probe) return null;
    const top = explain(this.grid, this.probe.x, this.probe.y)
      .filter(d => d.raw > 0.04)
      .slice(0, 3);
    if (!top.length) return null;
    return top.map(d => `${READABLE[d.domain] ?? d.domain} ${Math.round(d.raw * 100)}%`);
  }

  /* -------------------------------------------------------------- */

  render () {
    const c = this.canvas;
    const vw = c.clientWidth, vh = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== vw * dpr || c.height !== vh * dpr) {
      c.width = vw * dpr; c.height = vh * dpr;
      this.dirty = true;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const v = this.view();
    drawBackdrop(ctx, vw, vh);
    drawHeat(ctx, v, this.room, this.grid, this.mode);
    drawWalls(ctx, v, this.room);
    drawRoute(ctx, v, this.result);
    drawThings(ctx, v, this.room, { held: this.held, hover: this.hover });
    drawMarkers(ctx, v, this.room);
  }
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
