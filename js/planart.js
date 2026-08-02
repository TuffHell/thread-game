/**
 * The plan, drawn as pixel art.
 *
 * The survey used to be circles and dashed outlines on a dark field — honest
 * about the simulation and completely charmless, and it did not look like it
 * belonged in the same game as the room you walk around in. This draws the
 * same information as a small top-down scene: a tiled floor, furniture with
 * actual shapes, and the load field as chunky cells rather than a blur.
 *
 * Everything is drawn into a low-resolution buffer and blown up with nearest
 * neighbour, exactly like the 3D view. That is what makes it pixel art rather
 * than a smooth drawing with a filter over it: a table is eleven pixels
 * across and every one of them is a decision.
 *
 * Sprites are authored as grids of cells rather than fixed bitmaps, so they
 * stay crisp at any window size — a cell is drawn as a rectangle in buffer
 * space and the whole buffer is scaled by a whole number afterwards.
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

// Deliberately the same colours as the 3D room. Two views of one building
// should not look like two games.
const P = {
  '.': null,
  K: '#2f2119',   // outline
  w: '#6f4a2c',   // wood, shadow
  W: '#8a5a34',   // wood
  L: '#b07a45',   // wood, lit
  m: '#7d8a93',   // metal, shadow
  M: '#b9c3ca',   // metal
  c: '#e8dfc9',   // cream
  r: '#c05a4a',   // cloth
  g: '#3f7038',   // leaf, shadow
  G: '#5f9c4e',   // leaf
  f: '#7d9b84',   // felt, shadow
  F: '#96b39c',   // felt
  t: '#4fa895',   // teal, shadow
  T: '#6fc0ad',   // teal
  y: '#e0a24a',   // warm, shadow
  Y: '#ffc46b',   // warm
  s: '#e0a878',   // skin
  b: '#3f5a75',   // coat, shadow
  B: '#4f6d8a',   // coat
  h: '#2b2320',   // hair
  x: '#9aa3a8',   // glass, shadow
  X: '#cfe0e6'    // glass
};

const FLOOR = {
  a: '#c9a179',
  b: '#d3ad84',
  grout: '#b08d68'
};

const WALL = {
  face: '#e0d7c2',
  edge: '#8d7c62',
  glass: '#a8d2dd'
};

/* ------------------------------------------------------------------ */
/* Sprites                                                             */
/* ------------------------------------------------------------------ */

/*
 * Read top-down. Each string is a row, each character a cell, and the sprite
 * is stretched to the object's real footprint — so a 140cm counter and a
 * 40cm chair are drawn from grids of the same kind but land at very
 * different sizes, which is the whole point of a plan.
 */
