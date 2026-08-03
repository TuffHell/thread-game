/**
 * Rooms and the things in them.
 *
 * Everything is in centimetres, because the whole point of this game is that
 * the spaces are real ones and a team that can measure a café should not have
 * to translate. A typical small café here is about 800 x 600.
 */

export const MATERIALS = {
  // absorption: how much sound a wall of this stuff swallows on the way past
  // reflect: how much it throws back into the room
  tile:     { label: 'tile',     absorption: 0.08, reflect: 0.92 },
  glass:    { label: 'glass',    absorption: 0.05, reflect: 0.95 },
  brick:    { label: 'brick',    absorption: 0.22, reflect: 0.70 },
  plaster:  { label: 'plaster',  absorption: 0.28, reflect: 0.62 },
  wood:     { label: 'wood',     absorption: 0.40, reflect: 0.48 },
  acoustic: { label: 'acoustic', absorption: 0.85, reflect: 0.10 }
};

/**
 * What you can put in a room.
 *
 * emits: adds to a field. absorbs: subtracts from one nearby.
 * Anything with both is a real object doing two things at once, which is
 * where most of the interesting decisions come from.
 */
export const KINDS = {
  grinder: {
    label: 'Coffee grinder', r: 22, cost: 0, fixedish: true,
    emits: { sound: 1.0 }, radius: { sound: 420 }
  },
  machine: {
    label: 'Espresso machine', r: 30, cost: 0,
    emits: { sound: 0.55 }, radius: { sound: 300 }
  },
  speaker: {
    label: 'Speaker', r: 14, cost: 0,
    emits: { sound: 0.62 }, radius: { sound: 500 }
  },
  fluorescent: {
    label: 'Fluorescent panel', r: 26, cost: 0,
    emits: { light: 0.75, flicker: 0.9 }, radius: { light: 340, flicker: 300 }
  },
  lamp: {
    label: 'Warm lamp', r: 16, cost: 1,
    emits: { light: 0.34 }, radius: { light: 240 }
  },
  window: {
    label: 'Window', r: 40, cost: 0, movable: false,
    emits: { light: 0.8, glare: 0.7 }, radius: { light: 460, glare: 300 }
  },

  // The tools you are given
  soft: {
    label: 'Soft seating', r: 40, cost: 1,
    absorbs: { sound: 0.42 }, radius: { sound: 250 }
  },
  rug: {
    label: 'Rug', r: 55, cost: 1,
    absorbs: { sound: 0.30 }, radius: { sound: 220 }
  },
  panel: {
    label: 'Acoustic panel', r: 30, cost: 1,
    absorbs: { sound: 0.66 }, radius: { sound: 300 },
    emits: { clutter: 0.25 }, clutterRadius: 220
  },
  screen: {
    label: 'Plant screen', r: 34, cost: 1,
    absorbs: { crowd: 0.45, glare: 0.35 }, radius: { crowd: 220, glare: 220 },
    emits: { clutter: 0.35 }, clutterRadius: 260, blocksSight: true
  },
  booth: {
    label: 'Quiet corner', r: 60, cost: 2,
    refuge: true, absorbs: { sound: 0.35, crowd: 0.5 }, radius: { sound: 200, crowd: 240 }
  },
  rope: {
    label: 'Queue rope', r: 18, cost: 1,
    emits: { crowd: 0.5 }, radius: { crowd: 200 }, shapesQueue: true
  },

  // Fixed features
  door:    { label: 'Door', r: 36, cost: 0, movable: false, emits: { crowd: 0.45 }, radius: { crowd: 260 } },
  counter: { label: 'Counter', r: 70, cost: 0, movable: false, emits: { crowd: 0.6 }, radius: { crowd: 300 } },
  seat:    { label: 'Table', r: 34, cost: 0, movable: true },

  // Furnishing. Mostly there so the room reads as a place rather than a
  // diagram, but it is not free: chairs and clutter are things to squeeze
  // past and things to look at.
  chair:   { label: 'Chair', r: 20, cost: 0, emits: { crowd: 0.12, clutter: 0.10 }, radius: { crowd: 90, clutter: 110 } },
  shelf:   { label: 'Shelving', r: 44, cost: 0, movable: false, blocksSight: true,
             emits: { clutter: 0.42 }, clutterRadius: 240, absorbs: { sound: 0.22 }, radius: { sound: 200 } },
  menu:    { label: 'Menu board', r: 34, cost: 0, movable: false, emits: { clutter: 0.34 }, clutterRadius: 220 },
  bin:     { label: 'Bin', r: 20, cost: 0, emits: { smell: 0.4, clutter: 0.12 }, radius: { smell: 200 }, clutterRadius: 120 },
  pot:     { label: 'Plant', r: 24, cost: 0, absorbs: { sound: 0.12, glare: 0.15 }, radius: { sound: 140, glare: 150 } },

  // A person waiting for their coffee. Present only during service, added to
  // and removed from the room by service.js, so their noise and their bodies
  // go through exactly the same field and collision machinery as the
  // furniture. Serving someone genuinely makes the room quieter.
  customer: { label: 'Customer', r: 26, cost: 0, movable: false, solidR: 24,
              emits: { crowd: 0.34, sound: 0.16 },
              radius: { crowd: 190, sound: 200 } },

  // A used cup on a table, left behind when somebody finishes and goes.
  // It is clutter until you clear it, which is why the round is not over
  // when the last coffee is handed across.
  mess: { label: 'Used cup', r: 20, cost: 0, movable: false,
          emits: { clutter: 0.18 }, clutterRadius: 130 },

  // A fitted cover for a fluorescent tube. The real object exists, is cheap,
  // and is one of the first things sensory-friendly refits actually do:
  // it kills the flicker and softens the light without rewiring anything.
  diffuser: { label: 'Tube diffuser', r: 26, cost: 1,
              absorbs: { flicker: 0.72, light: 0.38 },
              radius: { flicker: 300, light: 260 } },

  // The waiting-room television, a famous real-world offender: sound you did
  // not choose, flicker you cannot look away from, and nobody in the room has
  // the remote.
  tv:      { label: 'Wall TV', r: 30, cost: 0, movable: false,
             emits: { sound: 0.42, flicker: 0.6, light: 0.2 },
             radius: { sound: 330, flicker: 290, light: 200 } }
};

