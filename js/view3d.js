/**
 * The room in three dimensions, rendered as pixels.
 *
 * The whole scene is drawn into a 384 x 216 buffer and blown up with nearest
 * neighbour. That is not a stylistic afterthought, it is the production
 * strategy: at that resolution a surface is a handful of pixels, so nothing
 * needs a detailed texture and there is nothing for a missing art team to be
 * missing. The constraint is the look.
 *
 * A dither and quantise pass on the way out does the rest. Ordered dithering
 * across a reduced palette is what separates "pixel art" from "small render",
 * and it is about twenty lines of shader.
 */

import * as THREE from '../vendor/three.module.js';
import { def, KINDS, MATERIALS, supportUnder, COUNTERTOP } from './room.js';

export const RENDER_W = 480;
export const RENDER_H = 270;
const EYE = 158;              // centimetres, average standing eye height
const V_FOV_MAX = 68;         // degrees; above this the ceiling eats the frame
const WALL_H = 285;

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

// Cool, slightly desaturated, with warm accents held back for light sources.
// Kept small on purpose: a tight palette is most of what reads as authored.
const PAL = {
  floor:      0xd8ae82,
  floorAlt:   0xe4bd90,
  wallTile:   0xefe9d8,
  wallGlass:  0xb4dde8,
  wallBrick:  0xcf8760,
  wallWood:   0xcf9c5b,
  wallPlaster:0xe9dfc6,
  wallAcoustic:0x8bab92,
  ceiling:    0xfaf2e2,
  sky:        0xa9c9d6,
  metal:      0xc3ccd2,
  dark:       0x5a4a42,
  warm:       0xffc46b,
  cool:       0x7fd4c1,
  seat:       0xb87a4a,
  wood:       0x9c6b3f,
  plant:      0x74a85c,
  cloth:      0xd05f52,
  skin:       0xe0a878,
  coat:       0x4f6d8a
};

/**
 * One material per colour, shared by every mesh that uses it.
 *
 * Building a fresh MeshLambertMaterial inside each model — which is what the
 * first version did — meant a furnished cafe had roughly 180 unique
 * materials and forced a renderer state change on almost every draw call.
 * They are all flat and unlit-ish, so sharing costs nothing visually and is
 * most of the frame budget back.
 */
const MATS = new Map();
const MATS_SET = new Set();
export function mat (c) {
  let m = MATS.get(c);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c });
    MATS.set(c, m);
    MATS_SET.add(m);
  }
  return m;
}

/**
 * Fold a group's plain meshes into one draw call per material.
 *
 * A cafe is about thirty pieces of furniture and each is built from six to
 * ten little boxes, which came to four hundred draw calls a frame — trivial
 * geometry, but four hundred round trips through the driver, and that is
 * what a weaker machine feels as stutter. Nothing here moves independently
 * of its parent, so the parts can be welded once at build time. Anything
 * with its own material (glass, glow, anything transparent) is left alone.
 */
