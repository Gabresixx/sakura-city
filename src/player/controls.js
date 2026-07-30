import * as THREE from 'three';
import { L } from '../world/layout.js';

/**
 * First-person exploration.
 *
 * Deliberately gentle: modest speed, real acceleration and damping, a small
 * head bob that scales with pace, and smoothed mouse look. The brief asked for
 * smooth movement and a moderate field of view, and those two things together
 * are most of what separates "walking through a place" from "flying a camera".
 *
 * There is also a cinematic dolly (press C) that glides down the street and
 * pauses at the crossing — for when you just want to watch.
 */

const UP = new THREE.Vector3(0, 1, 0);

export class Explorer {
  constructor(camera, dom, { colliders, crossing } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.colliders = colliders || { circles: [], boxes: [] };
    this.crossing = crossing;

    this.position = new THREE.Vector3(...L.spawn);
    this.velocity = new THREE.Vector3();
    this.yaw = L.spawnYaw;
    this.pitch = -0.02;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;

    this.walkSpeed = 2.55;
    this.runSpeed = 4.7;
    this.locked = false;
    this.cinematic = false;
    this._bob = 0;
    this._bobAmount = 0;
    this._cineT = 0;
    this._keys = new Set();
    /** Live `{ x, y, run }` from the on-screen stick, if there is one. */
    this._stick = null;
    /** Heading the gyro's relative rotation is applied on top of. */
    this.yawBase = this.yaw;
    this.gyro = null;

    this._bind();
  }

  // ---- input --------------------------------------------------------------

