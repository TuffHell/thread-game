/**
 * Boot for the room prototype.
 */

import { Studio } from './studio.js';
import { KINDS } from './room.js';
import { DOMAINS } from './field.js';
import { ROOMS } from './rooms.js';
import { palette, settings } from './config.js';

const $ = id => document.getElementById(id);

const LAYER_LABEL = {
  load: 'everything', sound: 'noise', light: 'brightness', flicker: 'flicker',
  glare: 'glare', crowd: 'people', clutter: 'clutter',
  escape: 'retreat', exposure: 'wayfinding'
};

const ui = {
  onRoom (s) {
    $('roomCount').textContent = `room ${s.index + 1} of ${ROOMS.length}`;
    $('roomTitle').textContent = s.spec.title;
    $('roomLine').textContent = s.spec.line;
    this.syncTray(s);
    this.buildLayers(s);
  },

  onResult (s) {
    const v = s.verdict();
    if (!v) return;
    $('verdict').classList.toggle('ok', v.ok);
    $('verdictHead').textContent = v.headline;
    $('verdictDetail').textContent = v.detail;
    $('budgetRead').textContent = `${s.budgetLeft()} of ${s.room.budget}`;
    $('live').textContent = `${v.headline} ${v.detail}`;
  },

  syncTray (s) {
    const left = s.budgetLeft();
    $('tray').innerHTML = s.room.tray.map(k => {
      const d = KINDS[k];
      const afford = (d.cost ?? 0) <= left;
      return `<button class="tray-item${s.trayPick === k ? ' picked' : ''}"
        data-kind="${k}" ${afford ? '' : 'disabled'}>
        <b>${d.label}</b><span>${d.cost ?? 0}</span></button>`;
    }).join('');
    for (const b of $('tray').querySelectorAll('.tray-item')) {
      b.onclick = () => {
        s.trayPick = s.trayPick === b.dataset.kind ? null : b.dataset.kind;
        this.syncTray(s);
        this.say(s.trayPick ? 'Now click where it goes.' : '');
      };
    }
  },

  buildLayers (s) {
    const all = ['load', ...DOMAINS];
    $('layers').innerHTML = all.map(m =>
      `<button class="layer${m === s.mode ? ' on' : ''}" data-m="${m}">${LAYER_LABEL[m] ?? m}</button>`
    ).join('');
    for (const b of $('layers').querySelectorAll('.layer')) {
      b.onclick = () => {
        s.setMode(b.dataset.m);
        this.buildLayers(s);
      };
    }
  },

  say (t) { $('probe').textContent = t; }
};

const canvas = $('stage');
const studio = new Studio(canvas, ui);
window.room = { studio, ui, settings };

document.documentElement.style.setProperty('--bg', palette().bg);
document.body.style.background = palette().bg;

studio.load(0);

const local = e => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const p = local(e);
  studio.onDown(p.x, p.y);
});
canvas.addEventListener('pointermove', e => {
  const p = local(e);
  studio.onMove(p.x, p.y);
  const reading = studio.probeReading();
  if (!studio.trayPick) ui.say(reading ? reading.join('   ·   ') : '');
});
canvas.addEventListener('pointerup', () => studio.onUp());
canvas.addEventListener('pointercancel', () => studio.onUp());

window.addEventListener('keydown', e => {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    studio.removeHeld();
  }
});

function frame () {
  try {
    studio.render();
  } catch (err) {
    console.error('[room] frame failed, loop continuing:', err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
