import * as THREE from 'three';
import { Builder, mulberry32, range } from '../core/geo.js';
import { toon, RAMP } from '../core/materials.js';
import { crossingWarning } from '../core/paint.js';
import { C } from '../core/palette.js';
import { L } from './layout.js';

/**
 * The railway, and the level crossing that gives the scene its clock.
 *
 * Everything static is merged. The two barrier arms and the four warning
 * lamps stay live, because the whole street is choreographed around them:
 * lamps start flashing, arms come down, a train tears through, arms lift.
 */

const TRACK_X0 = -160;
const TRACK_X1 = 160;

function lampMaterial() {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false });
  m.color.setRGB(0.30, 0.05, 0.05);
  return m;
}

/**
 * One barrier post: mast, motor housing, striped arm, lamps, warning plate.
 *
 * The signal always faces local −Z (the traffic it warns), while the arm can
 * swing either way. Mirroring the arm with a nested Y-flip instead of a
 * negative scale keeps the winding order — and therefore the lighting — intact.
 */
function buildGate(matSet, { armDir = 1 } = {}) {
  const g = new THREE.Group();
  const { pole, black, yellow, plateWarn, metal, white } = matSet;

  const b = new Builder('gate-static');
  // Foundation and mast.
  b.boxOn(metal, { p: [0, 0, 0], s: [0.46, 0.12, 0.46] });
  b.cyl(pole, { p: [0, 0.75, 0], r: 0.075, h: 1.4, seg: 10 });
  // Motor housing the arm pivots out of.
  b.box(metal, { p: [0, 1.42, 0], s: [0.34, 0.46, 0.30] });
  b.box(black, { p: [0, 1.66, 0], s: [0.38, 0.06, 0.34] });

  // Signal mast carrying the lamps and the crossbuck.
  b.cyl(pole, { p: [0.0, 2.1, -0.34], r: 0.055, h: 3.0, seg: 8 });

  // 踏切警標 — the yellow saltire above the lamps.
  for (const rz of [Math.PI / 4, -Math.PI / 4]) {
    b.box(yellow, { p: [0, 3.62, -0.34], s: [1.16, 0.13, 0.05], rz });
    b.box(black, { p: [0, 3.62, -0.325], s: [1.20, 0.035, 0.052], rz });
  }
  // Lamp head casing.
  b.box(black, { p: [0, 3.02, -0.36], s: [0.94, 0.30, 0.14] });
  b.box(black, { p: [0, 3.20, -0.36], s: [1.00, 0.06, 0.20] });
  // Hoods over each lens.
  for (const sx of [-1, 1]) {
    b.cyl(black, {
      p: [sx * 0.24, 3.02, -0.44], r: 0.135, r2: 0.155, h: 0.09, seg: 12,
      rx: Math.PI / 2, open: true,
    });
  }
  // Warning bell.
  b.cyl(metal, { p: [0, 2.62, -0.36], r: 0.13, h: 0.16, seg: 12 });
  b.sphere(metal, { p: [0, 2.53, -0.36], r: 0.13, w: 10, hs: 5 });
  // 踏切注意 plate.
  b.box(plateWarn, { p: [0, 2.22, -0.40], s: [0.56, 0.56, 0.03] });
  b.box(black, { p: [0, 2.22, -0.385], s: [0.60, 0.60, 0.02] });

  g.add(b.build());

  // ---- lamps (live) -------------------------------------------------------
  const lamps = [];
  for (const sx of [-1, 1]) {
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.115, 16),
      lampMaterial()
    );
    lens.position.set(sx * 0.24, 3.02, -0.492);
    lens.rotation.y = Math.PI;
    g.add(lens);
    lamps.push(lens.material);
  }

  // ---- the arm (live) -----------------------------------------------------
  const mount = new THREE.Group();
  mount.position.set(0.0, 1.42, -0.02);
  if (armDir < 0) mount.rotation.y = Math.PI;
  g.add(mount);

  const pivot = new THREE.Group();
  mount.add(pivot);

  const arm = new Builder('gate-arm');
  // Long enough to actually close the road. The post stands just off the kerb
  // on one side, so the arm has to reach past the far kerb on the other —
  // anything shorter leaves a gap a car could drive through, which is exactly
  // what a barrier is not for.
  const LEN = 7.0;
  arm.box(metal, { p: [0.10, 0, 0], s: [0.34, 0.18, 0.16] });
  // Counterweight behind the pivot balances the look of the arm.
  arm.box(black, { p: [-0.30, -0.04, 0], s: [0.26, 0.22, 0.22] });
  arm.cyl(metal, { p: [-0.30, -0.26, 0], r: 0.10, h: 0.30, seg: 10 });

  // Hazard stripes: 40cm bands, yellow first at the root.
  const band = 0.42;
  for (let x = 0.24, i = 0; x < LEN; x += band, i++) {
    const w = Math.min(band, LEN - x);
    arm.box(i % 2 ? black : yellow, { p: [x + w / 2, 0, 0], s: [w, 0.115, 0.075] });
  }
  // Reflector discs and the hanging skirt beneath the arm.
  for (let x = 0.6; x < LEN; x += 0.84) {
    arm.cyl(white, { p: [x, 0, 0.042], r: 0.038, h: 0.012, seg: 8, rx: Math.PI / 2 });
    arm.box(black, { p: [x, -0.14, 0], s: [0.02, 0.17, 0.02] });
    arm.box(white, { p: [x, -0.27, 0], s: [0.13, 0.11, 0.012] });
  }
  // Tip lamp.
  arm.sphere(white, { p: [LEN - 0.04, 0, 0], r: 0.05, w: 8, hs: 6 });
  pivot.add(arm.build());

  return { group: g, pivot, lamps };
}

