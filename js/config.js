/**
 * Tuning constants and design tokens.
 *
 * Everything a designer would want to change lives here, not scattered
 * through the systems. Timing values are in milliseconds.
 */

export const TIMING = {
  // Descent is slow and deliberate. Ascent is instantaneous.
  // This asymmetry is the whole point: losing depth is free, regaining it is not.
  descentHold: 1150,
  descentTravel: 900,
  ascentTravel: 340,

  // A remembered route lets you fall back into a place you have been before.
  rememberedDescentHold: 420,

  strandUnfurl: 720,
  signalStep: 260,
  tuneSettle: 340,

  interruptWarning: 1600,
  interruptGrace: 5200,
  refusalCooldown: 2600
};

export const RULES = {
  // A signal crosses a strand when their frequencies are close enough.
  tolerance: 0.085,
  // Each tune rotates an inner strand by this much around the frequency wheel.
  tuneStep: 1 / 24,
  // Dwelling inside your affinity strand earns surplus tunes.
  affinitySurplusEvery: 2600,
  affinitySurplusMax: 3
};

/**
 * Masking.
 *
 * Presenting as available and fine. It works: people leave you alone, and
 * interruptions arrive far less often. It also runs continuously off the same
 * attention you were going to spend on the work.
 *
 * The game does not have an opinion about whether you should use it. It is a
 * real strategy with a real price, which is the honest way to model the thing.
 */
export const MASK = {
  drainPerSecond: 0.34,
  interruptMultiplier: 0.28,   // how much less often anyone calls for you
  regenMultiplier: 0.5
};

/**
 * Stimming.
 *
 * A repeating, self-directed motion that settles you. It is not a puzzle
 * action, it cannot be optimised, and it is never required. It is available
 * everywhere including the surface, it is the one thing masking does not
 * suppress, and it gives attention back.
 */
export const STIM = {
  regenPerSecond: 0.62,
  rippleSpeed: 0.0042
};

/**
 * Attention shifts are hard in both directions.
 *
 * Monotropism predicts difficulty leaving a tunnel as well as entering one, so
 * choosing to come up takes a moment. An interruption pulling you out does
 * not. That asymmetry is the whole argument, and it only lands if leaving on
 * your own terms is visibly slower than being taken.
 */
export const INERTIA = { voluntaryAscentHold: 480 };

export const LENS = {
  // Radius of clear sight, as a fraction of the smaller viewport dimension.
  coreRadius: 0.20,
  falloff: 0.42,
  // How much of the periphery survives. This is deliberately generous: the
  // lens should suggest that attention has a centre, not delete the board.
  // Set it too low and the game stops being playable, which rather defeats
  // the point of a game about how attention actually works.
  peripheryFloor: 0.45,
  sharpenRate: 0.0016,
  softenRate: 0.0032
};

/**
 * Palettes are whole-world states rather than a filter laid over one look.
 * Each is designed to be complete on its own terms.
 */
export const PALETTES = {
  deep: {
    name: 'Deep',
    note: 'Luminous strands in a dark field. The default world.',
    bg: '#080d14',
    bgGlow: '#0f1c2b',
    ink: '#e8f2fb',
    inkSoft: '#8fa6bd',
    node: '#dceaf7',
    anchor: '#4a6076',
    surface: 'rgba(14,26,40,0.86)',
    edge: 'rgba(150,196,235,0.20)',
    sat: 0.62,
    light: 0.62,
    glow: 1
  },
  quiet: {
    name: 'Quiet',
    note: 'Paper and ink. No glow, low contrast, nothing shines.',
    bg: '#f2efe8',
    bgGlow: '#e8e3d8',
    ink: '#23282e',
    inkSoft: '#6d7681',
    node: '#2b3138',
    anchor: '#a8a293',
    surface: 'rgba(255,253,248,0.92)',
    edge: 'rgba(60,66,72,0.18)',
    sat: 0.34,
    light: 0.42,
    glow: 0
  },
  plain: {
    name: 'Plain',
    note: 'Maximum contrast, flat shapes, no atmosphere at all.',
    bg: '#000000',
    bgGlow: '#000000',
    ink: '#ffffff',
    inkSoft: '#b9c4cf',
    node: '#ffffff',
    anchor: '#6b7885',
    surface: 'rgba(0,0,0,0.94)',
    edge: 'rgba(255,255,255,0.34)',
    sat: 0.9,
    light: 0.58,
    glow: 0
  }
};

/**
 * Player-set world state. Chosen before the game begins, changeable at any
 * time, and never buried behind a pause menu.
 */
export const settings = {
  palette: 'deep',
  motion: 1,        // 0 none, 0.5 reduced, 1 full
  glow: 1,          // bloom and halo intensity
  sound: 0,         // off by default, always
  soundLevel: 0.5,
  lens: true,       // peripheral softening
  announce: true,   // the predictability contract
  interruptions: 'ask'
};

export function palette () {
  return PALETTES[settings.palette] ?? PALETTES.deep;
}

/**
 * Hex to rgba.
 *
 * Canvas gradients interpolate in premultiplied space, so fading to
 * 'rgba(0,0,0,0)' drags every colour through grey on the way out. Fading to
 * the same colour at zero alpha is the only way to keep a gradient clean,
 * and it is very visible on the light palette.
 */
export function withAlpha (hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Frequency (0..1 around a wheel) to a colour in the current palette. */
export function freqColor (freq, lightMul = 1, alpha = 1) {
  const p = palette();
  const h = Math.round(((freq % 1) + 1) % 1 * 360);
  const s = Math.round(p.sat * 100);
  const l = Math.round(Math.min(0.92, p.light * lightMul) * 100);
  return `hsla(${h} ${s}% ${l}% / ${alpha})`;
}

/** Shortest signed distance between two points on the frequency wheel. */
export function freqDelta (a, b) {
  let d = (b - a) % 1;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

export function freqDistance (a, b) {
  return Math.abs(freqDelta(a, b));
}

/** Circular mean of a set of frequencies. An outer strand is what it contains. */
export function freqMean (freqs) {
  if (!freqs.length) return 0;
  let x = 0, y = 0;
  for (const f of freqs) {
    x += Math.cos(f * Math.PI * 2);
    y += Math.sin(f * Math.PI * 2);
  }
  const a = Math.atan2(y / freqs.length, x / freqs.length) / (Math.PI * 2);
  return ((a % 1) + 1) % 1;
}
