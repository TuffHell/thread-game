/**
 * Rooms.
 *
 * Each one starts genuinely unusable and can be made workable within budget.
 * The first is a small tiled café, which is the most common bad room in the
 * world and the one everybody has stood in.
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

function cafe () {
  const w = 820, h = 620;
  const r = room({
    w, h,
    // Hard everywhere. This is why it is loud, and the player can see the
    // material on every wall before they work out why.
    walls: [
      ...box(w, h, 'tile'),
      wall(520, 0, 520, 190, 'glass')      // a half partition by the counter
    ],
    door: { x: 60, y: 560 },
    goal: { x: 640, y: 120 },
    budget: 4
  });

  r.things = [
    thing('door', 60, 560, { movable: false }),
    thing('counter', 640, 120, { movable: false }),
    thing('window', 810, 300, { movable: false }),

    // The problem, and all of it is movable except the machine.
    thing('grinder', 600, 200),
    thing('machine', 700, 150, { movable: false }),
    thing('speaker', 180, 90),
    thing('fluorescent', 400, 300),

    thing('seat', 220, 420),
    thing('seat', 400, 480)
  ];

  // What the player has to work with, and what each costs out of the budget.
  r.tray = ['panel', 'soft', 'rug', 'screen', 'booth', 'lamp'];
  return r;
}

export const ROOMS = [
  {
    id: 'cafe',
    title: 'The Tuesday Café',
    line: 'Tiled, bright, and there is a grinder behind the counter. ' +
          'Someone has to be able to order a coffee and sit down.',
    build: cafe
  }
];
