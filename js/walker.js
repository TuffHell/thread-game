/**
 * Walking the room yourself.
 *
 * WASD to move, mouse or arrow keys to look. Collision against the same
 * blocked grid the visitor's pathfinder uses, so if you cannot squeeze
 * between the counter and the wall, neither can she.
 *
 * The design rule this file exists to protect: there are no coping tools in
 * here. You cannot equip anything, brace, or push through. All you can do is
 * be in the room and notice. The fix is always in Plan mode, always to the
 * building, never to the person. A "hold your breath" button would make this
 * a game about enduring bad rooms; its absence makes it a game about seeing
 * why they are bad.
 */

import { KINDS } from './room.js';

/** Things you cannot walk through on foot. */
const SOLID = new Set([
  'counter', 'seat', 'chair', 'shelf', 'booth', 'soft', 'machine',
  'grinder', 'bin', 'pot', 'screen', 'customer', 'menu'
]);

const SPEED = 210;          // cm per second, an unhurried walk
const TURN = 2.4;           // radians per second on the arrow keys
const RADIUS = 22;          // shoulder room for collision

export class Walker {
  constructor () {
    this.keys = new Set();
    this.reset({ x: 0, y: 0 }, 0);
  }

  reset (pos, yaw = 0) {
    this.x = pos.x;
    this.y = pos.y;
    this.yaw = yaw;
    this.keys.clear();
  }

  /** Face from the door toward whatever the room's goal is. */
  faceFrom (from, to) {
    this.yaw = Math.atan2(to.x - from.x, to.y - from.y);
  }

  down (code) { this.keys.add(code); }
  up (code) { this.keys.delete(code); }
  lookBy (dx) { this.yaw -= dx * 0.0032; }

  /**
   * Would this point put us inside something?
   *
   * The blocked grid only knows about walls and the counter, because that is
   * all the visitor's pathfinder needs. A person on foot also has to not walk
   * through tables, chairs, shelves and other people, so furniture is checked
   * directly. Walking through a table is the single fastest way to tell a
   * player that none of this is real.
   */
  free (grid, x, y, room) {
    for (const [ox, oy] of [[0, 0], [RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]) {
      const i = grid.at(x + ox, y + oy);
      if (grid.blocked[i]) return false;
    }
    if (!room) return true;
    for (const t of room.things) {
      if (!t.placed || !SOLID.has(t.kind)) continue;
      const d = KINDS[t.kind];
      if (Math.hypot(x - t.x, y - t.y) < (d?.solidR ?? d?.r ?? 20) + RADIUS * 0.5) return false;
    }
    return true;
  }

  update (dt, room, grid) {
    const k = this.keys;
    if (k.has('ArrowLeft')) this.yaw += TURN * dt / 1000;
    if (k.has('ArrowRight')) this.yaw -= TURN * dt / 1000;

    let fwd = 0, strafe = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyA')) strafe -= 1;
    if (k.has('KeyD')) strafe += 1;
    if (!fwd && !strafe) return false;

    const len = Math.hypot(fwd, strafe) || 1;
    const step = SPEED * dt / 1000;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);

    // Forward is (sin, cos). The camera is rotated by yaw + PI, so its local
    // +X — what the player sees as right — lands on (-cos, sin). Strafing by
    // (cos, -sin) is exactly backwards, which is why D walked left.
    const dx = (sin * fwd / len - cos * strafe / len) * step;
    const dy = (cos * fwd / len + sin * strafe / len) * step;

    // Axis-separated so sliding along a wall works instead of sticking.
    const nx = Math.max(20, Math.min(room.w - 20, this.x + dx));
    if (this.free(grid, nx, this.y, room)) this.x = nx;
    const ny = Math.max(20, Math.min(room.h - 20, this.y + dy));
    if (this.free(grid, this.x, ny, room)) this.y = ny;
    return true;
  }

  get pos () { return { x: this.x, y: this.y }; }
}
