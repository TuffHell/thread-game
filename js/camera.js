/**
 * Camera and the descent transition.
 *
 * Each weave lives in its own coordinate space, so moving between levels of
 * depth is a matter of flying the camera through one and settling into the
 * next. Going down passes through the strand you chose. Coming up falls
 * straight out.
 */

import { weaveBounds } from './weave.js';
import { settings } from './config.js';

export const easeOut = t => 1 - Math.pow(1 - t, 3);
export const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function fitTo (w, vw, vh, pad) {
  // Padding has to scale with the viewport or a phone fits the whole weave
  // into a postage stamp.
  if (pad == null) pad = Math.max(20, Math.min(96, vw * 0.09, vh * 0.09));
  const b = weaveBounds(w);
  const sx = (vw - pad * 2) / Math.max(1, b.w);
  const sy = (vh - pad * 2) / Math.max(1, b.h);
  const s = Math.min(sx, sy, 1.35);
  return { x: b.cx, y: b.cy, s };
}

export function lerpCam (a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    // Scale interpolates geometrically so a zoom feels even the whole way.
    s: a.s * Math.pow(b.s / a.s, t)
  };
}

export function makeTransform (cam, vw, vh) {
  return {
    toScreen (x, y) {
      return { x: (x - cam.x) * cam.s + vw / 2, y: (y - cam.y) * cam.s + vh / 2 };
    },
    toWorld (x, y) {
      return { x: (x - vw / 2) / cam.s + cam.x, y: (y - vh / 2) / cam.s + cam.y };
    },
    scale: cam.s
  };
}

/**
 * A descent has two halves that overlap: the weave you are leaving rushes
 * past and dims, and the one you are entering swells out of the middle.
 */
export class Transition {
  constructor () {
    this.active = false;
    this.kind = null;
    this.t = 0;
    this.dur = 1;
  }

  begin (kind, dur, ctx) {
    this.active = true;
    this.kind = kind;
    this.t = 0;
    this.dur = Math.max(1, settings.motion === 0 ? 120 : dur);
    Object.assign(this, ctx);
  }

  update (dt) {
    if (!this.active) return false;
    this.t = Math.min(1, this.t + dt / this.dur);
    if (this.t >= 1) {
      this.active = false;
      return true;
    }
    return false;
  }

  /** Camera and opacity for the weave being left behind. */
  outgoing (base, vw, vh) {
    const e = easeInOut(this.t);
    if (this.kind === 'down') {
      const target = { x: this.focus.x, y: this.focus.y, s: base.s * 5.2 };
      return { cam: lerpCam(base, target, e), alpha: Math.max(0, 1 - e * 1.7) };
    }
    const target = { x: base.x, y: base.y, s: base.s * 0.22 };
    return { cam: lerpCam(base, target, e), alpha: Math.max(0, 1 - e * 1.9) };
  }

  /** Camera and opacity for the weave being entered. */
  incoming (base, vw, vh) {
    const e = easeInOut(this.t);
    if (this.kind === 'down') {
      const from = { x: base.x, y: base.y, s: base.s * 0.20 };
      return { cam: lerpCam(from, base, e), alpha: Math.max(0, (e - 0.28) / 0.72) };
    }
    const from = { x: this.focus.x, y: this.focus.y, s: base.s * 4.4 };
    return { cam: lerpCam(from, base, e), alpha: Math.max(0, (e - 0.24) / 0.76) };
  }
}