  _bind() {
    const onKey = (e, down) => {
      const k = e.code;
      if (down) {
        this._keys.add(k);
        if (k === 'KeyC') this.toggleCinematic();
      } else {
        this._keys.delete(k);
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown',
        'ArrowLeft', 'ArrowRight'].includes(k)) {
        e.preventDefault();
        if (down) this.cinematic = false;
      }
    };
    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));

    // Pointer lock is a desktop concept; on a phone it either no-ops or throws,
    // and the on-screen controls handle input instead.
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (!coarse && this.dom.requestPointerLock) {
      this.dom.addEventListener('click', () => {
        if (!this.locked) this.dom.requestPointerLock();
      });
    }
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look(e.movementX * 0.0021, e.movementY * 0.0021);
    });

    // Touch input arrives from the on-screen UI (src/ui/touch.js) via
    // `setTouchSource` and `look`, so nothing here listens for it directly.
  }

  /**
   * Point the touch stick at this Explorer. `source` is a live object with
   * `{ x, y, run }`, written by the on-screen control every frame.
   */
  setTouchSource(source) { this._stick = source; }

  /** Drag or mouse look, in radians. Re-bases the gyro rather than fighting it. */
  look(dx, dy) {
    this.cinematic = false;
    if (this.gyro?.active) {
      // With the gyro on, dragging turns your *body*: it moves the reference
      // heading, and the device keeps supplying the offset from it.
      this.yawBase -= dx;
      return;
    }
    this.targetYaw -= dx;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - dy, -1.15, 1.05);
  }

  /** Attach a Gyro instance; look control switches to it whenever it is live. */
  attachGyro(gyro) {
    this.gyro = gyro;
    gyro.onChange = (active) => {
      // Entering gyro mode, keep the view you already had; leaving it, keep
      // the view the device left you with.
      if (active) this.yawBase = this.targetYaw;
      else this.targetYaw = this.yaw;
      this.onGyroChange?.(active);
    };
  }

  toggleCinematic() {
    this.cinematic = !this.cinematic;
    if (this.cinematic) this._cineT = 0;
    this.onCinematic?.(this.cinematic);
  }

  // ---- movement -----------------------------------------------------------

  _wish() {
    const k = this._keys;
    let f = 0, r = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) r += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) r -= 1;

    let run = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this._stick) {
      f -= this._stick.y;      // screen-down on the stick is backwards
      r += this._stick.x;
      run = run || this._stick.run;
    }
    const len = Math.hypot(f, r);
    if (len > 1) { f /= len; r /= len; }
    return { f, r, run };
  }

  /**
   * Push the player out of anything solid. Circles cover poles, machines and
   * post boxes; boxes cover the building line and the lowered barrier arms.
   */
  _resolve(p) {
    // The street corridor. Past the pavement is private property.
    p.x = THREE.MathUtils.clamp(p.x, -L.walkLimit, L.walkLimit);
    p.z = THREE.MathUtils.clamp(p.z, L.zMin + 6, L.zMax - 6);

    for (const c of this.colliders.circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 0.32;
      if (d < min && d > 1e-4) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
    for (const box of this.colliders.boxes) {
      if (box.active && !box.active()) continue;
      const { x0, x1, z0, z1 } = box;
      if (p.x > x0 - 0.3 && p.x < x1 + 0.3 && p.z > z0 - 0.3 && p.z < z1 + 0.3) {
        // Eject along whichever axis needs the least correction.
        const dl = Math.abs(p.x - (x0 - 0.3)), dr = Math.abs(p.x - (x1 + 0.3));
        const db = Math.abs(p.z - (z0 - 0.3)), df = Math.abs(p.z - (z1 + 0.3));
        const min = Math.min(dl, dr, db, df);
        if (min === dl) p.x = x0 - 0.3;
        else if (min === dr) p.x = x1 + 0.3;
        else if (min === db) p.z = z0 - 0.3;
        else p.z = z1 + 0.3;
      }
    }
    return p;
  }

  update(dt) {
    const step = Math.min(dt, 1 / 30);

    if (this.cinematic) {
      this._updateCinematic(step);
    } else {
      const { f, r, run } = this._wish();
      const speed = run ? this.runSpeed : this.walkSpeed;

      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      // forward × up is already screen-right in a right-handed frame.
      const right = new THREE.Vector3().crossVectors(forward, UP);
      const wish = new THREE.Vector3()
        .addScaledVector(forward, f)
        .addScaledVector(right, r);
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

      // Critically-damped-ish approach: quick to start, quick to stop, no slide.
      const accel = wish.lengthSq() > 0 ? 13 : 11;
      this.velocity.lerp(wish, 1 - Math.exp(-accel * step));
      if (this.velocity.lengthSq() < 1e-5) this.velocity.set(0, 0, 0);

      const next = this.position.clone().addScaledVector(this.velocity, step);
      this._resolve(next);
      this.position.copy(next);
    }

    // The device, when it is driving. Yaw is the drag-adjusted base plus the
    // gyro's offset from where it was calibrated; pitch comes straight from
    // the device, because tilting the phone down should look down.
    if (this.gyro?.active && !this.cinematic) {
      this.targetYaw = this.yawBase + this.gyro.relativeYaw;
      this.targetPitch = this.gyro.pitch;
    }

    // Smoothed look. The lerp is what keeps the mouse from feeling twitchy
    // without adding perceptible lag. Gyro needs a gentler filter or hand
    // tremor shows up as jitter in the frame.
    const k = 1 - Math.exp(-(this.gyro?.active ? 14 : 26) * step);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;

    // Head bob, scaled by how fast we are actually moving.
    const speedNow = Math.hypot(this.velocity.x, this.velocity.z);
    this._bobAmount += (Math.min(speedNow / this.walkSpeed, 1.35) - this._bobAmount)
      * (1 - Math.exp(-8 * step));
    this._bob += speedNow * step * 2.5;
    const bobY = Math.sin(this._bob * 2) * 0.030 * this._bobAmount;
    const bobX = Math.sin(this._bob) * 0.018 * this._bobAmount;
    const roll = Math.sin(this._bob) * 0.006 * this._bobAmount;

    this.camera.position.set(
      this.position.x + Math.cos(this.yaw) * bobX,
      this.position.y + bobY,
      this.position.z - Math.sin(this.yaw) * bobX
    );
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(roll);

    return speedNow;
  }

  // ---- cinematic dolly ----------------------------------------------------

  /**
   * A slow push down the street that eases to a stop at the crossing, holds
   * while a train goes past, then drifts on. Keyframed by hand — a spline
   * would be smoother and much less deliberate.
   */
  _updateCinematic(dt) {
    this._cineT += dt;
    const KEYS = [
      { t: 0, p: [0.9, 1.62, -26], look: [0.2, 1.5, 4] },
      { t: 14, p: [0.9, 1.60, -6], look: [1.4, 1.7, 10] },
      { t: 24, p: [1.2, 1.62, 4], look: [4.0, 2.6, 8] },
      { t: 34, p: [0.6, 1.60, 11.5], look: [0.0, 1.6, 22] },
      { t: 48, p: [0.6, 1.60, 13.2], look: [-4.0, 2.0, 20] },
      { t: 60, p: [-1.2, 1.62, 13.0], look: [6.0, 2.2, 20] },
      { t: 74, p: [0.9, 1.62, -26], look: [0.2, 1.5, 4] },
    ];
    const total = KEYS[KEYS.length - 1].t;
    const t = this._cineT % total;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
    const a = KEYS[i], bK = KEYS[i + 1];
    const raw = (t - a.t) / (bK.t - a.t);
    const s = raw * raw * (3 - 2 * raw); // smoothstep between keys

    this.position.set(
      THREE.MathUtils.lerp(a.p[0], bK.p[0], s),
      THREE.MathUtils.lerp(a.p[1], bK.p[1], s),
      THREE.MathUtils.lerp(a.p[2], bK.p[2], s)
    );
    const look = new THREE.Vector3(
      THREE.MathUtils.lerp(a.look[0], bK.look[0], s),
      THREE.MathUtils.lerp(a.look[1], bK.look[1], s),
      THREE.MathUtils.lerp(a.look[2], bK.look[2], s)
    );
    const dir = look.sub(this.position);
    this.targetYaw = Math.atan2(-dir.x, -dir.z);
    this.targetPitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    this.velocity.set(0, 0, 0);
  }
}