export function buildRailway() {
  const b = new Builder('railway', { chunk: 44 });
  const rnd = mulberry32(8823);

  const matBallast = toon({ color: C.ballast, ramp: RAMP.three, rim: 0.05 });
  const matSleeper = toon({ color: C.sleeper, ramp: RAMP.three, rim: 0.08 });
  const matRail = toon({ color: C.rail, ramp: RAMP.three, rim: 0.4 });
  const matRailSide = toon({ color: C.railSide, ramp: RAMP.three, rim: 0.1 });
  const matDeck = toon({ color: C.crossingDeck, ramp: RAMP.three, rim: 0.06 });
  const matPole = toon({ color: C.signalPole, ramp: RAMP.three, rim: 0.15 });
  const matBlack = toon({ color: C.barrierBlack, ramp: RAMP.two, rim: 0.25 });
  const matYellow = toon({ color: C.barrierYellow, ramp: RAMP.three, rim: 0.2 });
  const matMetal = toon({ color: C.signalBody, ramp: RAMP.three, rim: 0.2 });
  const matWhite = toon({ color: C.roadLine, ramp: RAMP.two, rim: 0.2 });
  const matSteel = toon({ color: 0xa8a6ae, ramp: RAMP.three, rim: 0.25 });
  const matWire = toon({ color: C.wire, ramp: RAMP.two, rim: 0.35 });
  const matGrass = toon({ color: 0x8fa878, ramp: RAMP.four, rim: 0.1 });
  const matWarn = toon({
    color: 0xffffff, map: crossingWarning(), ramp: RAMP.two, rim: 0.1,
  });

  // ---- formation ----------------------------------------------------------
  // Ballast shoulder as a shallow trapezoid, so it catches light on the slope.
  const midZ = L.railZ;
  b.box(matBallast, {
    p: [0, 0.09, midZ], s: [TRACK_X1 - TRACK_X0, 0.18, L.ballastHalf * 2],
  });
  for (const sz of [-1, 1]) {
    b.box(matBallast, {
      p: [0, 0.05, midZ + sz * (L.ballastHalf + 0.32)],
      s: [TRACK_X1 - TRACK_X0, 0.1, 0.9], rx: sz * 0.28,
    });
  }
  // Weeds along the shoulder — nothing looks more like a real line-side.
  for (let i = 0; i < 340; i++) {
    const x = range(rnd, TRACK_X0 + 4, TRACK_X1 - 4);
    if (Math.abs(x) < L.crossHalfX + 1.4) continue;
    const sz = rnd() < 0.5 ? -1 : 1;
    const z = midZ + sz * range(rnd, L.ballastHalf - 0.1, L.ballastHalf + 1.5);
    b.cone(matGrass, {
      p: [x, 0.16, z], r: range(rnd, 0.07, 0.2), h: range(rnd, 0.2, 0.55),
      seg: 5, rz: range(rnd, -0.3, 0.3),
    });
  }

  // ---- track ------------------------------------------------------------
  const half = L.gauge / 2;
  for (const trackZ of [L.trackA, L.trackB]) {
    // PC sleepers. Individual sleepers stop reading past ~90m, so that is
    // where the detail stops too.
    for (let x = -95; x < 95; x += 0.62) {
      if (Math.abs(x) < L.crossHalfX) continue;
      b.box(matSleeper, { p: [x, 0.20, trackZ], s: [0.24, 0.10, 2.2] });
    }
    // Rails: a wide foot, a thin web read, and a bright head that catches sun.
    for (const sz of [-1, 1]) {
      const z = trackZ + sz * half;
      b.box(matRailSide, { p: [0, 0.255, z], s: [TRACK_X1 - TRACK_X0, 0.03, 0.13] });
      b.box(matRailSide, { p: [0, 0.28, z], s: [TRACK_X1 - TRACK_X0, 0.05, 0.035] });
      b.box(matRail, { p: [0, L.railTop, z], s: [TRACK_X1 - TRACK_X0, 0.035, 0.075] });
    }
  }

  // ---- level crossing deck -----------------------------------------------
  const deckZ0 = L.trackA - 1.3, deckZ1 = L.trackB + 1.3;
  b.box(matDeck, {
    p: [0, 0.145, (deckZ0 + deckZ1) / 2],
    s: [L.crossHalfX * 2, 0.29, deckZ1 - deckZ0],
  });
  // Deck panels: between the rails, and outside each rail. The flangeway gaps
  // between them are the giveaway detail on any crossing.
  for (const trackZ of [L.trackA, L.trackB]) {
    b.box(matDeck, { p: [0, 0.30, trackZ], s: [L.crossHalfX * 2, 0.30, L.gauge - 0.16] });
    for (const sz of [-1, 1]) {
      b.box(matDeck, {
        p: [0, 0.30, trackZ + sz * (half + 0.36)], s: [L.crossHalfX * 2, 0.30, 0.52],
      });
    }
    for (const sz of [-1, 1]) {
      const z = trackZ + sz * half;
      b.box(matRailSide, { p: [0, 0.255, z], s: [L.crossHalfX * 2, 0.06, 0.13] });
      b.box(matRail, { p: [0, L.railTop, z], s: [L.crossHalfX * 2, 0.035, 0.075] });
    }
  }
  // Panel joints across the deck.
  for (let x = -L.crossHalfX; x <= L.crossHalfX; x += 1.2) {
    b.box(matRailSide, { p: [x, 0.452, (deckZ0 + deckZ1) / 2], s: [0.03, 0.01, deckZ1 - deckZ0] });
  }
  // Ramp from asphalt up onto the deck, both approaches.
  for (const [z, sz] of [[deckZ0 - 0.35, -1], [deckZ1 + 0.35, 1]]) {
    b.box(matDeck, { p: [0, 0.13, z], s: [L.crossHalfX * 2, 0.30, 0.9], rx: sz * 0.32 });
  }

  // ---- line-side fence ----------------------------------------------------
  // Runs both sides of the formation, stopping short of the road.
  for (const sz of [-1, 1]) {
    const fz = midZ + sz * (L.ballastHalf + 1.1);
    for (let x = TRACK_X0 + 20; x < TRACK_X1 - 20; x += 1.9) {
      if (Math.abs(x) < L.crossHalfX + 0.5) continue;
      b.cyl(matSteel, { p: [x, 0.55, fz], r: 0.036, h: 1.1, seg: 6 });
    }
    for (const y of [0.36, 0.72, 1.04]) {
      for (const [x0, x1] of [[TRACK_X0 + 20, -L.crossHalfX - 0.5], [L.crossHalfX + 0.5, TRACK_X1 - 20]]) {
        b.box(matSteel, { p: [(x0 + x1) / 2, y, fz], s: [x1 - x0, 0.035, 0.035] });
      }
    }
    // Vertical mesh infill. Only near the crossing — beyond that the three
    // rails alone read identically and cost two boxes instead of a thousand.
    for (let x = -52; x < 52; x += 0.26) {
      if (Math.abs(x) < L.crossHalfX + 0.5) continue;
      b.box(matSteel, { p: [x, 0.70, fz], s: [0.012, 0.70, 0.012] });
    }
  }

  // ---- catenary -----------------------------------------------------------
  const mastZ = midZ - (L.ballastHalf + 0.55);
  const masts = [];
  for (let x = TRACK_X0 + 12; x < TRACK_X1 - 12; x += 26) {
    if (Math.abs(x) < L.crossHalfX + 3) continue;
    masts.push(x);
    b.box(matSteel, { p: [x, 0.14, mastZ], s: [0.5, 0.28, 0.5] });
    b.cyl(matSteel, { p: [x, 2.9, mastZ], r: 0.10, h: 5.5, seg: 8 });
    // Lattice bracing, just enough to break the silhouette.
    for (let y = 1.0; y < 5.4; y += 0.9) {
      b.rod(matSteel, [x - 0.09, y, mastZ], [x + 0.09, y + 0.45, mastZ], 0.018, 4);
      b.rod(matSteel, [x + 0.09, y, mastZ], [x - 0.09, y + 0.45, mastZ], 0.018, 4);
    }
    // Cantilever reaching out over both tracks.
    b.rod(matSteel, [x, 5.35, mastZ], [x, 5.35, L.trackB + 0.9], 0.055, 6);
    b.rod(matSteel, [x, 4.5, mastZ + 0.02], [x, 5.3, L.trackA], 0.035, 5);
    for (const tz of [L.trackA, L.trackB]) {
      b.cyl(matBlack, { p: [x, 5.16, tz], r: 0.055, h: 0.24, seg: 8 });
      b.cyl(matSteel, { p: [x, 4.98, tz], r: 0.02, h: 0.16, seg: 6 });
    }
  }
  // Contact and messenger wires, sagging between masts.
  for (let i = 0; i < masts.length - 1; i++) {
    const x0 = masts[i], x1 = masts[i + 1];
    if (x1 - x0 > 30) continue;
    for (const tz of [L.trackA, L.trackB]) {
      b.wire(matWire, [x0, 4.88, tz], [x1, 4.88, tz], 0.06, 0.018, 5);
      b.wire(matWire, [x0, 5.32, tz], [x1, 5.32, tz], 0.34, 0.018, 6);
    }
    b.wire(matWire, [x0, 5.8, mastZ - 0.1], [x1, 5.8, mastZ - 0.1], 0.5, 0.016, 6);
  }

  // ---- signage at the crossing -------------------------------------------
  b.box(matWarn, { p: [-L.crossHalfX - 0.3, 2.0, L.gateNear - 1.2], s: [0.6, 0.6, 0.03], ry: 0.4 });
  b.cyl(matSteel, { p: [-L.crossHalfX - 0.3, 1.0, L.gateNear - 1.2], r: 0.04, h: 2.0, seg: 6 });

  const staticGroup = b.build();

  // ---- live parts ---------------------------------------------------------
  const matSet = {
    pole: matPole, black: matBlack, yellow: matYellow,
    plateWarn: matWarn, metal: matMetal, white: matWhite,
  };
  // Left-hand traffic: the post stands on the approaching driver's left and
  // the arm sweeps across the road to their right.
  const near = buildGate(matSet, { armDir: -1 });
  near.group.position.set(L.roadHalf + 0.42, L.walkY, L.gateNear);

  const far = buildGate(matSet, { armDir: -1 });
  far.group.position.set(-(L.roadHalf + 0.42), L.walkY, L.gateFar);
  far.group.rotation.y = Math.PI;

  const group = new THREE.Group();
  group.name = 'railway';
  group.add(staticGroup, near.group, far.group);

  const gates = [near, far];
  const allLamps = gates.flatMap((g) => g.lamps);

  const crossing = {
    /** 0 = arms fully raised, 1 = fully down. */
    down: 0,
    active: false,
    _blink: 0,
    _bell: 0,
    onBell: null,

    setActive(v) { this.active = v; },

    update(dt) {
      // Arms take about 5s each way; the delay before they start moving is
      // handled by the caller, which raises `active` a beat before the train.
      const target = this.active ? 1 : 0;
      const speed = this.active ? 1 / 4.6 : 1 / 5.4;
      this.down = THREE.MathUtils.clamp(
        this.down + Math.sign(target - this.down) * speed * dt, 0, 1
      );
      // Ease the last part of the travel so the arm settles instead of slamming.
      const eased = this.down < 0.5
        ? 2 * this.down * this.down
        : 1 - Math.pow(-2 * this.down + 2, 2) / 2;
      for (const g of gates) g.pivot.rotation.z = (Math.PI / 2) * (1 - eased);

      // Lamps flash while the sequence is running, and keep flashing until the
      // arms are all the way back up.
      const live = this.active || this.down > 0.001;
      if (live) {
        this._blink += dt;
        const phase = Math.floor(this._blink / 0.52) % 2;
        for (let i = 0; i < allLamps.length; i++) {
          const on = (i % 2) === phase;
          allLamps[i].color.setRGB(on ? 2.6 : 0.30, on ? 0.42 : 0.05, on ? 0.34 : 0.05);
        }
        this._bell += dt;
        if (this._bell >= 0.52) {
          this._bell -= 0.52;
          if (this.onBell) this.onBell(phase);
        }
      } else {
        this._blink = 0;
        this._bell = 0;
        for (const m of allLamps) m.color.setRGB(0.30, 0.05, 0.05);
      }
    },
  };

  return { group, crossing };
}
