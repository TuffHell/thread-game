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
  seat:    { label: 'Table', r: 34, cost: 0, movable: true }
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
    tray: spec.tray ?? []
  };
}

export const def = t => KINDS[t.kind];

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

/** Is there a clear line of sight, ignoring soft furnishing? */
export function seesThrough (r, ax, ay, bx, by) {
  for (const w of r.walls) {
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
