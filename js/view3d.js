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
import { def, KINDS, MATERIALS } from './room.js';

export const RENDER_W = 384;
export const RENDER_H = 216;
const EYE = 158;              // centimetres, average standing eye height
const WALL_H = 285;

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

// Cool, slightly desaturated, with warm accents held back for light sources.
// Kept small on purpose: a tight palette is most of what reads as authored.
const PAL = {
  floor:      0xb9ae9c,
  floorAlt:   0xc6bba7,
  wallTile:   0xd6dde2,
  wallGlass:  0x9fc6d4,
  wallBrick:  0xb07a63,
  wallWood:   0xb08757,
  wallPlaster:0xc3c0b6,
  wallAcoustic:0x6b8079,
  ceiling:    0xe8e4da,
  sky:        0x9fb6c4,
  metal:      0xb9c2c9,
  dark:       0x4a5259,
  warm:       0xf0b96a,
  cool:       0x7fd4c1,
  seat:       0xa87c5c,
  plant:      0x6f9c62
};

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
    this.scene.fog = new THREE.Fog(PAL.sky, 900, 3400);

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

    for (const t of room.things) if (t.placed) this.addThing(t);

    // Light. Kept few and hard, because soft global illumination reads as
    // mush once you are down at this resolution.
    s.add(new THREE.AmbientLight(0xdfe6f0, 2.2));
    s.add(new THREE.HemisphereLight(0xf2f6ff, 0xa89b86, 1.1));
    const key = new THREE.DirectionalLight(0xfff4e2, 1.5);
    key.position.set(cx - 400, 900, cz - 500);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const d = Math.max(room.w, room.h);
    Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 10, far: 2600 });
    key.shadow.camera.updateProjectionMatrix();
    s.add(key);

    this.refreshLights();
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
    }
  }

  /** A low-poly, chunky shape per kind. Readable at 384 wide is the only bar. */
  addThing (t) {
    const D = def(t);
    const g = new THREE.Group();
    const col = c => new THREE.MeshLambertMaterial({ color: c });
    const box = (w, h, d2, c, y = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d2), col(c));
      m.position.y = y + h / 2;
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };
    const cyl = (r, h, c, y = 0, seg = 8) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), col(c));
      m.position.y = y + h / 2;
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };

    switch (t.kind) {
      case 'counter':
        g.add(box(D.r * 2, 105, D.r * 1.3, PAL.wallWood));
        g.add(box(D.r * 2.1, 8, D.r * 1.4, PAL.metal, 105));
        break;
      case 'grinder':
        g.add(box(34, 30, 30, PAL.dark));
        g.add(cyl(13, 46, PAL.metal, 30));
        g.add(new THREE.Mesh(new THREE.ConeGeometry(16, 26, 8), col(PAL.dark)))
          .children.at(-1).position.y = 89;
        break;
      case 'machine':
        g.add(box(58, 52, 40, PAL.metal));
        g.add(box(20, 16, 12, PAL.dark, 52));
        break;
      case 'speaker':
        g.add(box(24, 34, 20, PAL.dark, 190));
        break;
      case 'fluorescent':
        g.add(box(D.r * 2, 8, 34, 0xf2f6ff, WALL_H - 26));
        break;
      case 'lamp':
        g.add(cyl(4, 120, PAL.metal));
        g.add(cyl(18, 20, PAL.warm, 120, 8));
        break;
      case 'window':
        g.add(box(14, 150, D.r * 2, PAL.wallGlass, 90));
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
      case 'seat':
        g.add(cyl(6, 72, PAL.metal));
        g.add(cyl(D.r * 0.8, 6, PAL.wallWood, 72, 10));
        break;
      case 'door':
        g.add(box(D.r * 1.8, 205, 8, 0x3c4652, 0));
        break;
      default:
        g.add(box(D.r, 60, D.r, PAL.metal));
    }

    g.position.set(t.x, 0, t.y);
    g.userData.thingId = t.id;
    this.scene.add(g);
    this.thingMeshes.set(t.id, g);
  }

  /** Cheap per-frame sync so dragging in plan view moves the 3D object too. */
  sync (room) {
    for (const t of room.things) {
      const m = this.thingMeshes.get(t.id);
      if (!t.placed) { if (m) { this.scene.remove(m); this.thingMeshes.delete(t.id); } continue; }
      if (!m) { this.addThing(t); continue; }
      m.position.set(t.x, 0, t.y);
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
    this.floor.material.map = on ? this.heatTex : null;
    this.floor.material.color.set(on ? 0xffffff : PAL.floor);
    this.floor.material.needsUpdate = true;
  }

  setPlanCamera (yaw = -Math.PI / 4, pitch = 0.95, dist = 1.55) {
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
   * Stand where the visitor stands. t runs 0..1 along the route they walked,
   * so the camera goes exactly where the simulation said they went, including
   * stopping at the point where it became too much.
   */
  setWalkCamera (path, t) {
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
    // Level. A short lookahead plus any downward offset pitches the view
    // straight into the floor, which is most of what you then see.
    this.camera.lookAt(ahead.x, EYE, ahead.y);
  }

  /* ---------------------------------------------------------------- */

  resize () {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    // A hidden canvas has no layout box, so this runs with zeroes and the
    // aspect comes out NaN. Sizing a render target to NaN silently collapses
    // it to zero width and the whole view goes black with no error anywhere.
    if (w < 2 || h < 2) return;
    const aspect = w / h;
    // Keep the pixel grid square by fixing height and letting width follow.
    const rw = Math.round(RENDER_H * aspect);
    if (rw !== this.rw) {
      this.rw = rw;
      this.renderer.setSize(rw, RENDER_H, false);
      this.target.setSize(rw, RENDER_H);
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }

  render () {
    this.resize();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
