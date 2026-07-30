import * as THREE from 'three';
import { LIGHT } from '../core/palette.js';
import { createSky } from '../core/sky.js';
import { buildRoad, buildBackdrop } from './road.js';
import { buildRailway } from './railway.js';
import { createTrain } from './train.js';
import { buildBuildings } from './buildings.js';
import { buildSakura, createPetals } from './sakura.js';
import { buildProps } from './props.js';
import { L, onTracks } from './layout.js';

const FOG = { color: 0xe9e2ee, near: 52, far: 215 };

/** Meshes whose material asked to be left out of the outline pass. */
function collectNoInk(root) {
  const out = [];
  root.traverse((o) => { if (o.isMesh && o.material?.userData?.noInk) out.push(o); });
  return out;
}

/**
 * Assembles the world and keeps it running.
 *
 * The one piece of real machinery here is the director: it decides when a
 * train comes, arms the crossing far enough ahead that the bell and the
 * barriers have time to do their thing, and steers the audio from the train's
 * position relative to the camera. Everything the street does — the flashing,
 * the waiting, the rush of air — hangs off that clock.
 */

export function buildWorld() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);

  // ---- light --------------------------------------------------------------
  const sunPos = new THREE.Vector3(...LIGHT.sunPosition);
  const sun = new THREE.DirectionalLight(LIGHT.sun, LIGHT.sunIntensity);
  sun.position.copy(sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.035;
  // 46m either side of the player. Smaller looked crisper up close, but the
  // hard line where shadows simply stopped — right about where the crossing
  // sits — was far more obvious than the extra 2cm of texel size.
  const EXTENT = 46;
  Object.assign(sun.shadow.camera, {
    left: -EXTENT, right: EXTENT, top: EXTENT, bottom: -EXTENT,
  });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  scene.add(new THREE.HemisphereLight(LIGHT.skyFill, LIGHT.groundFill, LIGHT.hemiIntensity));
  scene.add(new THREE.AmbientLight(LIGHT.ambient, LIGHT.ambientIntensity));

  const sky = createSky(sunPos);
  scene.add(sky);

  // ---- geometry -----------------------------------------------------------
  const timed = (label, fn) => {
    const t = performance.now();
    const out = fn();
    console.info(`[sakura]   ${label}: ${(performance.now() - t).toFixed(0)}ms`);
    return out;
  };
  const road = timed('road', buildRoad);
  const backdrop = timed('backdrop', buildBackdrop);
  const { group: railwayGroup, crossing } = timed('railway', buildRailway);
  const buildings = timed('buildings', buildBuildings);
  const sakura = timed('sakura', buildSakura);
  const props = timed('props', buildProps);
  scene.add(road, backdrop, railwayGroup, buildings, sakura, props);

  const petals = createPetals({ count: 2600, size: [70, 24, 70], fog: FOG });
  scene.add(petals.mesh);

  const trains = [createTrain({ cars: 4 }), createTrain({ cars: 4, livery: 0x4e9d5c })];
  for (const t of trains) scene.add(t.group);

  // ---- collision ----------------------------------------------------------
  const POLE_X = L.roadHalf + L.kerbW + 1.05;
  const circles = [];
  for (const z of [-64, -52, -40, -28, -16, -4, 8, 28, 40, 52, 62]) {
    circles.push({ x: POLE_X, z, r: 0.2 });
  }
  for (const z of [-58, -34, -10, 14, 34, 56]) circles.push({ x: -POLE_X, z, r: 0.2 });
  for (const z of [7.7, 9.0, 10.1]) circles.push({ x: POLE_X - 0.35, z, r: 0.55 });
  circles.push({ x: POLE_X - 0.1, z: -20.5, r: 0.35 });          // post box
  circles.push({ x: -(POLE_X - 0.2), z: -26, r: 0.5 });          // notice board
  circles.push({ x: -(L.roadHalf + 1.1), z: L.gateNear - 5.2, r: 0.25 });
  circles.push({ x: L.roadHalf + 1.15, z: 44, r: 0.25 });

  // The barrier arms are only solid once they are most of the way down —
  // which means you can just make it across if you run.
  const armDown = () => crossing.down > 0.55;
  const boxes = [
    { x0: -6, x1: 6, z0: L.gateNear - 0.25, z1: L.gateNear + 0.25, active: armDown },
    { x0: -6, x1: 6, z0: L.gateFar - 0.25, z1: L.gateFar + 0.25, active: armDown },
  ];

  // ---- shadow follow ------------------------------------------------------
  const sunDir = sunPos.clone().normalize();
  const texel = (EXTENT * 2) / 2048;
  function trackShadow(focus) {
    // Snap the focus to the shadow map's own texel grid, otherwise the whole
    // shadow crawls and shimmers as you walk.
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx + sunDir.x * 100, sunDir.y * 100, fz + sunDir.z * 100);
    sun.target.updateMatrixWorld();
  }

  return {
    scene, sky, crossing, petals, trains, sun,
    colliders: { circles, boxes },
    trackShadow,
    /**
     * Objects the ink pass must not see — either they have no meaningful
     * normals (sky, petals, flat backdrop) or they are alpha-cut detail whose
     * outlines would be pure noise (blossom sprays).
     */
    inkExclude: [sky, petals.mesh, backdrop, ...collectNoInk(sakura)],
  };
}