const S = {
  seat: [
    '....KKKK....',
    '..KKLLLLKK..',
    '.KLLLLLLLLK.',
    'KLLLLLLLLLLK',
    'KLLLLWWLLLLK',
    'KLLLWWWWLLLK',
    'KLLLWWWWLLLK',
    'KLLLLWWLLLLK',
    'KLLLLLLLLLLK',
    '.KLLLLLLLLK.',
    '..KKLLLLKK..',
    '....KKKK....'
  ],

  chair: [
    '.KKKKKK.',
    '.KwwwwK.',
    '.KKKKKK.',
    '.KLLLLK.',
    '.KLLLLK.',
    '.KLLLLK.',
    '.KLLLLK.',
    '.KKKKKK.'
  ],

  counter: [
    'KKKKKKKKKKKKKKKKKKKK',
    'KwwwwwwwwwwwwwwwwwwK',
    'KwLLLLLLLLLLLLLLLLwK',
    'KwLccLLLLLLLLLLccLwK',
    'KwLccLLLLLLLLLLccLwK',
    'KwLLLLLLLLLLLLLLLLwK',
    'KwLLLLLLLLLLLLLLLLwK',
    'KwLLLLKMMMMMMKLLLLwK',
    'KwLLLLKMMMMMMKLLLLwK',
    'KwLLLLLLLLLLLLLLLLwK',
    'KwwwwwwwwwwwwwwwwwwK',
    'KKKKKKKKKKKKKKKKKKKK'
  ],

  machine: [
    'KKKKKKKKKKKK',
    'KMMMMMMMMMMK',
    'KMmmmmmmmmMK',
    'KMmMMMMMMmMK',
    'KMmMKKKKMmMK',
    'KMmMMMMMMmMK',
    'KMmmmmmmmmMK',
    'KMMMMMMMMMMK',
    'KMcccccccMMK',
    'KKKKKKKKKKKK'
  ],

  grinder: [
    '.KKKKKK.',
    '.KmmmmK.',
    '.KmMMmK.',
    '.KmMMmK.',
    '.KmmmmK.',
    '.KMMMMK.',
    '.KMKKMK.',
    '.KMMMMK.',
    '.KmmmmK.',
    '.KKKKKK.'
  ],

  speaker: [
    'KKKKKK',
    'KhhhhK',
    'KhKKhK',
    'KhKKhK',
    'KhhhhK',
    'KhKKhK',
    'KhhhhK',
    'KKKKKK'
  ],

  fluorescent: [
    'KKKKKKKKKKKKKK',
    'KXXXXXXXXXXXXK',
    'KXccccccccccXK',
    'KXccccccccccXK',
    'KXXXXXXXXXXXXK',
    'KKKKKKKKKKKKKK'
  ],

  diffuser: [
    'KKKKKKKKKKKKKK',
    'KYYYYYYYYYYYYK',
    'KYccccccccccYK',
    'KYccccccccccYK',
    'KYYYYYYYYYYYYK',
    'KKKKKKKKKKKKKK'
  ],

  lamp: [
    '...KK...',
    '..KYYK..',
    '.KYYYYK.',
    'KYYYYYYK',
    'KYYYYYYK',
    '.KYYYYK.',
    '..KYYK..',
    '...KK...'
  ],

  window: [
    'KKKKKKKKKKKKKKKK',
    'KWWWWWWWWWWWWWWK',
    'KWXXXXXKXXXXXXWK',
    'KWXXXXXKXXXXXXWK',
    'KWWWWWWWWWWWWWWK',
    'KKKKKKKKKKKKKKKK'
  ],

  door: [
    'KKKKKKKKKKKK',
    'KWWWWWWWWWWK',
    'KWXXXXXXXXWK',
    'KWXXXXXXXXWK',
    'KWWWWWWWWWWK',
    'KKKKKKKKKKKK'
  ],

  soft: [
    'KKKKKKKKKKKKKK',
    'KWWWWWWWWWWWWK',
    'KWrrrrrrrrrrWK',
    'KWrrrrrrrrrrWK',
    'KWrrrrrrrrrrWK',
    'KWrrrrrrrrrrWK',
    'KWrrrrrrrrrrWK',
    'KWWWWWWWWWWWWK',
    'KKKKKKKKKKKKKK'
  ],

  rug: [
    '....KKKKKKKK....',
    '..KKttttttttKK..',
    '.KttTTTTTTTTttK.',
    'KttTTTTTTTTTTttK',
    'KtTTTTttttTTTTtK',
    'KtTTTtttttttTTtK',
    'KtTTTtttttttTTtK',
    'KtTTTTttttTTTTtK',
    'KttTTTTTTTTTTttK',
    '.KttTTTTTTTTttK.',
    '..KKttttttttKK..',
    '....KKKKKKKK....'
  ],

  panel: [
    'KKKKKKKKKKKK',
    'KffffffffffK',
    'KfFfFfFfFfFK',
    'KfFfFfFfFfFK',
    'KfFfFfFfFfFK',
    'KfFfFfFfFfFK',
    'KffffffffffK',
    'KKKKKKKKKKKK'
  ],

  screen: [
    'KKKKKKKKKKKKKK',
    'KwwwwwwwwwwwwK',
    'KwGgGgGgGgGgwK',
    'KwgGgGgGgGgGwK',
    'KwGgGgGgGgGgwK',
    'KwgGgGgGgGgGwK',
    'KwwwwwwwwwwwwK',
    'KKKKKKKKKKKKKK'
  ],

  booth: [
    'KKKKKKKKKKKKKKKKKK',
    'KttttttttttttttttK',
    'KtTTTTTTTTTTTTTTtK',
    'KtTKKKKKKKKKKKKTtK',
    'KtTKWWWWWWWWWWKTtK',
    'KtTKWLLLLLLLLWKTtK',
    'KtTKWLLLLLLLLWKTtK',
    'KtTKWLLLLLLLLWKTtK',
    'KtTKWLLLLLLLLWKTtK',
    'KtTKWWWWWWWWWWKTtK',
    'KtTKKKKKKKKKKKKTtK',
    'KtTTTTTTTTTTTTTTtK',
    'KttttttttttttttttK',
    'KKKKKKKKKKKKKKKKKK'
  ],

  rope: [
    '..KKKKKK..',
    '.KMMMMMMK.',
    '.KMrrrrMK.',
    '.KMrrrrMK.',
    '.KMMMMMMK.',
    '...KmmK...',
    '...KmmK...',
    '..KmmmmK..',
    '.KmmmmmmK.',
    '..KKKKKK..'
  ],

  shelf: [
    'KKKKKKKKKKKKKKKK',
    'KwwwwwwwwwwwwwwK',
    'KwLrLGLcLrLGLcwK',
    'KwwwwwwwwwwwwwwK',
    'KwLcLrLGLcLrLGwK',
    'KwwwwwwwwwwwwwwK',
    'KwLGLcLrLGLcLrwK',
    'KKKKKKKKKKKKKKKK'
  ],

  menu: [
    'KKKKKKKKKKKKKK',
    'KwwwwwwwwwwwwK',
    'KwKKKKKKKKKKwK',
    'KwKccKccKccKwK',
    'KwKKKKKKKKKKwK',
    'KKKKKKKKKKKKKK'
  ],

  bin: [
    '.KKKKKK.',
    '.KmmmmK.',
    'KKKKKKKK',
    '.KMMMMK.',
    '.KMMMMK.',
    '.KMMMMK.',
    '.KMMMMK.',
    '.KKKKKK.'
  ],

  pot: [
    '...KKKK...',
    '..KGGGGK..',
    '.KGgGGgGK.',
    'KGGgGGgGGK',
    'KGgGGGGgGK',
    '.KGGgGgGK.',
    '..KGGGGK..',
    '...KwwK...',
    '..KWWWWK..',
    '..KKKKKK..'
  ],

  mess: [
    '..KKKK..',
    '.KccccK.',
    'KcXXXXcK',
    'KcXwwXcK',
    'KcXwwXcK',
    'KcXXXXcK',
    '.KccccK.',
    '..KKKK..'
  ],

  customer: [
    '..KKKKKK..',
    '.KBBBBBBK.',
    'KBBBBBBBBK',
    'KBBhhhhBBK',
    'KBhhhhhhBK',
    'KBhhsshhBK',
    'KBhhhhhhBK',
    'KBBhhhhBBK',
    '.KBBBBBBK.',
    '..KKKKKK..'
  ]
};

