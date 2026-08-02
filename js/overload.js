/**
 * What the room costs, made felt rather than reported.
 *
 * Everything else in this project measures load and then tells you about it
 * in a sentence. A sentence is the wrong instrument. The point of the game is
 * that a room can be quietly unbearable while looking completely fine, and
 * "Mara's reserve reached 51%" does not carry that — you read it, you agree
 * with it, and you feel nothing.
 *
 * So the replay drives the presentation itself from the same numbers the
 * simulation produced. As load rises the image tightens and over-saturates,
 * a hum comes up under everything, the frame starts to move very slightly,
 * and an interruption lands as a jolt. None of it is scripted or timed to a
 * storyboard: every value here is read off the step the walker is standing
 * on, so if you fix the room the effect goes away, because the room is fixed.
 * That is the whole design. The intensity IS the measurement.
 *
 * ON DOING THIS CAREFULLY
 *
 * A sensory-overload simulation aimed at making non-autistic people
 * understand is also going to be played by autistic people, for whom it is
 * not a metaphor. Three rules follow and none of them are negotiable:
 *
 *   It is announced.   Nothing starts without a card saying what is coming.
 *   It is adjustable.  Full, gentle and off, and gentle is a real option
 *                      rather than a token one — it keeps the grade and
 *                      drops the motion and the tone entirely.
 *   It respects the    prefers-reduced-motion pins it to gentle before the
 *   system.            player has touched anything.
 *
 * A game arguing that environments should adapt to people cannot ship an
 * effect that refuses to.
 */

const LEVELS = { full: 1, gentle: 0.42, off: 0 };

let host = null;      // the element that gets shaken
let grade = null;     // the colour/vignette layer
let level = 'full';
let value = 0;        // smoothed 0..1
let jolt = 0;         // decays after an interruption

export function attach (hostEl, gradeEl) {
  host = hostEl;
  grade = gradeEl;
}

export function setLevel (name) {
  level = LEVELS[name] != null ? name : 'full';
  if (level === 'off') reset();
}

export function currentLevel () { return level; }

/** The system asked for less motion before we ever got a say. */
export function respectSystem () {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduce && level === 'full') level = 'gentle';
  return level;
}

/** An interruption just happened. Lands as a knock, not a jump scare. */
export function knock () {
  if (level === 'off') return;
  jolt = 1;
}

export function reset () {
  value = 0;
  jolt = 0;
  if (host) { host.style.transform = ''; host.style.filter = ''; }
  if (grade) { grade.style.opacity = ''; grade.style.background = ''; }
}

/**
 * Drive the effect from one step of a simulated visit.
 *
 * `load` is the raw field value at that point and `reserve` is how much of
 * the person is left, both straight out of person.js. Reserve matters as
 * much as load: the same noisy corner is survivable at the start of a visit
 * and not at the end, which is the part people find hardest to believe and
 * the part this makes obvious.
 */
export function apply (dt, load = 0, reserveFrac = 1) {
  if (!host || level === 'off') return;
  const gain = LEVELS[level];

  // What it is like right now: how loud the spot is, weighted up as the
  // person runs out of room to absorb it.
  const target = Math.min(1, load * (0.55 + (1 - reserveFrac) * 1.15));

  // Rises quickly, falls slowly — relief is not instant, and pretending it
  // is would be the same lie as "just take a break".
  const k = target > value ? 0.006 : 0.0018;
  value += (target - value) * Math.min(1, k * dt);
  jolt = Math.max(0, jolt - dt / 620);

  const v = value * gain;
  const j = jolt * gain;

  // Colour: saturation and contrast climb, and everything gets a degree
  // hotter. It is not a red filter — it is the room becoming too much of
  // itself, which is closer to how people describe it.
  host.style.filter = v < 0.02 && j < 0.02 ? '' :
    `saturate(${(1 + v * 0.85 + j * 0.5).toFixed(3)}) ` +
    `contrast(${(1 + v * 0.42 + j * 0.35).toFixed(3)}) ` +
    `brightness(${(1 + v * 0.10 - j * 0.16).toFixed(3)})`;

  // Motion: a slow sway that becomes a tremor. Small numbers on purpose —
  // this should read as your own body, not as a camera effect.
  if (level === 'gentle') {
    host.style.transform = '';
  } else {
    const t = performance.now();
    const sway = Math.sin(t / 190) * v * 2.2 + Math.sin(t / 61) * v * v * 1.5;
    const rise = Math.cos(t / 143) * v * 1.6;
    const kick = j * 7 * Math.sin(t / 28);
    host.style.transform = (v < 0.02 && j < 0.02) ? ''
      : `translate3d(${(sway + kick).toFixed(2)}px, ${(rise - j * 3).toFixed(2)}px, 0)`;
  }

  // The vignette closes in. Tunnel vision is the single most consistently
  // reported thing and the cheapest to draw honestly.
  if (grade) {
    const close = 62 - v * 34;
    const dark = 0.26 + v * 0.44 + j * 0.14;
    grade.style.background =
      `radial-gradient(ellipse at 50% 44%, transparent ${close.toFixed(0)}%, ` +
      `rgba(46, 22, 10, ${dark.toFixed(3)}) 100%),` +
      `linear-gradient(rgba(255, 190, 120, ${(0.05 + v * 0.06).toFixed(3)}), ` +
      `rgba(30, 14, 8, ${(0.06 + v * 0.10).toFixed(3)}))`;
  }
}

/** How loud it currently is, for whatever else wants to follow it. */
export function intensity () { return value * LEVELS[level]; }