let uid = 0;

export function thing (kind, x, y, opts = {}) {
  const def = KINDS[kind];
  if (!def) throw new Error(`unknown kind: ${kind}`);
  return {
    id: `o${++uid}`,
    kind, x, y,
    movable: opts.movable ?? def.movable ?? true,
    placed: opts.placed ?? true
  };
}

export function wall (x1, y1, x2, y2, material = 'plaster') {
  return { x1, y1, x2, y2, material };
}

export function room (spec) {
  return {
    w: spec.w,
    h: spec.h,
    walls: spec.walls ?? [],
    things: spec.things ?? [],
    door: spec.door,
    goal: spec.goal,
    // What the player may spend on changes. Real budgets are the reason
    // accessibility work does not happen, so it is a resource here too.
    budget: spec.budget ?? 4,
    tray: spec.tray ?? [],
    // Which painted view hangs outside the windows.
    outside: spec.outside ?? 'street'
  };
}

export const def = t => KINDS[t.kind];

/**
 * How high the top of a thing is, if you can put something on it.
 *
 * Only a few things are surfaces, and their heights are the ones the 3D
 * models are actually built to.
 */
export const SURFACE_TOP = {
  counter: 105,
  seat: 74,      // a café table
  shelf: 190
};

/**
 * What a thing at (x, y) would be standing on.
 *
 * The espresso machine used to be drawn at counter height whatever was
 * underneath it, so dragging it off the counter left it hanging in the air
 * at chest height with nothing below — which is exactly the thing that makes
 * a room read as a diagram rather than a place. Now everything asks the room
 * what it is resting on, and if the answer is nothing it rests on the floor.
 */
export function supportUnder (r, x, y, ignore = null) {
  let top = 0, on = null;
  for (const t of r.things) {
    if (!t.placed || t === ignore || t.id === ignore) continue;
    const h = SURFACE_TOP[t.kind];
    if (h == null || h <= top) continue;
    const D = KINDS[t.kind];
    // The footprint has to match the model, or things sit on air just past
    // the end of a bar. A counter is drawn 2r wide by 1.25r deep; a table is
    // round. A little slack either way, because fighting the player over
    // four centimetres is not a game.
    const halfW = (t.kind === 'counter' ? D.r : D.r * 0.8) + 8;
    const halfD = (t.kind === 'counter' ? D.r * 0.625 : D.r * 0.8) + 8;
    if (Math.abs(x - t.x) > halfW || Math.abs(y - t.y) > halfD) continue;
    top = h; on = t;
  }
  return { top, on };
}

