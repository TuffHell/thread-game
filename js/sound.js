/**
 * Sound.
 *
 * Procedural, so there are no audio files to ship and nothing to load. Three
 * rules it never breaks:
 *
 *   Nothing arrives suddenly.  Every envelope has a real attack. There is no
 *                              transient anywhere, no alarm, no sting.
 *   Nothing is loud.           The ceiling is low enough to talk over.
 *   You can always kill it.    One button in the HUD, remembered forever.
 *
 * Default is off. That is not timidity: for a lot of autistic players
 * unexpected audio is exactly the thing that ends a session, and a game about
 * sensory load that blasts you on load would be an embarrassment. It is one
 * obvious click away, and the button says what it does.
 */

let ctx = null;
let master = null;
let room = null;          // steady room tone
let roomGain = null;
let on = false;

function ensure () {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 4200;
  master.connect(soft);
  soft.connect(ctx.destination);
  return ctx;
}

/** Filtered noise, the bed everything else sits on. */
function startRoomTone () {
  const c = ensure();
  if (!c || room) return;
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.99 + (Math.random() * 2 - 1) * 0.01;
    d[i] = last;
  }
  room = c.createBufferSource();
  room.buffer = buf;
  room.loop = true;

  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 300;

  // A very slow sweep, so the tone breathes instead of sitting flat.
  const lfo = c.createOscillator();
  const lg = c.createGain();
  lfo.frequency.value = 0.04;
  lg.gain.value = 70;
  lfo.connect(lg); lg.connect(f.frequency); lfo.start();

  roomGain = c.createGain();
  roomGain.gain.value = 0.5;
  room.connect(f); f.connect(roomGain); roomGain.connect(master);
  room.start();
}

export function isOn () { return on; }

export function setOn (v) {
  const c = ensure();
  if (!c) return false;
  on = !!v;
  if (on) { c.resume(); startRoomTone(); }
  const t = c.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.linearRampToValueAtTime(on ? 0.5 : 0, t + 0.7);
  return on;
}

export function toggle () { return setOn(!on); }

/* ------------------------------------------------------------------ */

function tone (hz, { dur = 0.5, gain = 0.1, type = 'sine', attack = 0.05, delay = 0 } = {}) {
  const c = ensure();
  if (!c || !on) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = hz;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);   // never a click
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A soft burr, for the grinder and the steam wand. */
function burr ({ dur = 1.1, gain = 0.07, cut = 900 } = {}) {
  const c = ensure();
  if (!c || !on) return;
  const t = c.currentTime;
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
    d[i] = last;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cut;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.12);
  g.gain.setValueAtTime(gain, t + dur - 0.2);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

// A pentatonic run, so any two of these land well together.
const NOTE = [262, 294, 349, 392, 440, 523, 587, 698];

export const sfx = {
  step () { tone(90 + Math.random() * 20, { dur: 0.12, gain: 0.02, attack: 0.02, type: 'triangle' }); },
  grind () { burr({ dur: 1.0, gain: 0.075, cut: 800 }); },
  pull () { burr({ dur: 1.2, gain: 0.05, cut: 500 }); },
  steam () { burr({ dur: 1.0, gain: 0.055, cut: 2200 }); },

  /** A cup down on a saucer, then the note of the run you are on. */
  serve (flow = 0) {
    tone(1400, { dur: 0.16, gain: 0.05, attack: 0.012, type: 'triangle' });
    tone(NOTE[Math.min(NOTE.length - 1, Math.round(flow * 5))],
      { dur: 1.1, gain: 0.07, attack: 0.06, delay: 0.08 });
  },

  /** Deeper in the run, a fifth added underneath. Reward you can hear. */
  flowUp (flow) {
    if (flow < 0.45) return;
    tone(NOTE[Math.min(NOTE.length - 1, Math.round(flow * 6))] / 2,
      { dur: 1.4, gain: 0.045, attack: 0.15 });
  },

  done () {
    [0, 0.22, 0.44, 0.7].forEach((d, i) =>
      tone(NOTE[i + 2], { dur: 1.8, gain: 0.06, attack: 0.09, delay: d }));
  }
};

/** Follow the room: the louder the spot, the more present the tone. */
export function setLoad (load) {
  if (!roomGain || !ctx) return;
  roomGain.gain.linearRampToValueAtTime(0.35 + load * 0.9, ctx.currentTime + 0.35);
}