function bake (group) {
  const buckets = new Map();
  const keep = [];
  for (const c of group.children) {
    const ok = c.isMesh && c.children.length === 0 && MATS_SET.has(c.material) &&
               c.geometry.index && c.geometry.attributes.uv;
    if (!ok) { keep.push(c); continue; }
    const k = c.material.uuid + (c.castShadow ? '+s' : '');
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  }
  if (buckets.size === 0) return;

  group.clear();
  for (const c of keep) group.add(c);

  for (const parts of buckets.values()) {
    if (parts.length === 1) { group.add(parts[0]); continue; }
    const geos = parts.map(m => {
      const gg = m.geometry.clone();
      m.updateMatrix();
      gg.applyMatrix4(m.matrix);
      return gg;
    });
    let vTotal = 0, iTotal = 0;
    for (const gg of geos) { vTotal += gg.attributes.position.count; iTotal += gg.index.count; }

    const pos = new Float32Array(vTotal * 3);
    const nor = new Float32Array(vTotal * 3);
    const uvs = new Float32Array(vTotal * 2);
    const idx = new (vTotal > 65535 ? Uint32Array : Uint16Array)(iTotal);
    let v = 0, i = 0;
    for (const gg of geos) {
      pos.set(gg.attributes.position.array, v * 3);
      nor.set(gg.attributes.normal.array, v * 3);
      uvs.set(gg.attributes.uv.array, v * 2);
      const gi = gg.index.array;
      for (let k = 0; k < gi.length; k++) idx[i + k] = gi[k] + v;
      v += gg.attributes.position.count;
      i += gi.length;
      gg.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    merged.setIndex(new THREE.BufferAttribute(idx, 1));
    merged.computeBoundingSphere();

    const m = new THREE.Mesh(merged, parts[0].material);
    m.castShadow = parts[0].castShadow;
    m.receiveShadow = true;
    group.add(m);
    for (const part of parts) part.geometry.dispose();
  }
}

const wallColor = m => ({
  tile: PAL.wallTile, glass: PAL.wallGlass, brick: PAL.wallBrick,
  wood: PAL.wallWood, plaster: PAL.wallPlaster, acoustic: PAL.wallAcoustic
}[m] ?? PAL.wallPlaster);

/* ------------------------------------------------------------------ */
/* Post pass                                                           */
/* ------------------------------------------------------------------ */

const POST_FRAG = `
uniform sampler2D tDiffuse;
uniform float uLevels;
varying vec2 vUv;

// 4x4 Bayer matrix. Ordered dithering, the cheapest way to make a gradient
// look hand placed rather than smeared.
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16];
  m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
  m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
  m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
  m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
  for (int k = 0; k < 16; k++) { if (k == i) return m[k] / 16.0 - 0.5; }
  return 0.0;
}

void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec2 px = vUv * vec2(${RENDER_W}.0, ${RENDER_H}.0);
  float d = bayer(px) / uLevels;
  vec3 q = floor((c.rgb + d) * uLevels + 0.5) / uLevels;
  gl_FragColor = vec4(q, c.a);
}`;

const POST_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * A little speech bubble above somebody's head, saying what they ordered.
 *
 * Drawn to a canvas and hung as a sprite, so it always faces you however you
 * walk round the room. Without it the mode asked you to remember which of
 * eight identical-looking people wanted the flat white, which is a memory
 * test rather than a café — and a memory test is the last thing this game
 * should be putting in front of anybody.
 */
const BUBBLE_CACHE = new Map();
function bubbleTexture (text, ready) {
  const key = text + (ready ? '!' : '');
  if (BUBBLE_CACHE.has(key)) return BUBBLE_CACHE.get(key);

  const W = 160, H = 76;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;

  // Cream bubble, heavy dark outline, little tail. Same treatment as the
  // speech bubble in the interface, so the two read as one language.
  const body = ready ? '#ffe3ac' : '#f6f0e2';
  g.fillStyle = '#2f2119';
  g.fillRect(2, 2, W - 4, H - 22);
  g.beginPath(); g.moveTo(W / 2 - 9, H - 20); g.lineTo(W / 2 + 9, H - 20);
  g.lineTo(W / 2, H - 6); g.closePath(); g.fill();
  g.fillStyle = body;
  g.fillRect(5, 5, W - 10, H - 28);
  g.beginPath(); g.moveTo(W / 2 - 6, H - 23); g.lineTo(W / 2 + 6, H - 23);
  g.lineTo(W / 2, H - 12); g.closePath(); g.fill();

  g.fillStyle = '#2f2119';
  g.font = '800 21px ui-monospace, Menlo, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, (H - 22) / 2 + 3);

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  BUBBLE_CACHE.set(key, tex);
  return tex;
}

/**
 * A pin over the thing you are supposed to be walking to.
 *
 * Playtested cold: the shift drops you into a first-person room, tells you
 * to grind coffee, and never says where the grinder is. You spend the first
 * thirty seconds turning on the spot. Every one of the four modes had this
 * and it is the difference between a room you are working in and a room you
 * are lost in.
 */
let PIN_TEX = null;
function pinTexture () {
  if (PIN_TEX) return PIN_TEX;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 40;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // Chunky downward chevron with a dark outline, in the warm accent.
  px(6, 4, 20, 4, '#2f2119');
  px(4, 8, 24, 4, '#2f2119');
  for (let i = 0; i < 8; i++) px(6 + i * 1.5, 12 + i * 2, 20 - i * 3, 2, '#2f2119');
  px(8, 6, 16, 4, '#ffd9a0');
  px(7, 10, 18, 3, '#ffc46b');
  for (let i = 0; i < 6; i++) px(9 + i * 1.6, 13 + i * 2, 14 - i * 3.2, 2, '#ffc46b');
  PIN_TEX = new THREE.CanvasTexture(c);
  PIN_TEX.minFilter = THREE.NearestFilter;
  PIN_TEX.magFilter = THREE.NearestFilter;
  return PIN_TEX;
}

/**
 * A person.
 *
 * The whole cast used to be four boxes — legs, body, head, a slab of hair —
 * and at any distance they read as bollards. They are the thing you look at
 * most in this game and the thing the game is about, so they get built
 * properly: arms, a neck, shoes, a collar, one of several hair shapes, and a
 * face. At 480 pixels wide a face is six pixels and every one of them counts,
 * which is exactly the budget pixel art is designed for.
 *
 * `seed` picks the hair, the build and the palette, so a room full of people
 * is a room full of different people rather than one person copied eight
 * times. Nothing here is animated per-frame; the idle sway is applied to the
 * group by whoever is holding it.
 */
const SKINS = [0xf0c9a0, 0xe0a878, 0xc98c5e, 0x9c6440, 0x74472c, 0x53301c];
const HAIRS = [0x2b2320, 0x4a3327, 0x7a4a24, 0xb08040, 0xd8cfc4, 0x8a3a2a, 0x3a3f4a];
const COATS = [0x6d7f9c, 0x8a6a52, 0x7d8f6b, 0x9c6b7a, 0x5f6470,
               0xa8543f, 0x4f6d8a, 0x6b5a86, 0x3f6f63];
const LEGS  = [0x3a3a44, 0x4a4038, 0x2f3540, 0x5a4a42, 0x3d4a3a];

function personMesh (seed = 0, opts = {}) {
  const g = new THREE.Group();
  const r = (n, m) => Math.abs(Math.round(Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453)) % m;

  const skin = SKINS[r(1, SKINS.length)];
  const hair = HAIRS[r(2, HAIRS.length)];
  const coat = opts.coat ?? COATS[r(3, COATS.length)];
  const trous = LEGS[r(4, LEGS.length)];
  const tall = 1 + (r(5, 7) - 3) * 0.022;      // a bit of variation in height
  const wide = 1 + (r(6, 5) - 2) * 0.035;

  const put = (w, h, d, colour, x, y, z, shadow = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(colour));
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // Shoes, legs, hips.
  put(9, 5, 14, 0x2a2320, -6.5, 2.5, 1);
  put(9, 5, 14, 0x2a2320, 6.5, 2.5, 1);
  put(9.5, 48, 10, trous, -6.5, 29, 0);
  put(9.5, 48, 10, trous, 6.5, 29, 0);
  put(24 * wide, 12, 15, trous, 0, 58, 0, true);

  // Torso, with a collar and a hint of a front opening so it reads as clothes.
  put(27 * wide, 44, 18, coat, 0, 86, 0, true);
  put(27 * wide, 5, 18.4, shade(coat, 0.78), 0, 106, 0);          // shoulder line
  put(4, 40, 18.6, shade(coat, 0.84), 0, 85, 0);                  // placket
  put(15, 6, 19, skin, 0, 111, 0.4);                              // open collar

  // Arms, hanging, slightly forward so they are not fenceposts.
  const arm = (side) => {
    const a = put(8, 40, 9, coat, side * (15 * wide), 87, 1.5, true);
    a.rotation.x = -0.06;
    put(8, 9, 9, skin, side * (15 * wide), 65, 2.6);              // hand
    return a;
  };
  arm(-1); arm(1);

  // Neck and head.
  put(10, 7, 10, shade(skin, 0.88), 0, 112, 0);
  const head = put(20, 21, 19, skin, 0, 126, 0, true);

  /*
   * The face. Six pixels of it, and it is the difference between a room of
   * people and a room of furniture.
   */
  const eye = (side) => {
    put(3.4, 3.4, 1.2, 0x2b2320, side * 4.6, 128.5, 9.8);
    put(1.2, 1.2, 1.4, 0xffffff, side * 5.4, 129.4, 9.9);          // catchlight
  };
  eye(-1); eye(1);
  put(5.5, 1.6, 1.2, shade(skin, 0.7), 0, 121.5, 9.8);             // mouth
  put(3.4, 2.2, 1.4, shade(skin, 0.9), 0, 125, 10);                // nose
  // A little colour high on the cheek. Cheap, and it is most of "cute".
  put(3.6, 2.4, 1.1, shade(skin, 1.06, 0xff9a86), -7.4, 124.5, 9.7);
  put(3.6, 2.4, 1.1, shade(skin, 1.06, 0xff9a86), 7.4, 124.5, 9.7);

  // Hair, in one of four shapes, because a slab on top of the head is what
  // made everybody look identical from behind.
  const style = r(7, 4);
  put(21.5, 7, 20, hair, 0, 138.5, 0, true);                        // crown
  if (style === 0) {                                                // cropped
    put(21.5, 9, 4, hair, 0, 132, -8.6);
  } else if (style === 1) {                                         // bob
    put(21.5, 16, 20.5, hair, 0, 128, -0.6);
    put(3, 16, 6, hair, -10.6, 128, 6);
    put(3, 16, 6, hair, 10.6, 128, 6);
    put(20, 5, 3, hair, 0, 135.5, 9.7);                             // fringe
  } else if (style === 2) {                                         // tied back
    put(21.5, 8, 20, hair, 0, 133, -1);
    put(10, 16, 9, hair, 0, 128, -12);
  } else {                                                          // loose
    put(21.5, 20, 21, hair, 0, 126, -1.5);
    put(19, 6, 4, hair, 0, 136, 9.4);
  }

  g.userData.head = head;
  return g;
}

/** Darken or tint a colour without needing a whole material system. */
function shade (hex, f, towards = null) {
  const c = new THREE.Color(hex);
  if (towards) c.lerp(new THREE.Color(towards), 0.42);
  c.multiplyScalar(f);
  return c.getHex();
}

/** One takeaway cup, used both on the counter and in your hands. */
function cupMesh () {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 4, 12, 8), mat(0xf2ece0));
  body.position.y = 6;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 2, 8), mat(0x8a5a34));
  lid.position.y = 13;
  g.add(body, lid);
  return g;
}

