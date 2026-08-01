/**
 * Sound.
 *
 * Plucked strings, because plucking is the gesture. Notes are generated with
 * Karplus-Strong into a buffer rather than played from samples, so the whole
 * thing stays a few kilobytes of code and no assets.
 *
 * The important part is beating. Tuning plays the strand's note against the
 * note it is trying to reach, and the two interfere. Far off and they clash.
 * Close and you get a slow pulse that slows further as you approach, exactly
 * the way tuning a real string works. You can hear a bundle come into tune
 * before you read the meter, which also means the puzzle has a channel that
 * does not depend on seeing colour.
 *
 * Off unless asked for. Nothing is loud, nothing arrives unprompted, and the
 * only fast attack in here belongs to a pluck the player triggered.
 */

import { settings, freqDistance } from './config.js';

let ctxA = null;
let master = null;
let ambience = null;
let ambienceGain = null;
const buffers = new Map();

// Dorian without a leading tone. Nothing in it wants to resolve anywhere.
const SCALE = [0, 2, 3, 5, 7, 9, 10];

function ensure () {
  if (ctxA) return ctxA;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctxA = new AC();
  master = ctxA.createGain();
  master.gain.value = 0;
  const soft = ctxA.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 5200;
  master.connect(soft);
  soft.connect(ctxA.destination);
  return ctxA;
}

export function unlock () {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function setEnabled (on) {
  const c = ensure();
  if (!c) return;
  if (on) c.resume();
  const t = c.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.linearRampToValueAtTime(on ? settings.soundLevel * 0.55 : 0, t + 0.8);
  if (on && !ambience) startAmbience();
}

export function setLevel (v) {
  if (!master || !ctxA) return;
  master.gain.linearRampToValueAtTime(settings.sound ? v * 0.55 : 0, ctxA.currentTime + 0.2);
}

/* ------------------------------------------------------------------ */
/* Karplus-Strong                                                      */
/* ------------------------------------------------------------------ */

/**
 * A plucked string. A burst of noise is fed round a delay line the length of
 * one wavelength, averaged and damped a little on each pass, which is what
 * turns noise into a decaying harmonic tone.
 */
function pluckBuffer (c, hz, damping = 0.9965, seconds = 2.6) {
  const key = `${Math.round(hz)}:${damping}`;
  if (buffers.has(key)) return buffers.get(key);

  const sr = c.sampleRate;
  const N = Math.max(2, Math.round(sr / hz));
  const buf = c.createBuffer(1, Math.ceil(sr * seconds), sr);
  const out = buf.getChannelData(0);

  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;

  // Soften the excitation before it starts circulating. A raw noise burst
  // gives a banjo. Rolling it off first gives something closer to a harp.
  let prev = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      prev = prev * 0.62 + ring[i] * 0.38;
      ring[i] = prev;
    }
  }

  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const cur = ring[idx];
    const next = ring[(idx + 1) % N];
    ring[idx] = (cur + next) * 0.5 * damping;
    out[i] = cur;
    idx = (idx + 1) % N;
  }

  buffers.set(key, buf);
  return buf;
}

function pluck (hz, { gain = 0.2, delay = 0, damping = 0.9965, pan = 0 } = {}) {
  const c = ensure();
  if (!c || !settings.sound) return null;

  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(c, hz, damping);

  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.014);   // fast, never instant
  g.gain.setTargetAtTime(0.0001, t + 0.05, 0.85);

  let tail = g;
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    tail = p;
  }

  src.connect(g);
  tail.connect(master);
  src.start(t);
  src.stop(t + 2.7);
  return src;
}

function pitch (freq, octave = 4) {
  const n = ((freq % 1) + 1) % 1;
  const step = SCALE[Math.floor(n * SCALE.length) % SCALE.length];
  return 55 * Math.pow(2, octave - 1 + step / 12);
}

/** Continuous pitch, for the beating pair. Not quantised to the scale. */
function freeHz (freq, octave = 4) {
  return 55 * Math.pow(2, octave - 1 + (((freq % 1) + 1) % 1) * 12 / 12);
}

/* ------------------------------------------------------------------ */
/* Ambience                                                            */
/* ------------------------------------------------------------------ */

function startAmbience () {
  const c = ensure();
  if (!c) return;

  // Filtered noise, moving slowly. Water rather than a drone.
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
    d[i] = last;
  }

  ambience = c.createBufferSource();
  ambience.buffer = buf;
  ambience.loop = true;

  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 380;

  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.055;
  lfoGain.gain.value = 90;
  lfo.connect(lfoGain);
  lfoGain.connect(filt.frequency);
  lfo.start();

  ambienceGain = c.createGain();
  ambienceGain.gain.value = 0.5;

  ambience.connect(filt);
  filt.connect(ambienceGain);
  ambienceGain.connect(master);
  ambience.start();
}

/** Deeper water is darker and quieter. */
function setDepthTone (depth) {
  if (!ambienceGain || !ctxA) return;
  ambienceGain.gain.linearRampToValueAtTime(0.5 + depth * 0.16, ctxA.currentTime + 1.2);
}

/* ------------------------------------------------------------------ */

export const sfx = {
  /**
   * A tune. Plays the bundle's note against the note it is reaching for.
   *
   * The gap between them is the whole message: wide and they clash, narrow
   * and they beat slowly against each other, together and the beating stops.
   */
  tune (freq, target = null) {
    if (target == null) { pluck(pitch(freq, 5), { gain: 0.16 }); return; }

    const off = freqDistance(freq, target);
    const base = freeHz(target, 4);
    // Detune scales with how far out the bundle is. At zero the two notes are
    // the same and there is nothing to hear beating.
    const other = base * Math.pow(2, off * 1.9);

    pluck(base, { gain: 0.15, pan: -0.35 });
    pluck(other, { gain: 0.15, pan: 0.35 });

    // Once it is in, a fifth above to say so.
    if (off <= 0.02) pluck(base * 1.5, { gain: 0.09, delay: 0.16 });
  },

  descend (depth) {
    setDepthTone(depth);
    [0.2, 0.35, 0.5].forEach((f, i) =>
      pluck(pitch(f, 3 + Math.min(1, i)), { gain: 0.12, delay: i * 0.1 }));
  },

  ascend (depth) {
    setDepthTone(depth);
    [0.5, 0.35].forEach((f, i) =>
      pluck(pitch(f, 4), { gain: 0.09, delay: i * 0.08 }));
  },

  carry (freq) { pluck(pitch(freq, 5), { gain: 0.14 }); },

  solved (freq) {
    // A rolled chord, the way a harp actually gets played.
    [0, 0.14, 0.28, 0.42, 0.56].forEach((f, i) =>
      pluck(pitch(freq + f, i > 2 ? 5 : 4), { gain: 0.15, delay: i * 0.13 }));
  },

  // Low, soft, and slow to arrive. An interruption should be unwelcome for
  // what it costs you, never because it startled you.
  knock () { pluck(pitch(0.05, 3), { gain: 0.13, damping: 0.992 }); },

  refuse () { pluck(pitch(0.45, 4), { gain: 0.10 }); },

  surplus () { pluck(pitch(0.7, 5), { gain: 0.08 }); },

  found () {
    [0.6, 0.75].forEach((f, i) => pluck(pitch(f, 5), { gain: 0.07, delay: i * 0.18 }));
  }
};
