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

export const RENDER_W = 480;
export const RENDER_H = 270;
const EYE = 158;              // centimetres, average standing eye height
const WALL_H = 285;

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

// Cool, slightly desaturated, with warm accents held back for light sources.
// Kept small on purpose: a tight palette is most of what reads as authored.
const PAL = {
  floor:      0xc9a179,
  floorAlt:   0xd6b088,
  wallTile:   0xe4e0d2,
  wallGlass:  0xa8d2dd,
  wallBrick:  0xc07a56,
  wallWood:   0xc08f52,
  wallPlaster:0xdcd3bd,
  wallAcoustic:0x7d9b84,
  ceiling:    0xf3ead8,
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

    this.addOutside(room);

    for (const t of room.things) if (t.placed) this.addThing(t);

    // Light. Kept few and hard, because soft global illumination reads as
    // mush once you are down at this resolution.
    s.add(new THREE.AmbientLight(0xffeedd, 2.0));
    s.add(new THREE.HemisphereLight(0xfff3e0, 0xb08a63, 1.3));
    const key = new THREE.DirectionalLight(0xffe9c4, 1.8);
    key.position.set(cx - 400, 900, cz - 500);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
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
      case 'seat':
        g.add(cyl(6, 72, PAL.metal));
        g.add(cyl(D.r * 0.8, 6, PAL.wallWood, 72, 10));
        break;
      case 'door':
        g.add(box(D.r * 1.8, 205, 8, PAL.wood, 0));
        g.add(box(D.r * 1.4, 120, 4, PAL.wallGlass, 70));
        break;

      case 'chair': {
        g.add(cyl(4, 42, PAL.metal, 0, 6).clone());
        g.add(box(34, 5, 34, PAL.wood, 42));
        g.add(box(34, 34, 5, PAL.wood, 47));
        g.children.at(-1).position.z = -14;
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

      default:
        g.add(box(D.r, 60, D.r, PAL.metal));
    }

    g.position.set(t.x, 0, t.y);
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
    const col = c => new THREE.MeshLambertMaterial({ color: c });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(24, 62, 16), col(PAL.dark));
    legs.position.y = 31;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(30, 52, 20), col(PAL.coat));
    torso.position.y = 88;
    const head = new THREE.Mesh(new THREE.BoxGeometry(22, 22, 20), col(PAL.skin));
    head.position.y = 126;
    const hair = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 22), col(0x4a3327));
    hair.position.y = 138;

    for (const m of [legs, torso, head, hair]) { m.castShadow = true; g.add(m); }

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
    const deg = Math.min(110, v * 180 / Math.PI);
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