/* ------------------------------------------------------------------ */

export class View3D {
  constructor (canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(RENDER_W, RENDER_H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;   // hard edges suit pixels

    this.target = new THREE.WebGLRenderTarget(RENDER_W, RENDER_H, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false
    });

    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.target.texture }, uLevels: { value: 24.0 } },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAL.sky);
    // Far enough out that an overview is not swallowed by haze. Interiors are
    // small; fog here is for softening depth, not for hiding draw distance.
    this.scene.fog = new THREE.Fog(PAL.sky, 1100, 3800);

    this.camera = new THREE.PerspectiveCamera(68, RENDER_W / RENDER_H, 8, 4000);
    this.mode = 'plan';
    this.thingMeshes = new Map();
    this.walkT = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Building the room                                                 */
  /* ---------------------------------------------------------------- */

  build (room, heatCanvas) {
    this.room = room;
    const s = this.scene;
    while (s.children.length) s.remove(s.children[0]);
    this.thingMeshes.clear();

    const cx = room.w / 2, cz = room.h / 2;

    // Floor. The heatmap lives here as a texture, so the survey is part of
    // the world rather than an overlay drawn on top of it.
    this.heatTex = new THREE.CanvasTexture(heatCanvas);
    this.heatTex.minFilter = THREE.NearestFilter;
    this.heatTex.magFilter = THREE.NearestFilter;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(room.w, room.h),
      new THREE.MeshLambertMaterial({ map: this.heatTex, color: 0xffffff })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    s.add(floor);
    this.floor = floor;
    this._survey = true;   // built carrying the survey map

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(room.w, room.h),
      new THREE.MeshLambertMaterial({ color: PAL.ceiling, side: THREE.BackSide })
    );
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.set(cx, WALL_H, cz);
    s.add(ceil);
    this.ceiling = ceil;
    this.wallMeshes = [];

    for (const w of room.walls) {
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (len < 1) continue;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(len, WALL_H, 10),
        new THREE.MeshLambertMaterial({ color: wallColor(w.material), side: THREE.BackSide })
      );
      m.position.set((w.x1 + w.x2) / 2, WALL_H / 2, (w.y1 + w.y2) / 2);
      m.rotation.y = -Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
      m.castShadow = true;
      m.receiveShadow = true;
      s.add(m);
      this.wallMeshes.push(m);
    }

    // Ground the building sits on, so the dollhouse view is a place in a
    // world rather than a box hanging in nothing.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(room.w * 6, room.h * 6),
      new THREE.MeshLambertMaterial({ color: 0x8fa08a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -6, cz);
    ground.receiveShadow = true;
    s.add(ground);

    // A pavement skirt around the footprint.
    const skirt = new THREE.Mesh(
      new THREE.PlaneGeometry(room.w + 260, room.h + 260),
      new THREE.MeshLambertMaterial({ color: 0xa9a294 })
    );
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(cx, -3, cz);
    skirt.receiveShadow = true;
    s.add(skirt);

    this.addOutside(room);
    this.addFabric(room);

    for (const t of room.things) if (t.placed) this.addThing(t);

    // Light. Kept few and hard, because soft global illumination reads as
    // mush once you are down at this resolution.
    s.add(new THREE.AmbientLight(0xfff0dc, 2.6));
    s.add(new THREE.HemisphereLight(0xfff6e8, 0xd0a274, 1.8));
    const key = new THREE.DirectionalLight(0xfff0d2, 2.1);
    key.position.set(cx - 400, 900, cz - 500);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);   // plenty at 480x270
    const d = Math.max(room.w, room.h);
    Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 10, far: 2600 });
    key.shadow.camera.updateProjectionMatrix();
    s.add(key);

    this.refreshLights();
  }

  /**
   * The world outside.
   *
   * A painted pixel backdrop hung on a big curved wall around the building,
   * so every window and glass door has something real behind it instead of
   * flat fog. It is the same art as the brief screens, which is the point:
   * the room you are standing in and the picture you were shown are one
   * place. Loads lazily and simply never appears if the asset is missing.
   */
  addOutside (room) {
    const url = `assets/outside-${room.outside ?? 'street'}.png`;
    const loader = new THREE.TextureLoader();
    loader.load(url, tex => {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;

      const radius = Math.max(room.w, room.h) * 1.5;
      const geo = new THREE.CylinderGeometry(
        radius, radius, WALL_H * 3.2, 48, 1, true, 0, Math.PI * 2
      );
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: tex, side: THREE.BackSide, fog: false, toneMapped: false
      }));
      mesh.position.set(room.w / 2, WALL_H * 0.9, room.h / 2);
      mesh.renderOrder = -1;
      this.scene.add(mesh);
      this.outside = mesh;
      this.outsideTex = tex;

      // Windows built before the painting arrived have no glass in them yet.
      for (const t of this.room.things) {
        if (t.placed && t.kind === 'window') {
          const old = this.thingMeshes.get(t.id);
          if (old) { this.scene.remove(old); this.thingMeshes.delete(t.id); }
          this.addThing(t);
        }
      }
    }, undefined, () => { /* no asset, no outside; the sky colour stands in */ });
  }

  /**
   * A soft radial glow texture, drawn once. Billboarded around every warm
   * light, it is most of what makes the tavern-reel look read as cosy: the
   * lamp is not just lighting the room, you can see the light itself.
   */
  glowTexture () {
    if (this._glowTex) return this._glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255, 214, 150, 0.85)');
    grad.addColorStop(0.4, 'rgba(255, 190, 110, 0.28)');
    grad.addColorStop(1, 'rgba(255, 180, 90, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    this._glowTex = new THREE.CanvasTexture(c);
    return this._glowTex;
  }

  /** Fixtures glow. Rebuilt whenever a light source moves. */
  refreshLights () {
    for (const l of this.scene.children.filter(c => c.userData.fixture)) this.scene.remove(l);
    for (const t of this.room.things) {
      if (!t.placed) continue;
      const D = def(t);
      if (!D.emits?.light) continue;
      const warm = t.kind === 'lamp' || t.kind === 'window';
      const l = new THREE.PointLight(warm ? 0xffd9a0 : 0xd6e6ff, warm ? 1.1 : 1.5,
        (D.radius?.light ?? 300) * 1.5, 1.6);
      l.position.set(t.x, WALL_H - 40, t.y);
      l.userData.fixture = true;
      this.scene.add(l);

      // The visible bloom around the fixture.
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTexture(),
        color: warm ? 0xffd9a0 : 0xeaf2ff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: warm ? 0.9 : 0.5
      }));
      const y = t.kind === 'lamp' ? 135 : WALL_H - 40;
      sp.position.set(t.x, y, t.y);
      sp.scale.setScalar(warm ? 150 : 110);
      sp.userData.fixture = true;
      this.scene.add(sp);
    }
  }

  /**
   * Wood-plank floor, drawn to a canvas rather than shipped as a file. Seen
   * at eye height in Walk mode, a flat colour reads as a void; planks with a
   * little jitter read as a building.
   */
  woodTexture () {
    if (this._woodTex) return this._woodTex;
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const plankH = 64;
    for (let row = 0; row < 8; row++) {
      const offset = (row % 2) * 128;
      for (let px = -1; px < 5; px++) {
        const x = px * 128 + offset;
        const tone = 0.88 + ((row * 7 + px * 13) % 10) / 40;
        g.fillStyle = `rgb(${(0xc9 * tone) | 0}, ${(0x93 * tone) | 0}, ${(0x62 * tone) | 0})`;
        g.fillRect(x, row * plankH, 126, plankH - 2);
        // grain
        g.strokeStyle = 'rgba(90, 60, 35, 0.16)';
        g.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const gy = row * plankH + 12 + k * 16 + ((px * 31 + k * 7) % 9);
          g.beginPath();
          g.moveTo(x + 4, gy);
          g.lineTo(x + 122, gy + ((k + px) % 3) - 1);
          g.stroke();
        }
      }
    }
    this._woodTex = new THREE.CanvasTexture(c);
    this._woodTex.wrapS = this._woodTex.wrapT = THREE.RepeatWrapping;
    return this._woodTex;
  }

  /**
   * The building itself: beams, rails, skirting.
   *
   * Furniture was doing all the work and the room around it was six flat
   * planes, so the top third of a first-person frame was a blank cream slab —
   * the void. None of this is decoration for its own sake: a beam overhead
   * and a rail at shoulder height are what tell your eye how big a room is
   * and how far away its far side is. They are also what every cosy pixel
   * interior has and ours did not.
   *
   * All of it welds into one group, so the whole lot costs three draw calls.
   */
  addFabric (room) {
    const g = new THREE.Group();
    const cx = room.w / 2, cz = room.h / 2;

    const add = (geo, colour, x, y, z, rotY = 0, shadow = false) => {
      const m = new THREE.Mesh(geo, mat(colour));
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      m.castShadow = shadow;
      m.receiveShadow = true;
      g.add(m);
    };

    // Beams across the short axis, spaced so a room reads as a rhythm rather
    // than a box. Hung just under the ceiling with a shadow gap.
    const across = room.w >= room.h;
    const span = (across ? room.h : room.w) + 20;
    const runLen = across ? room.w : room.h;
    const gap = 150;
    const count = Math.max(2, Math.round(runLen / gap) - 1);
    const beamGeo = new THREE.BoxGeometry(20, 22, span);
    for (let i = 1; i <= count; i++) {
      const t = (i / (count + 1));
      const at = t * runLen;
      if (across) add(beamGeo, 0x8a6440, at, WALL_H - 13, cz);
      else add(beamGeo, 0x8a6440, cx, WALL_H - 13, at, Math.PI / 2);
    }
    // A plate along the beams' ends, which is what stops them floating.
    const plateGeo = new THREE.BoxGeometry(across ? room.w : 18, 10, across ? 18 : room.h);
    add(plateGeo, 0x7a5636, across ? cx : 9, WALL_H - 27, across ? 9 : cz);
    add(plateGeo, 0x7a5636, across ? cx : room.w - 9, WALL_H - 27, across ? room.h - 9 : cz);

    // Skirting and a picture rail on every wall, set just inside the face.
    for (const w of room.walls) {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
      const len = Math.hypot(dx, dy);
      if (len < 40) continue;
      const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
      // Whichever normal points into the room.
      let nx = -dy / len, ny = dx / len;
      if (nx * (cx - mx) + ny * (cz - my) < 0) { nx = -nx; ny = -ny; }
      const rotY = -Math.atan2(dy, dx);
      const off = 7;
      const dark = w.material === 'glass';
      if (dark) continue;                    // glazing gets no joinery

      add(new THREE.BoxGeometry(len, 16, 5), 0xd6c6ab,
          mx + nx * off, 8, my + ny * off, rotY);            // skirting
      add(new THREE.BoxGeometry(len, 7, 5), 0xd6c6ab,
          mx + nx * off, 104, my + ny * off, rotY);          // dado rail
      add(new THREE.BoxGeometry(len, 6, 4), 0xcdbb9e,
          mx + nx * off, 186, my + ny * off, rotY);          // picture rail
      add(new THREE.BoxGeometry(len, 9, 4), 0xbda98a,
          mx + nx * off, WALL_H - 6, my + ny * off, rotY);   // cornice

      /*
       * Panelling below the dado.
       *
       * A four-metre run of flat plaster is the single least convincing
       * thing in a room — real interiors are broken up at about a metre,
       * and it is what stops a wall reading as a backdrop. Drawn as
       * recessed frames, which at this resolution is two rectangles.
       */
      const panelW = 92;
      const runs = Math.max(1, Math.floor((len - 24) / panelW));
      const step = (len - 24) / runs;
      for (let i = 0; i < runs; i++) {
        const along = -len / 2 + 12 + step * (i + 0.5);
        const ax = mx + Math.cos(-rotY) * along, ay = my + Math.sin(-rotY) * along;
        add(new THREE.BoxGeometry(step - 16, 62, 3), 0xc9b696,
            ax + nx * (off - 1), 55, ay + ny * (off - 1), rotY);
        add(new THREE.BoxGeometry(step - 26, 50, 2), 0xdfd2b8,
            ax + nx * (off - 2), 55, ay + ny * (off - 2), rotY);
      }
    }

    bake(g);
    this.scene.add(g);
    this.fabric = g;
  }

  /** A low-poly, chunky shape per kind. Readable at 384 wide is the only bar. */
  addThing (t) {
    const D = def(t);
    const g = new THREE.Group();
    const col = mat;
    const box = (w, h, d2, c, y = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d2), col(c));
      m.position.y = y + h / 2;
      // Only sizeable things cast: a shadow from a 7cm cup is invisible at
      // this resolution and costs a whole extra draw in the shadow pass.
      m.castShadow = Math.max(w, h, d2) > 30;
      m.receiveShadow = true;
      return m;
    };
    const cyl = (r, h, c, y = 0, seg = 8) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), col(c));
      m.position.y = y + h / 2;
      m.castShadow = Math.max(r * 2, h) > 30;
      m.receiveShadow = true;
      return m;
    };

    switch (t.kind) {
      case 'counter': {
        g.add(box(D.r * 2, 96, D.r * 1.25, PAL.wood));
        // Overhanging worktop with a lip, the way a real bar reads.
        g.add(box(D.r * 2.2, 9, D.r * 1.5, 0x8f6a48, 96));
        g.add(box(D.r * 2.05, 22, 6, 0xb08757, 62));
        g.children.at(-1).position.z = -D.r * 0.66;
        // A couple of cups waiting on the pass.
        for (const off of [-30, 6, 40]) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(7, 6, 11, 8), col(0xf3ece0));
          cup.position.set(off, 111, D.r * 0.35);
          cup.castShadow = true;
          g.add(cup);
        }
        break;
      }
      case 'grinder': {
        const H = 0;
        g.add(box(30, 16, 30, 0x55585c, H));            // base
        g.add(box(24, 34, 26, 0x8d949a, H + 16));       // body
        g.add(box(20, 5, 20, 0x55585c, H + 48));        // collar
        const hop = new THREE.Mesh(new THREE.ConeGeometry(14, 26, 8), col(0x46484b));
        hop.position.y = H + 53 + 13;
        hop.rotation.x = Math.PI;                       // wide end up, like a hopper
        hop.castShadow = true;
        g.add(hop);
        const spout = box(9, 12, 9, 0x55585c, H + 14);
        spout.position.z = 17;
        g.add(spout);
        break;
      }
      case 'machine': {
        const H = 0;   // the group is lifted onto whatever is underneath
        g.add(box(74, 44, 46, 0xd8dce0, H));
        g.add(box(70, 12, 42, 0x8d949a, H + 44));       // top tray
        g.add(box(74, 9, 48, 0x6f767c, H - 4));         // drip tray
        // Two group heads with portafilters hanging off the front.
        for (const off of [-20, 20]) {
          const grp = box(16, 14, 10, 0x8d949a, H + 8);
          grp.position.x = off; grp.position.z = 26;
          g.add(grp);
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 20, 6), col(0x3a3a3c));
          handle.rotation.z = Math.PI / 2;
          handle.position.set(off, H + 10, 38);
          g.add(handle);
        }
        // Steam wand.
        const wand = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 26, 6), col(0xb9c2c9));
        wand.rotation.x = 0.5;
        wand.position.set(42, H + 18, 20);
        g.add(wand);
        break;
      }
      case 'speaker':
        // On a stand, because a box hanging in the air at head height was
        // the single most obviously wrong thing in the room.
        g.add(cyl(14, 3, 0x3a3a3c, 0, 10));
        g.add(cyl(3, 150, 0x55585c, 3));
        g.add(box(24, 34, 20, PAL.dark, 153));
        g.add(box(18, 18, 2, 0x1e1e20, 161)).position.z = 11;
        break;
      case 'fluorescent': {
        // Hung from the ceiling on two drops.
        const yTop = WALL_H - 26;
        for (const off of [-D.r * 0.55, D.r * 0.55]) {
          const drop = cyl(1.6, 26, 0xb9c2c9, yTop + 8);
          drop.position.x = off;
          g.add(drop);
        }
        g.add(box(D.r * 2, 8, 34, 0xf2f6ff, yTop));
        g.add(box(D.r * 2 + 6, 5, 38, 0xd7dde4, yTop + 8));
        break;
      }
      case 'lamp':
        // Base, stem, shade and a warm bulb under it.
        g.add(cyl(16, 4, 0x5a4a42, 0, 10));
        g.add(cyl(3, 118, 0x8d949a, 4));
        g.add(cyl(7, 6, PAL.warm, 116, 8));
        g.add(cyl(20, 22, 0xe8d3a8, 122, 10));
        g.add(cyl(21, 3, 0xc9a97c, 122, 10));
        break;
      case 'window': {
        // Which wall is this in? The nearest edge decides the orientation, so
        // a window always sits flush and faces out rather than floating.
        const R = this.room;
        const dLeft = t.x, dRight = R.w - t.x, dTop = t.y, dBot = R.h - t.y;
        const min = Math.min(dLeft, dRight, dTop, dBot);
        const vertical = (min === dLeft || min === dRight);

        const W = D.r * 2.2, H = 150, SILL = 92;
        const frame = 7;
        const thick = 10;

        // The pane. Unlit and unfogged so the painted street reads as
        // daylight coming in, which is the entire job of a window.
        //
        // No recess box: the first version put a dark solid behind the glass
        // to fake depth, and it simply occluded it. Every pane came out black.
        if (this.outsideTex) {
          // A slice of the street per window, so two windows in one wall do
          // not show the identical view.
          const slice = this.outsideTex.clone();
          slice.needsUpdate = true;
          slice.wrapS = slice.wrapT = THREE.RepeatWrapping;
          slice.repeat.set(0.34, 0.86);
          slice.offset.set(((parseInt(t.id.slice(1), 10) || 0) % 3) * 0.3, 0.08);

          const pane = new THREE.Mesh(
            new THREE.PlaneGeometry(W - frame * 2, H - frame * 2),
            new THREE.MeshBasicMaterial({ map: slice, fog: false, toneMapped: false })
          );
          pane.position.y = SILL + H / 2;
          // Face into the room, standing just proud of the wall.
          if (vertical) {
            pane.rotation.y = dLeft < dRight ? Math.PI / 2 : -Math.PI / 2;
            pane.position.x = dLeft < dRight ? 10 : -10;
          } else {
            pane.rotation.y = dTop < dBot ? 0 : Math.PI;
            pane.position.z = dTop < dBot ? 10 : -10;
          }
          g.add(pane);
        }

        // Frame: sill, head, two jambs, and a glazing bar down the middle.
        const bar = (bw, bh, bd, by, bx = 0, bz = 0) => {
          const m = box(vertical ? bd : bw, bh, vertical ? bw : bd, 0xe8e2d4, by);
          m.position.x = vertical ? bz : bx;
          m.position.z = vertical ? bx : bz;
          g.add(m);
        };
        bar(W + 8, frame, thick + 4, SILL - frame);          // sill
        bar(W + 8, frame, thick + 4, SILL + H);              // head
        bar(frame, H, thick + 4, SILL, -W / 2 + frame / 2);  // left jamb
        bar(frame, H, thick + 4, SILL, W / 2 - frame / 2);   // right jamb
        bar(5, H, thick, SILL, 0);                           // glazing bar
        break;
      }
      case 'diffuser':
        g.add(box(D.r * 2, 7, 36, 0xf4f7f2, WALL_H - 34));
        break;
      case 'panel':
        g.add(box(D.r * 2, 90, 10, PAL.wallAcoustic, 110));
        break;
      case 'soft':
        g.add(box(D.r * 1.9, 38, D.r * 1.6, PAL.seat));
        g.add(box(D.r * 1.9, 40, 14, PAL.seat, 38));
        break;
      case 'rug':
        g.add(box(D.r * 2, 2, D.r * 1.6, 0x5a4a52, 1));
        break;
      case 'screen':
        g.add(box(D.r * 1.8, 14, 18, PAL.wallWood));
        for (let i = 0; i < 4; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(16, 6, 5), col(PAL.plant));
          b.position.set(-D.r * 0.7 + i * (D.r * 0.47), 40 + (i % 2) * 16, 0);
          b.castShadow = true;
          g.add(b);
        }
        break;
      case 'booth':
        g.add(box(D.r * 1.7, 42, D.r * 1.5, PAL.seat));
        g.add(box(D.r * 1.7, 95, 14, PAL.wallAcoustic, 0));
        g.children.at(-1).position.z = -D.r * 0.7;
        break;
      case 'seat': {
        g.add(cyl(D.r * 0.55, 4, 0x6f767c, 0, 12));      // foot
        g.add(cyl(7, 68, 0x9aa2a8, 4, 8));               // column
        g.add(cyl(D.r * 0.95, 7, 0xb5793f, 72, 14));     // top
        g.add(cyl(D.r * 0.95, 2, 0x8f5c2c, 79, 14));     // edge banding
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 5.5, 10, 8), col(0xf3ece0));
        cup.position.set(9, 86, -6);
        cup.castShadow = true;
        g.add(cup);
        const saucer = cyl(11, 2, 0xe6ddd0, 81, 10);
        saucer.position.set(9, 82, -6);
        g.add(saucer);
        break;
      }
      case 'customer': {
        const seed = parseInt(t.id.replace(/\D/g, ''), 10) || 1;
        const p = personMesh(seed);
        // Facing roughly toward the middle of the room, so a crowd looks
        // like people waiting rather than a shop-window display.
        p.rotation.y = Math.atan2(this.room.w / 2 - t.x, this.room.h / 2 - t.y) +
                       (seed % 5 - 2) * 0.22;
        g.add(p);
        break;
      }

      case 'door': {
        // Frame, leaf, glazing and a handle, rather than two slabs.
        const W2 = D.r * 1.8;
        g.add(box(W2 + 20, 216, 12, 0xb99a72, 0));            // architrave
        g.add(box(W2, 205, 9, PAL.wood, 0));                  // leaf
        g.add(box(W2 - 16, 96, 5, PAL.wallGlass, 96));        // upper glazing
        g.add(box(W2 - 16, 4, 6, PAL.wood, 144));             // glazing bar
        g.add(box(4, 96, 6, PAL.wood, 96));
        g.add(box(W2 - 20, 52, 4, 0x8a5a34, 26));             // lower panel
        const handle = cyl(3, 11, 0xd8c48a, 108, 8);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(W2 / 2 - 14, 108, 7);
        g.add(handle);
        break;
      }

      case 'chair': {
        for (const [lx, lz] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) {
          const leg = box(4, 42, 4, 0x7a5636, 0);
          leg.position.x = lx; leg.position.z = lz;
          g.add(leg);
        }
        g.add(box(34, 6, 34, 0xa9743f, 42));
        // Back: two uprights and two slats, so it is a chair and not a slab.
        for (const ux of [-14, 14]) {
          const up = box(4, 40, 4, 0x7a5636, 48);
          up.position.x = ux; up.position.z = -15;
          g.add(up);
        }
        for (const sy of [62, 76]) {
          const slat = box(30, 7, 4, 0xa9743f, sy);
          slat.position.z = -15;
          g.add(slat);
        }
        break;
      }
      case 'shelf': {
        g.add(box(D.r * 1.8, 190, 30, PAL.wood, 0));
        for (let i = 0; i < 4; i++) {
          const row = box(D.r * 1.6, 26, 22, i % 2 ? PAL.cloth : PAL.wallAcoustic, 22 + i * 42);
          g.add(row);
        }
        break;
      }
      case 'menu':
        g.add(box(D.r * 1.9, 60, 5, PAL.dark, 175));
        break;
      case 'bin':
        g.add(cyl(D.r * 0.8, 62, PAL.wallAcoustic, 0, 8));
        g.add(cyl(D.r * 0.85, 6, PAL.dark, 62, 8));
        break;
      case 'pot':
        g.add(cyl(D.r * 0.7, 34, PAL.cloth, 0, 8));
        for (let i = 0; i < 5; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(15, 6, 5), col(PAL.plant));
          const a = (i / 5) * Math.PI * 2;
          b.position.set(Math.cos(a) * 12, 44 + (i % 2) * 14, Math.sin(a) * 12);
          b.castShadow = true;
          g.add(b);
        }
        break;

      case 'mess': {
        // A used cup and a saucer, on the table if there is one under it.
        g.add(cyl(15, 2, 0xeae3d2, 0, 10));
        g.add(cyl(8, 11, 0xf2ece0, 2, 8));
        g.add(cyl(6.5, 2, 0x7a5636, 11, 8));      // the dregs
        break;
      }

      default:
        g.add(box(D.r, 60, D.r, PAL.metal));
    }

    bake(g);
    // Sit it on whatever is underneath. Worktop things get a stub leg when
    // they end up on the floor, so a grinder dragged off the bar reads as
    // standing on a crate rather than sunk into the boards.
    const { top } = supportUnder(this.room, t.x, t.y, t);
    if (COUNTERTOP.has(t.kind) && top === 0) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(D.r * 1.6, 64, D.r * 1.6), mat(0x7a5636));
      crate.position.y = 32;
      crate.castShadow = true; crate.receiveShadow = true;
      g.add(crate);
      g.position.set(t.x, 64, t.y);
      g.userData.crated = true;
    } else {
      g.position.set(t.x, top, t.y);
      g.userData.crated = false;
    }
    g.userData.thingId = t.id;
    this.scene.add(g);
    this.thingMeshes.set(t.id, g);
  }

  /**
   * The visitor.
   *
   * Deliberately a person and not a marker. Watching someone walk your room
   * and stop is a different thing from watching a dot reach a red cross, and
   * the difference is most of why the room matters to the player at all.
   */
  ensureVisitor () {
    if (this.visitor) return this.visitor;
    const g = new THREE.Group();
    const col = mat;

    g.add(personMesh(3, { coat: PAL.coat }));

    // A ring on the floor that reads as their state without needing a HUD.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(30, 40, 20),
      new THREE.MeshBasicMaterial({ color: PAL.cool, transparent: true, opacity: 0.55,
        side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 2;
    g.add(ring);
    this.visitorRing = ring;

    this.scene.add(g);
    this.visitor = g;
    return g;
  }

  /** Place the visitor at a point on their walk and colour them by how it is going. */
  placeVisitor (step, facing) {
    if (!step) { if (this.visitor) this.visitor.visible = false; return; }
    const g = this.ensureVisitor();
    g.visible = true;
    g.position.set(step.x, 0, step.y);
    if (facing) g.rotation.y = Math.atan2(facing.x - step.x, facing.y - step.y);

    // Green while there is room to spare, red as it closes in.
    const t = Math.min(1, step.load / 0.45);
    this.visitorRing.material.color.setHSL((1 - t) * 0.33, 0.62, 0.5);
    this.visitorRing.scale.setScalar(1 + step.absorption * 0.35);
    this.visitorRing.material.opacity = 0.35 + t * 0.45;
  }

  /**
   * Hang an order over each waiting customer's head.
   *
   * Called from the service loop with the live orders, so a bubble appears
   * when somebody starts waiting, turns warm when their drink is on your
   * tray, and vanishes when you hand it over.
   */
  setOrderBubbles (orders) {
    if (!this.bubbles) this.bubbles = new Map();
    const live = new Set();

    for (const o of orders ?? []) {
      const c = o.customer;
      if (!c || !c.placed) continue;
      live.add(o.id);
      const label = o.name === 'flat white' ? 'FLAT WHITE' : 'ESPRESSO';
      let sp = this.bubbles.get(o.id);
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: bubbleTexture(label, false), depthTest: false, transparent: true
        }));
        sp.renderOrder = 10;
        this.scene.add(sp);
        this.bubbles.set(o.id, sp);
        sp.userData.ready = false;
      }
      if (sp.userData.ready !== o.ready) {
        sp.material.map = bubbleTexture(label, o.ready);
        sp.material.needsUpdate = true;
        sp.userData.ready = o.ready;
      }
      // Above the head, with a small idle bob so the room feels alive.
      const bob = Math.sin(performance.now() / 700 + (o.n ?? 0)) * 3;
      sp.position.set(c.x, 202 + bob, c.y);
      // Constant size on screen. A sprite in world units is a metre wide in
      // your face when you walk up to somebody; scaling with distance keeps
      // every order equally readable wherever it is in the room.
      const d = this.camera.position.distanceTo(sp.position);
      // Bigger than the first pass: at a full room's distance the old size
      // came out as an illegible white smudge, and an order you cannot read
      // is worse than no bubble at all.
      const k = Math.max(150, Math.min(1300, d)) * 0.135;
      sp.scale.set(k, k / 2, 1);
    }

    for (const [id, sp] of this.bubbles) {
      if (live.has(id)) continue;
      this.scene.remove(sp);
      this.bubbles.delete(id);
    }
  }

  /**
   * Point at where to go next, or nowhere.
   *
   * Drawn on top of everything (depthTest off) so it does not disappear
   * behind the counter you are trying to find.
   */
  setWaypoint (target) {
    if (!this.pin) {
      this.pin = new THREE.Sprite(new THREE.SpriteMaterial({
        map: pinTexture(), depthTest: false, transparent: true
      }));
      this.pin.renderOrder = 12;
      this.scene.add(this.pin);
    }
    if (this.pin.parent !== this.scene) this.scene.add(this.pin);
    if (!target) { this.pin.visible = false; return; }
    this.pin.visible = true;
    const bob = Math.sin(performance.now() / 380) * 7;
    this.pin.position.set(target.x, (target.y0 ?? 190) + 60 + bob, target.y);
    // Constant on screen, like the order bubbles.
    const d = this.camera.position.distanceTo(this.pin.position);
    const k = Math.max(150, Math.min(1400, d)) * 0.105;
    this.pin.scale.set(k, k * 1.25, 1);
  }

  /** Cheap per-frame sync so dragging in plan view moves the 3D object too. */
  sync (room) {
    for (const t of room.things) {
      const m = this.thingMeshes.get(t.id);
      if (!t.placed) { if (m) { this.scene.remove(m); this.thingMeshes.delete(t.id); } continue; }
      if (!m) { this.addThing(t); continue; }
      // The height has to follow too: drag the machine onto the bar and it
      // should climb onto it, drag it off and it should come down.
      const { top } = supportUnder(room, t.x, t.y, t);
      const want = COUNTERTOP.has(t.kind) && top === 0 ? 64 : top;
      if (Math.abs(m.position.y - want) > 1 && !m.userData.rebuilt) {
        // A worktop thing that has just lost or gained its crate needs the
        // model back, not just a new height.
        if (COUNTERTOP.has(t.kind) && (want === 64) !== (m.userData.crated === true)) {
          this.scene.remove(m);
          this.thingMeshes.delete(t.id);
          this.addThing(t);
          continue;
        }
      }
      m.position.set(t.x, want, t.y);
    }
    if (this.heatTex) this.heatTex.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- */
  /* Cameras                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Dollhouse or inside.
   *
   * From outside, the ceiling and the near walls have to get out of the way
   * or you are looking at the lid of a box. Rendering walls back-face-only
   * does it in one line: you see straight through whichever ones are between
   * you and the room, and they reappear as soon as you are inside.
   */
  setCutaway (on) {
    if (!this.ceiling) return;
    this.ceiling.visible = !on;
  }

  /**
   * Whether the floor carries the survey.
   *
   * The designer looking down at a plan should see the heatmap. Someone
   * standing in the room should see a floor, because that is what is there.
   * Painting the reading onto the world in first person would be showing the
   * player the answer instead of the room.
   */
  setFloorSurvey (on) {
    if (!this.floor) return;
    // Swapping the map sets material.needsUpdate, which makes three.js
    // recompile the shader program. Called unguarded from the frame loop that
    // is a recompile every frame, and it was most of the stutter.
    if (this._survey === on) return;
    this._survey = on;
    if (on) {
      this.floor.material.map = this.heatTex;
      this.floor.material.color.set(0xffffff);
    } else {
      const wood = this.woodTexture();
      wood.repeat.set(this.room.w / 300, this.room.h / 300);
      this.floor.material.map = wood;
      this.floor.material.color.set(0xffffff);
    }
    this.floor.material.needsUpdate = true;
  }

  setPlanCamera (yaw = -Math.PI / 4, pitch = 0.95, dist = 1.55) {
    this.hFov = 70;
    const r = this.room;
    const cx = r.w / 2, cz = r.h / 2;
    const d = Math.max(r.w, r.h) * dist;
    this.camera.position.set(
      cx + Math.sin(yaw) * d * Math.cos(pitch),
      d * Math.sin(pitch),
      cz + Math.cos(yaw) * d * Math.cos(pitch)
    );
    this.camera.lookAt(cx, 0, cz);
  }

  /**
   * Walk it yourself.
   *
   * There is deliberately nothing to do here but move and look. No ear
   * defenders, no sunglasses, no push-through key. The moment a coping tool
   * exists in this mode, the game starts teaching people to endure rooms
   * instead of to change them, which is the thing it exists to argue against.
   * You feel where it is bad, and then you go back to Plan and move the
   * grinder.
   */
  setFreeCamera (pos, yaw) {
    this.hFov = 92;
    this.camera.position.set(pos.x, EYE, pos.y);
    this.camera.rotation.set(0, 0, 0);
    // The walker's forward is (sin yaw, cos yaw) in room space. A camera
    // rotated by yaw alone looks down (-sin, -cos) — precisely backwards,
    // which is why W walked away from wherever you were facing. The half
    // turn reconciles three.js looking down -Z with the room's convention.
    this.camera.rotateY(yaw + Math.PI);
  }

  /**
   * The cups in your hands, held in front of the camera.
   *
   * Parented to the camera rather than placed in the world, so they ride
   * along with the view instead of being chased by it. It is a small thing
   * and it is most of what makes carrying feel like carrying: the drinks are
   * yours until you give them to somebody.
   */
  setCarry (n) {
    // build() empties the scene, and the camera — which the cups hang off —
    // goes with it. Put it back rather than silently rendering nothing.
    if (this.camera.parent !== this.scene) this.scene.add(this.camera);
    if (!this.carry) {
      this.carry = new THREE.Group();
      // Low and slightly forward — held at chest height, in shot but not in
      // the way of the room.
      this.carry.position.set(0, -30, -62);
      this.camera.add(this.carry);
      this.carryCups = [];
      for (let i = 0; i < 4; i++) {
        const cup = new THREE.Group();
        cup.add(cupMesh());
        cup.position.set((i % 2 ? 1 : -1) * 8, (i > 1 ? 1 : 0), (i > 1 ? -9 : 0));
        cup.scale.setScalar(0.78);
        cup.visible = false;
        this.carry.add(cup);
        this.carryCups.push(cup);
      }
      const tray = new THREE.Mesh(new THREE.BoxGeometry(30, 2.5, 24), mat(0x8a5a34));
      tray.position.y = -2;
      this.carry.add(tray);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(33, 3.5, 27), mat(0x6f4a2c));
      lip.position.y = -3.6;
      this.carry.add(lip);
      this.carryTray = tray;
      // Tipped toward the camera so the cups read as cups, not as discs.
      this.carry.rotation.x = 0.46;
    }
    this.carry.visible = n > 0;
    for (let i = 0; i < this.carryCups.length; i++) {
      this.carryCups[i].visible = i < n;
    }
    // A gentle bob so it does not look welded to the screen.
    this.carry.rotation.z = Math.sin(performance.now() / 620) * 0.035;
    this.carry.position.y = -30 + Math.sin(performance.now() / 480) * 0.8;
  }

  /**
   * Stand where the visitor stands. t runs 0..1 along the route they walked,
   * so the camera goes exactly where the simulation said they went, including
   * stopping at the point where it became too much.
   */
  setWalkCamera (path, t) {
    this.hFov = 88;
    if (!path || path.length < 2) return;
    const f = Math.max(0, Math.min(0.999, t)) * (path.length - 1);
    const i = Math.floor(f);
    const a = path[i], b = path[Math.min(path.length - 1, i + 1)];
    const k = f - i;
    const x = a.x + (b.x - a.x) * k;
    const z = a.y + (b.y - a.y) * k;

    // Look a little way further along rather than at the next sample, or the
    // view jitters with every grid step.
    const ahead = path[Math.min(path.length - 1, i + 12)];
    this.camera.position.set(x, EYE, z);
    // At the end of the route the lookahead collapses onto the camera and
    // the walk finishes nose-to-wall. Turn and face the way you came: the
    // room you tried to cross is the thing worth looking at when it ends.
    if (Math.hypot(ahead.x - x, ahead.y - z) < 30) {
      const back = path[Math.max(0, i - 16)];
      this.camera.lookAt(back.x, EYE, back.y);
      return;
    }
    // Level. A short lookahead plus any downward offset pitches the view
    // straight into the floor, which is most of what you then see.
    this.camera.lookAt(ahead.x, EYE, ahead.y);
  }

  /* ---------------------------------------------------------------- */

  /**
   * Two finishes over the same geometry.
   *
   * 'crisp' renders the low-poly scene at full resolution: clean edges, flat
   * faces, hard shadows. 'pixel' is the 216-line buffer with ordered dither.
   * The models never change — the pixel look was always only a post-process,
   * which is why this toggle costs nothing and belongs in settings rather
   * than in the bin.
   */
  /**
   * Lock the horizontal field of view rather than the vertical one.
   *
   * Three.js takes a vertical fov, so in a portrait window a fixed 68 gives
   * roughly 57 degrees across — which at eye height in a small room feels
   * like walking around with your head in a box. Deriving vertical from a
   * target horizontal keeps the view honest at any window shape.
   */
  applyFov (aspect, horizontalDeg) {
    const h = horizontalDeg * Math.PI / 180;
    const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(0.35, aspect));
    // Cap the vertical hard.
    //
    // A portrait window turned a 78-degree horizontal into 104 vertical, and
    // at eye height that means half the screen is ceiling — the empty band
    // across the top that kept getting reported as a void. In a tall window
    // you cannot have both; a narrower horizontal is the honest trade, and it
    // is what every first-person game does on a phone.
    const deg = Math.min(V_FOV_MAX, v * 180 / Math.PI);
    if (Math.abs(deg - this.camera.fov) > 0.4) {
      this.camera.fov = deg;
      this.camera.updateProjectionMatrix();
    }
  }

  setStyle (style) {
    this.styleMode = style;
    this.rw = null;   // force the next resize to re-run
    this.canvas.classList.toggle('pixelated', style === 'pixel');
  }

  resize () {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    // A hidden canvas has no layout box, so this runs with zeroes and the
    // aspect comes out NaN. Sizing a render target to NaN silently collapses
    // it to zero width and the whole view goes black with no error anywhere.
    if (w < 2 || h < 2) return;
    const aspect = w / h;

    if ((this.styleMode ?? 'crisp') === 'crisp') {
      // Full resolution, capped so a 5K display does not pay for pixels the
      // art style cannot use.
      const scale = Math.min(1, 1920 / w);
      const rw = Math.round(w * scale), rh = Math.round(h * scale);
      if (rw !== this.rw || rh !== this.rh) {
        this.rw = rw; this.rh = rh;
        this.renderer.setSize(rw, rh, false);
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
      }
      this.applyFov(aspect, this.hFov ?? 78);
      return;
    }

    // Pixel: keep the grid square by fixing height and letting width follow.
    const rw = Math.round(RENDER_H * aspect);
    if (rw !== this.rw || this.rh !== RENDER_H) {
      this.rw = rw; this.rh = RENDER_H;
      this.renderer.setSize(rw, RENDER_H, false);
      this.target.setSize(rw, RENDER_H);
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    this.applyFov(aspect, this.hFov ?? 78);
  }

  render () {
    this.resize();
    if ((this.styleMode ?? 'crisp') === 'crisp') {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
