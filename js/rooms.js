/**
 * Rooms.
 *
 * Each starts genuinely unusable and can be made workable within budget. They
 * are furnished densely on purpose: a room with six objects in it reads as a
 * diagram, and a room with thirty reads as somewhere people go.
 */

import { room, wall, thing } from './room.js';

function box (w, h, material) {
  return [
    wall(0, 0, w, 0, material),
    wall(w, 0, w, h, material),
    wall(w, h, 0, h, material),
    wall(0, h, 0, 0, material)
  ];
}

/** Tables with chairs round them, the way a café actually is. */
function table (x, y, chairs = 2) {
  const out = [thing('seat', x, y)];
  for (let i = 0; i < chairs; i++) {
    const a = (i / chairs) * Math.PI * 2 + 0.5;
    out.push(thing('chair', x + Math.cos(a) * 58, y + Math.sin(a) * 58));
  }
  return out;
}

function cafe () {
  const w = 920, h = 700;
  const r = room({
    w, h,
    walls: [
      ...box(w, h, 'tile'),
      wall(560, 0, 560, 200, 'glass')
    ],
    door: { x: 70, y: 630 },
    goal: { x: 700, y: 130 },
    budget: 5,
    person: 'mara'
  });

  r.things = [
    thing('door', 70, 630, { movable: false }),
    thing('counter', 700, 130, { movable: false }),
    thing('window', 910, 320, { movable: false }),
    thing('window', 910, 520, { movable: false }),

    // The problem
    thing('grinder', 640, 220),
    thing('machine', 780, 165, { movable: false }),
    thing('speaker', 200, 90),
    thing('speaker', 830, 620),
    thing('fluorescent', 380, 240),
    thing('fluorescent', 380, 520),

    // Furniture and clutter. None of it is a puzzle piece; it is a café.
    ...table(230, 430, 2),
    ...table(430, 560, 3),
    ...table(250, 210, 2),
    ...table(600, 480, 2),
    thing('shelf', 40, 200, { movable: false }),
    thing('shelf', 40, 420, { movable: false }),
    thing('menu', 620, 40, { movable: false }),
    thing('bin', 120, 90),
    thing('pot', 880, 60),
    thing('pot', 100, 660),
    thing('pot', 500, 300)
  ];

  r.tray = ['panel', 'soft', 'rug', 'screen', 'booth', 'lamp'];
  return r;
}

function library () {
  const w = 860, h = 640;
  const r = room({
    w, h,
    walls: [
      ...box(w, h, 'plaster'),
      wall(0, 320, 380, 320, 'wood')
    ],
    door: { x: 60, y: 580 },
    goal: { x: 720, y: 120 },
    budget: 4,
    person: 'ollie'
  });

  r.things = [
    thing('door', 60, 580, { movable: false }),
    thing('counter', 720, 120, { movable: false }),
    thing('window', 850, 200, { movable: false }),

    // Ollie is undone by flicker and glare, so this room is a light problem.
    thing('fluorescent', 260, 160),
    thing('fluorescent', 560, 200),
    thing('fluorescent', 560, 480),
    thing('fluorescent', 260, 500),
    thing('speaker', 700, 560),

    ...table(200, 460, 2),
    ...table(430, 420, 2),
    ...table(640, 400, 3),
    thing('shelf', 40, 120, { movable: false }),
    thing('shelf', 190, 60, { movable: false }),
    thing('shelf', 340, 60, { movable: false }),
    thing('shelf', 820, 480, { movable: false }),
    thing('pot', 60, 620),
    thing('bin', 800, 600)
  ];

  r.tray = ['lamp', 'screen', 'booth', 'soft', 'panel', 'rug'];
  return r;
}

export const ROOMS = [
  {
    id: 'cafe',
    title: 'The Tuesday Café',
    line: 'Tiled, bright, and there is a grinder behind the counter.',
    build: cafe,
    person: 'mara'
  },
  {
    id: 'library',
    title: 'The Reading Room',
    line: 'Quiet enough. Lit like an operating theatre.',
    build: library,
    person: 'ollie'
  }
];
