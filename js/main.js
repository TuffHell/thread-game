/**
 * Boot and the frame loop.
 */

import { Game } from './game.js';
import { UI } from './ui.js';
import { settings, freqDistance } from './config.js';
import { solve, effectiveFreq, requirementFor } from './weave.js';
import * as audio from './audio.js';

const debug = { solve, effectiveFreq, requirementFor, freqDistance };

const canvas = document.getElementById('stage');
const ui = new UI();
const game = new Game(canvas, ui);
ui.bind(game);

// Handle for the console, for tuning levels without a rebuild.
window.thread = { game, ui, settings, ...debug };

// Take the system's word for it before the player has said anything.
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  settings.motion = 0;
  ui.syncChoices();
}

/* ---------------------------------------------------------------- */
/* Input                                                             */
/* ---------------------------------------------------------------- */

function local (e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointermove', e => {
  const p = local(e);
  game.onPointerMove(p.x, p.y);
});

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  audio.unlock();
  const p = local(e);
  game.onPointerDown(p.x, p.y, e.shiftKey);
});

canvas.addEventListener('pointerup', () => game.onPointerUp());
canvas.addEventListener('pointercancel', () => game.onPointerUp());
canvas.addEventListener('pointerleave', () => {
  game.pointer.inside = false;
  game.onPointerUp();
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  game.ascend();
});

window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
  if (!game.running) return;
  game.onKey(e);
});

window.addEventListener('keyup', e => game.onKeyUp(e));

window.addEventListener('blur', () => game.onPointerUp());

/* ---------------------------------------------------------------- */
/* Loop                                                              */
/* ---------------------------------------------------------------- */

let last = performance.now();

/**
 * A throw inside the loop used to stop it forever, because the next frame is
 * only ever queued at the end of the previous one. One bad frame took the
 * whole game down with it, which is a poor way to lose a demo.
 *
 * The error is reported loudly and kept on window.thread.lastError rather than
 * swallowed, and the loop carries on. Repeats are counted, not reprinted.
 */
const seen = new Map();

function frame (now) {
  // Clamp so a backgrounded tab does not fast forward the world on return.
  const dt = Math.min(48, now - last);
  last = now;
  try {
    game.update(dt);
    game.render();
  } catch (err) {
    const key = err && err.stack ? err.stack.split('\n').slice(0, 2).join('') : String(err);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    window.thread.lastError = err;
    if (count === 1) console.error('[thread] frame failed, loop continuing:', err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (game.root) game.refit();
  }, 120);
});