/**
 * Push a set of points apart until nobody is standing inside anybody.
 *
 * Waiting spots are picked from furniture positions, and when two orders land
 * on the same chair the two people occupy the same cubic metre — which looked
 * exactly as bad as it sounds once they had faces. A few rounds of relaxation
 * is all it takes, and it keeps them near where they were meant to be rather
 * than scattering them.
 */
export function spreadOut (items, minGap = 62, bounds = null, rounds = 14) {
  for (let n = 0; n < rounds; n++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minGap) continue;
        // Exactly coincident: nudge them apart along a fixed diagonal first.
        if (d < 1e-3) { dx = 1; dy = 0.6; d = Math.hypot(dx, dy); }
        const push = (minGap - d) / 2 / d;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
        moved = true;
      }
    }
    if (bounds) {
      for (const t of items) {
        t.x = Math.max(bounds.pad, Math.min(bounds.w - bounds.pad, t.x));
        t.y = Math.max(bounds.pad, Math.min(bounds.h - bounds.pad, t.y));
      }
    }
    if (!moved) break;
  }
  return items;
}

/** Things that belong on a worktop rather than on the floor. */
export const COUNTERTOP = new Set(['machine', 'grinder']);

export function refuges (r) {
  return r.things.filter(t => t.placed && def(t).refuge);
}

/** What the player has spent out of the budget. */
export function spent (r) {
  return r.things
    .filter(t => t.placed && t.fromTray)
    .reduce((n, t) => n + (def(t).cost ?? 0), 0);
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/** Does segment AB cross segment CD? */
export function segmentsCross (ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * How much of a straight line from A to B survives the walls in the way.
 * Returns a multiplier from 0 to 1.
 */
export function transmission (r, ax, ay, bx, by) {
  let m = 1;
  for (const w of r.walls) {
    if (segmentsCross(ax, ay, bx, by, w.x1, w.y1, w.x2, w.y2)) {
      m *= 1 - (MATERIALS[w.material]?.absorption ?? 0.3);
    }
  }
  return m;
}

/** Is there a clear line of sight? Glass is a wall you can see through. */
export function seesThrough (r, ax, ay, bx, by) {
  for (const w of r.walls) {
    if (w.material === 'glass') continue;
    if (segmentsCross(ax, ay, bx, by, w.x1, w.y1, w.x2, w.y2)) return false;
  }
  for (const t of r.things) {
    if (!t.placed || !def(t).blocksSight) continue;
    const d = pointToSegment(t.x, t.y, ax, ay, bx, by);
    if (d < def(t).r) return false;
  }
  return true;
}

export function pointToSegment (px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const L = vx * vx + vy * vy;
  let t = L ? ((px - ax) * vx + (py - ay) * vy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/* ------------------------------------------------------------------ */
/* Owner constraints                                                   */
/* ------------------------------------------------------------------ */

/**
 * The owner's rules. They are what stop every room having the same answer:
 * without them the winning move is always "put the loud thing in a far
 * corner", and with them you have to solve the problem where it stands.
 *
 * Two primitive types carry all of it:
 *   near      thing A stays within d of thing B (workflow, plumbing, wiring)
 *   sightline point A must see point B (the menu, the noticeboard, the till)
 *
 * Returns the list of broken rules, each with the owner's wording.
 */
export function checkConstraints (r, constraints = []) {
  const broken = [];
  const find = k => r.things.find(t => t.placed && t.kind === k);

  for (const c of constraints) {
    if (c.type === 'near') {
      const a = find(c.a), b = find(c.b);
      if (!a || !b) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) > c.d) broken.push(c);
    } else if (c.type === 'sightline') {
      const a = find(c.a), b = find(c.b);
      if (!a || !b) continue;
      if (!seesThrough(r, a.x, a.y, b.x, b.y)) broken.push(c);
    }
  }
  return broken;
}

/** Nearest point on any wall, used for the reverb term. */
export function hardSurfaceNear (r, x, y, radius = 200) {
  let amount = 0;
  for (const w of r.walls) {
    const d = pointToSegment(x, y, w.x1, w.y1, w.x2, w.y2);
    if (d > radius) continue;
    const m = MATERIALS[w.material] ?? MATERIALS.plaster;
    amount += m.reflect * (1 - d / radius);
  }
  for (const t of r.things) {
    if (!t.placed) continue;
    const a = def(t).absorbs?.sound;
    if (!a) continue;
    const d = Math.hypot(x - t.x, y - t.y);
    const rad = def(t).radius?.sound ?? 200;
    if (d < rad) amount -= a * (1 - d / rad) * 1.6;
  }
  return Math.max(0, amount);
}