// Anything without a drawing of its own still gets a shape rather than a
// hole. Better a plain crate than an invisible object you cannot grab.
const FALLBACK = [
  'KKKKKKKK',
  'KWWWWWWK',
  'KWLLLLWK',
  'KWLLLLWK',
  'KWLLLLWK',
  'KWLLLLWK',
  'KWWWWWWK',
  'KKKKKKKK'
];

export const spriteFor = kind => S[kind] ?? FALLBACK;

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Paint one sprite so that its grid fills the box (x, y, w, h).
 *
 * Cells are rounded outward to whole buffer pixels and drawn edge to edge, so
 * there are no seams and no half-transparent borders — the two things that
 * make scaled pixel art look like scaled pixel art.
 */
export function blitSprite (ctx, rows, x, y, w, h, tint = null) {
  const cols = rows[0].length;
  const cw = w / cols, ch = h / rows.length;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const y0 = Math.round(y + r * ch);
    const y1 = Math.round(y + (r + 1) * ch);
    if (y1 <= y0) continue;
    for (let c = 0; c < cols; c++) {
      const colour = P[row[c]];
      if (!colour) continue;
      const x0 = Math.round(x + c * cw);
      const x1 = Math.round(x + (c + 1) * cw);
      if (x1 <= x0) continue;
      ctx.fillStyle = tint ?? colour;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

/** A soft blob under a thing, so it sits on the floor instead of hovering. */
export function shadowUnder (ctx, cx, cy, w, h) {
  ctx.fillStyle = 'rgba(60, 40, 24, 0.22)';
  const rw = Math.max(2, Math.round(w * 0.46));
  const rh = Math.max(1, Math.round(h * 0.24));
  // Drawn as three stacked bars rather than an ellipse: an antialiased curve
  // at this resolution turns into grey fringing on the upscale.
  ctx.fillRect(Math.round(cx - rw), Math.round(cy + h * 0.30), rw * 2, rh);
  ctx.fillRect(Math.round(cx - rw * 0.72), Math.round(cy + h * 0.30 - rh), rw * 1.44, rh);
  ctx.fillRect(Math.round(cx - rw * 0.72), Math.round(cy + h * 0.30 + rh), rw * 1.44, rh);
}

/** Boards, laid along the room's long axis, with a grout line between. */
export function drawFloor (ctx, x0, y0, w, h, cell) {
  ctx.fillStyle = FLOOR.a;
  ctx.fillRect(x0, y0, w, h);

  const step = Math.max(3, Math.round(cell));
  for (let ty = 0; ty * step < h; ty++) {
    for (let tx = 0; tx * step < w; tx++) {
      if ((tx + ty) % 2 !== 0) continue;
      ctx.fillStyle = FLOOR.b;
      ctx.fillRect(
        x0 + tx * step, y0 + ty * step,
        Math.min(step, w - tx * step), Math.min(step, h - ty * step)
      );
    }
  }
  // Grout, one pixel, only every other line so it reads as a floor and not
  // as graph paper.
  ctx.fillStyle = FLOOR.grout;
  for (let ty = 0; ty * step < h; ty += 2) ctx.fillRect(x0, y0 + ty * step, w, 1);
  for (let tx = 0; tx * step < w; tx += 2) ctx.fillRect(x0 + tx * step, y0, 1, h);
}

/** Walls as solid masonry with a lit inner edge. */
export function drawWallsPixel (ctx, room, toBuf, thick) {
  for (const w of room.walls) {
    const a = toBuf(w.x1, w.y1), b = toBuf(w.x2, w.y2);
    const glass = w.material === 'glass';
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    // Axis-aligned in every room so far; a rotated wall still gets a correct
    // box, just without the mitred corner.
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const t = Math.max(2, Math.round(thick));
    const x = Math.round(Math.min(a.x, b.x)) - (horizontal ? 0 : t / 2);
    const y = Math.round(Math.min(a.y, b.y)) - (horizontal ? t / 2 : 0);
    const ww = horizontal ? Math.round(len) : t;
    const hh = horizontal ? t : Math.round(len);

    ctx.fillStyle = WALL.edge;
    ctx.fillRect(x, y, ww, hh);
    ctx.fillStyle = glass ? WALL.glass : WALL.face;
    ctx.fillRect(x + 1, y + 1, Math.max(0, ww - 2), Math.max(0, hh - 2));
  }
}

/**
 * The route, as a run of pixel steps.
 *
 * A stroked line with a dash pattern comes out of the upscale as a grey
 * smear. Stamping little squares along the path keeps every mark on the
 * pixel grid.
 */
export function drawRoutePixel (ctx, path, toBuf, ok) {
  if (!path || path.length < 2) return;

  // Walk the line in buffer space rather than sampling the path array, so the
  // dashes are evenly spaced however long the route is and however far the
  // plan is zoomed. Every mark lands on a whole pixel.
  const pts = path.map(p => toBuf(p.x, p.y));
  const dark = 'rgba(26, 16, 10, 0.55)';
  const light = ok ? '#fff3dc' : '#ffb9ad';
  let carry = 0;
  const STEP = 2.4;          // buffer pixels between marks
  const ON = 3, OFF = 2;     // marks on, marks off
  let n = 0;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    for (let d = carry; d < len; d += STEP) {
      const t = d / len;
      const x = Math.round(a.x + dx * t), y = Math.round(a.y + dy * t);
      if (n++ % (ON + OFF) >= ON) continue;
      ctx.fillStyle = dark;
      ctx.fillRect(x - 1, y - 1, 4, 4);
      ctx.fillStyle = light;
      ctx.fillRect(x, y, 2, 2);
    }
    carry = STEP - ((len - carry) % STEP);
  }
}

/** Where it went wrong, marked with a cross you cannot miss. */
export function drawStopMark (ctx, bx, by) {
  const put = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  const R = 5;
  for (let i = -R; i <= R; i++) {
    for (const [dx, dy] of [[i, i], [i, -i]]) {
      put(Math.round(bx + dx), Math.round(by + dy), '#2f2119');
    }
  }
  for (let i = -R + 1; i <= R - 1; i++) {
    for (const [dx, dy] of [[i, i], [i, -i]]) {
      put(Math.round(bx + dx), Math.round(by + dy), '#ff6b5e');
    }
  }
}

/** A ring around whatever the cursor is on, drawn in pixels not strokes. */
export function drawSelectRing (ctx, cx, cy, rad, colour) {
  const r = Math.max(3, Math.round(rad));
  ctx.fillStyle = colour;
  for (let a = 0; a < 44; a++) {
    const th = a / 44 * Math.PI * 2;
    // Every third mark skipped: a dotted ring reads as a selection, a solid
    // one reads as part of the furniture.
    if (a % 3 === 2) continue;
    ctx.fillRect(Math.round(cx + Math.cos(th) * r), Math.round(cy + Math.sin(th) * r), 1, 1);
  }
}
