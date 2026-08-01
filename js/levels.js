/**
 * Levels.
 *
 * Each weave has its own coordinate space, roughly 1000 x 640. Descending
 * switches which weave the camera is fitted to, which is why the transition
 * can be a clean zoom rather than a scene change.
 */

import { node, strand, weave } from './weave.js';

/**
 * A bundle is what you find inside a strand: a fan of sub-strands running
 * between two anchors. It opens like a hand when you descend into it.
 */
function bundle (freqs, opts = {}) {
  const left = node(190, 320, 'anchor');
  const right = node(810, 320, 'anchor');
  const n = freqs.length;
  const spread = opts.spread ?? 0.30;

  const strands = freqs.map((spec, i) => {
    const f = typeof spec === 'number' ? spec : spec.freq;
    const locked = typeof spec === 'object' && spec.locked;
    const inner = typeof spec === 'object' ? spec.inner ?? null : null;
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    return strand(left.id, right.id, {
      freq: f,
      locked,
      inner,
      bow: t * spread
    });
  });

  return weave([left, right], strands);
}

/* ------------------------------------------------------------------ */

function levelFirstDescent () {
  const a = node(150, 320, 'source', 'source');
  const b = node(850, 320, 'bloom', 'bloom');

  const inner = bundle([0.235, 0.268]);

  return {
    weave: weave([a, b], [
      strand(a.id, b.id, { inner, bow: 0.08 })
    ], { source: a.id, bloom: b.id, seedFreq: 0.10 })
  };
}

function levelTwoHands () {
  const a = node(120, 320, 'source', 'source');
  const m = node(500, 210, 'plain');
  const b = node(880, 320, 'bloom', 'bloom');

  const one = bundle([0.185, 0.205, 0.160]);
  const two = bundle([0.470, 0.505]);

  return {
    weave: weave([a, m, b], [
      strand(a.id, m.id, { inner: one, bow: 0.12 }),
      strand(m.id, b.id, { inner: two, bow: -0.12 })
    ], { source: a.id, bloom: b.id, seedFreq: 0.08 })
  };
}

function levelAffinity () {
  const a = node(110, 330, 'source', 'source');
  const m1 = node(420, 170, 'plain');
  const m2 = node(430, 480, 'plain');
  const m3 = node(720, 320, 'plain');
  const b = node(910, 330, 'bloom', 'bloom');

  // The affinity strand is a dead end. It gives you nothing the puzzle needs,
  // and time spent inside it is what buys the tunes you do need.
  const deep = bundle([0.62, 0.655, 0.60, 0.638], { spread: 0.36 });

  const up = bundle([0.145, 0.170]);
  const across = bundle([{ freq: 0.31, locked: true }, 0.255, 0.28]);
  const down = bundle([0.44, 0.415]);

  return {
    weave: weave([a, m1, m2, m3, b], [
      strand(a.id, m1.id, { inner: up, bow: 0.14 }),
      strand(a.id, m2.id, { inner: deep, bow: -0.18, affinity: true }),
      strand(m1.id, m3.id, { inner: across, bow: 0.10 }),
      strand(m3.id, b.id, { inner: down, bow: -0.08 })
    ], { source: a.id, bloom: b.id, seedFreq: 0.09 })
  };
}

function levelOpenAir () {
  const a = node(120, 200, 'source', 'source');
  const m1 = node(430, 380, 'plain');
  const m2 = node(690, 180, 'plain');
  const b = node(900, 420, 'bloom', 'bloom');

  const one = bundle([0.215, 0.240, 0.190]);
  const two = bundle([{ freq: 0.44, locked: true }, 0.365, 0.40]);
  const three = bundle([0.585, 0.560]);

  return {
    interrupted: true,
    weave: weave([a, m1, m2, b], [
      strand(a.id, m1.id, { inner: one, bow: -0.14 }),
      strand(m1.id, m2.id, { inner: two, bow: 0.16 }),
      strand(m2.id, b.id, { inner: three, bow: -0.10 })
    ], { source: a.id, bloom: b.id, seedFreq: 0.10 })
  };
}

function levelDeeper () {
  const a = node(120, 340, 'source', 'source');
  const m = node(520, 200, 'plain');
  const b = node(900, 360, 'bloom', 'bloom');

  // A strand inside a strand. Everything beside the nested bundle is bound,
  // so there is no way to move this from one level down. You have to go two.
  const nested = bundle([0.300, 0.270]);
  const one = bundle([{ freq: 0.260, locked: true }, { freq: 0, inner: nested }],
    { spread: 0.30 });
  const two = bundle([0.320, 0.345]);

  return {
    weave: weave([a, m, b], [
      strand(a.id, m.id, { inner: one, bow: 0.12 }),
      strand(m.id, b.id, { inner: two, bow: -0.14 })
    ], { source: a.id, bloom: b.id, seedFreq: 0.11 })
  };
}

function levelLongWeave () {
  const a = node(100, 350, 'source', 'source');
  const m1 = node(360, 170, 'plain');
  const m2 = node(380, 520, 'plain');   // dead end, and the best place here
  const m3 = node(660, 330, 'plain');
  const m4 = node(830, 160, 'plain');
  const b = node(950, 400, 'bloom', 'bloom');

  // Four hops, each a small step around the wheel, so no single fix breaks
  // the hop before it. One nested bundle forces a second descent.
  const deep = bundle([0.800, 0.830, 0.780, 0.850, 0.815], { spread: 0.40 });
  const nested = bundle([0.615, 0.585]);

  const s1 = bundle([0.290, 0.315, 0.270]);
  const s2 = bundle([{ freq: 0.300, locked: true }, 0.380]);
  const s3 = bundle([{ freq: 0.280, locked: true }, { freq: 0, inner: nested }],
    { spread: 0.30 });
  const s4 = bundle([{ freq: 0.520, locked: true }, 0.560, 0.500]);

  return {
    interrupted: true,
    weave: weave([a, m1, m2, m3, m4, b], [
      strand(a.id, m1.id, { inner: s1, bow: 0.13 }),
      strand(a.id, m2.id, { inner: deep, bow: -0.20, affinity: true }),
      strand(m1.id, m3.id, { inner: s2, bow: 0.08 }),
      strand(m3.id, m4.id, { inner: s3, bow: 0.14 }),
      strand(m4.id, b.id, { inner: s4, bow: -0.10 })
    ], { source: a.id, bloom: b.id, seedFreq: 0.10 })
  };
}

export const LEVELS = [
  {
    id: 'first-descent',
    title: 'First Descent',
    line: 'A strand is not one thing. Hold it and see.',
    build: levelFirstDescent
  },
  {
    id: 'two-hands',
    title: 'Two Hands',
    line: 'Coming up is free. Going back down is not.',
    build: levelTwoHands
  },
  {
    id: 'affinity',
    title: 'The One You Like',
    line: 'One strand here is yours. It is not on the way anywhere.',
    build: levelAffinity
  },
  {
    id: 'open-air',
    title: 'Open Air',
    line: 'The same work, somewhere that keeps asking for you.',
    build: levelOpenAir
  },
  {
    id: 'deeper',
    title: 'Deeper',
    line: 'Some things are held inside things that are held inside things.',
    build: levelDeeper
  },
  {
    id: 'long-weave',
    title: 'The Long Weave',
    line: 'Everything you know, and a room that will not be quiet.',
    build: levelLongWeave
  }
];