/**
 * Decides when trains come and keeps the crossing, the bell and the rumble in
 * step with them.
 */
export class Director {
  constructor(world, audio) {
    this.world = world;
    this.audio = audio;
    this.timer = 9;          // first train arrives soon enough to be seen
    this.flip = 0;
    this._handles = new Map();
    this._clack = 0;

    world.crossing.onBell = (phase) => this.audio?.bell(phase, 0.14);
  }

  update(dt, camera) {
    const { trains } = this.world;

    this.timer -= dt;
    if (this.timer <= 0) {
      // Safety interlock: never dispatch while someone is standing on the
      // crossing. Retry shortly rather than losing the slot, so stepping off
      // is followed by a train a few seconds later instead of a long silence.
      if (onTracks(camera.position)) {
        this.timer = 2.5;
        this._step(dt, camera);
        return;
      }
      const free = trains.find((t) => !t.active);
      if (free) {
        const dir = this.flip % 2 === 0 ? 1 : -1;
        free.launch({
          dir,
          trackZ: dir > 0 ? L.trackA : L.trackB,
          speed: 20 + Math.random() * 6,
          from: 215,
        });
        this._handles.set(free, this.audio?.trainStart() ?? null);
        this.flip++;

        // Now and then, send one the other way a beat later so they pass
        // right in front of you.
        const other = trains.find((t) => t !== free && !t.active);
        if (other && Math.random() < 0.3) {
          setTimeout(() => {
            if (other.active) return;
            other.launch({
              dir: -dir, trackZ: dir > 0 ? L.trackB : L.trackA,
              speed: 20 + Math.random() * 6, from: 215,
            });
            this._handles.set(other, this.audio?.trainStart() ?? null);
          }, 2600 + Math.random() * 2600);
        }
      }
      this.timer = 26 + Math.random() * 22;
    }
    this._step(dt, camera);
  }

  /** Advance whatever is already running: trains, audio, and the crossing. */
  _step(dt, camera) {
    const { crossing, trains } = this.world;

    // The crossing stays armed while any train is inbound or still clearing.
    let blocking = false;
    for (const t of trains) {
      if (!t.active) continue;
      t.update(dt);
      const x = t.group.position.x;
      const dir = t.group.rotation.y === 0 ? 1 : -1;
      const tail = x - dir * (t.length / 2);
      if (dir * tail < 34) blocking = true;

      const handle = this._handles.get(t);
      if (handle) {
        const d = t.group.position.distanceTo(camera.position);
        const level = THREE.MathUtils.clamp(1 - (d - 12) / 105, 0, 1) ** 1.6;
        // Pan from the train's position in camera space.
        const local = t.group.position.clone().project(camera);
        handle.set(level, THREE.MathUtils.clamp(local.x, -1, 1), Math.abs(dir * 22));
        this._clack -= dt;
        if (this._clack <= 0 && level > 0.05) {
          this._clack = 0.34 + Math.random() * 0.12;
          this.audio?.clack(level * 0.10, THREE.MathUtils.clamp(local.x, -1, 1));
        }
      }
      if (!t.active && handle) {
        handle.stop();
        this._handles.delete(t);
      }
    }
    for (const [t, h] of this._handles) {
      if (!t.active && h) { h.stop(); this._handles.delete(t); }
    }

    crossing.setActive(blocking);
    crossing.update(dt);
  }
}
