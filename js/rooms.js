/**
 * Rooms.
 *
 * Four buildings, referenced by the campaign. Each is furnished densely on
 * purpose: a room with six objects reads as a diagram, a room with thirty
 * reads as somewhere people go. Several commissions reuse a building with
 * different people and different owner rules, because "the same café, but for
 * two people at once" is a genuinely different puzzle and much cheaper than a
 * new room.
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

/** A table with chairs round it, the way a real one is. */
function table (x, y, chairs = 2) {
  const out = [thing('seat', x, y)];
  for (let i = 0; i < chairs; i++) {
    const a = (i / chairs) * Math.PI * 2 + 0.5;
    out.push(thing('chair', x + Math.cos(a) * 58, y + Math.sin(a) * 58));
  }
  return out;
}

/* ------------------------------------------------------------------ */

function cafe () {
  const w = 920, h = 700;
  const r = room({
    w, h,
    walls: [...box(w, h, 'tile'), wall(560, 0, 560, 200, 'glass')],
    door: { x: 70, y: 630 },
    goal: { x: 700, y: 130 },
    budget: 5
  });

  r.things = [
    thing('door', 70, 630, { movable: false }),
    thing('counter', 700, 130, { movable: false }),
    thing('window', 910, 320, { movable: false }),
    thing('window', 910, 520, { movable: false }),

    thing('grinder', 640, 220),
    thing('machine', 780, 165, { movable: false }),
    thing('speaker', 200, 90),
    thing('speaker', 830, 620),
    thing('fluorescent', 380, 240),
    thing('fluorescent', 380, 520),

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
    walls: [...box(w, h, 'plaster'), wall(0, 320, 380, 320, 'wood')],
    door: { x: 60, y: 580 },
    goal: { x: 720, y: 120 },
    budget: 4
  });

  r.things = [
    thing('door', 60, 580, { movable: false }),
    thing('counter', 720, 120, { movable: false }),
    thing('window', 850, 200, { movable: false }),

    thing('fluorescent', 260, 160),
    thing('fluorescent', 560, 200),
    thing('fluorescent', 300, 480),
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

  r.tray = ['diffuser', 'lamp', 'screen', 'booth', 'soft', 'panel'];
  return r;
}

/**
 * The clinic waiting room. The one you cannot choose to skip.
 *
 * The refuge already exists here, badly placed, so the puzzle is crowd and
 * the television rather than buying a quiet corner: chairs are movable, the
 * TV is bolted to the wall, and the receptionist does not have the remote.
 */
function clinic () {
  const w = 780, h = 580;
  const r = room({
    w, h,
    walls: [...box(w, h, 'plaster'), wall(520, 580, 520, 420, 'glass')],
    door: { x: 70, y: 510 },
    goal: { x: 650, y: 110 },
    budget: 4
  });

  const chairs = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      chairs.push(thing('chair', 250 + i * 70, 260 + j * 70));
    }
  }

  r.things = [
    thing('door', 70, 510, { movable: false }),
    thing('counter', 650, 110, { movable: false }),
    thing('window', 770, 300, { movable: false }),

    thing('tv', 390, 40, { movable: false }),
    thing('fluorescent', 250, 180),
    thing('fluorescent', 550, 340),

    ...chairs,
    thing('seat', 640, 470),
    thing('booth', 690, 520),           // free, pre-placed, in the wrong spot
    thing('shelf', 40, 150, { movable: false }),
    thing('menu', 560, 40, { movable: false }),
    thing('bin', 730, 550),
    thing('pot', 60, 60),
    thing('pot', 720, 60)
  ];

  r.tray = ['screen', 'panel', 'soft', 'rug', 'lamp'];
  return r;
}

/** The community hall. Big, brick, echoing, and booked for a coffee morning. */
function hall () {
  const w = 1040, h = 720;
  const r = room({
    w, h,
    walls: [...box(w, h, 'brick'), wall(1040, 200, 1040, 520, 'glass')],
    door: { x: 80, y: 650 },
    goal: { x: 880, y: 140 },
    budget: 6
  });

  r.things = [
    thing('door', 80, 650, { movable: false }),
    thing('counter', 880, 140, { movable: false }),
    thing('machine', 970, 190, { movable: false }),
    thing('window', 1030, 360, { movable: false }),

    thing('speaker', 160, 100),
    thing('speaker', 900, 660),
    thing('fluorescent', 350, 250),
    thing('fluorescent', 700, 250),
    thing('fluorescent', 350, 520),
    thing('fluorescent', 700, 520),

    ...table(280, 420, 3),
    ...table(520, 560, 3),
    ...table(500, 330, 2),
    ...table(750, 460, 3),
    ...table(240, 200, 2),
    thing('menu', 950, 40, { movable: false }),
    thing('shelf', 40, 300, { movable: false }),
    thing('bin', 140, 680),
    thing('pot', 1000, 620),
    thing('pot', 60, 60),
    thing('pot', 540, 60)
  ];

  r.tray = ['panel', 'diffuser', 'screen', 'booth', 'soft', 'rug', 'lamp'];
  return r;
}

export const BUILDERS = { cafe, library, clinic, hall };
