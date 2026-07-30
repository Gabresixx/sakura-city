import * as THREE from 'three';
import { Builder, mulberry32, range, pick } from '../core/geo.js';
import { toon, RAMP } from '../core/materials.js';
import { vendingFace, stopSign, poleTag, signBoard, softDisc } from '../core/paint.js';
import { C, DRINKS } from '../core/palette.js';
import { L } from './layout.js';

/**
 * Street furniture — the layer that makes a street feel lived in.
 *
 * Poles that lean slightly, a mirror at the blind corner, bicycles left
 * against a wall, a cat asleep on a block wall, crows on the wires. None of it
 * is load-bearing for the composition and all of it is what you actually look
 * at once you start walking around.
 */

function mats() {
  return {
    concrete: toon({ color: C.poleConcrete, ramp: RAMP.three, rim: 0.18 }),
    band: toon({ color: C.poleBand, ramp: RAMP.three, rim: 0.2 }),
    metal: toon({ color: 0xa5a3ad, ramp: RAMP.three, rim: 0.3 }),
    darkMetal: toon({ color: 0x5c5866, ramp: RAMP.three, rim: 0.25 }),
    wire: toon({ color: C.wire, ramp: RAMP.two, rim: 0.3 }),
    dark: toon({ color: 0x3a3640, ramp: RAMP.two, rim: 0.25 }),
    white: toon({ color: 0xf6f3ee, ramp: RAMP.three, rim: 0.25 }),
    grey: toon({ color: 0x8f8c98, ramp: RAMP.three, rim: 0.2 }),
    vendRed: toon({ color: C.vendRed, ramp: RAMP.three, rim: 0.2 }),
    vendBlue: toon({ color: C.vendBlue, ramp: RAMP.three, rim: 0.2 }),
    mirrorPole: toon({ color: C.mirrorOrange, ramp: RAMP.three, rim: 0.25 }),
    mirrorFace: toon({ color: C.mirrorFace, ramp: RAMP.two, rim: 0.6 }),
    guardrail: toon({ color: C.guardrail, ramp: RAMP.three, rim: 0.3 }),
    tyre: toon({ color: C.tyre, ramp: RAMP.two, rim: 0.25 }),
    bike: toon({ color: C.bikeFrame, ramp: RAMP.three, rim: 0.3 }),
    bike2: toon({ color: C.bikeFrame2, ramp: RAMP.three, rim: 0.3 }),
    basket: toon({ color: 0x9aa0a8, ramp: RAMP.three, rim: 0.3 }),
    // Bare bicycle metal: rims, spokes, bars, cranks. Brighter and glossier
    // than the painted frame, with a strong rim so the spokes catch the sun.
    rim: toon({ color: C.bikeMetal, ramp: RAMP.three, rim: 0.55 }),
    cloth: toon({ color: 0xd9cdbb, ramp: RAMP.four, rim: 0.2 }),
    cone: toon({ color: C.cone, ramp: RAMP.three, rim: 0.25 }),
    bin: toon({ color: C.bin, ramp: RAMP.three, rim: 0.2 }),
    post: toon({ color: 0xd0362f, ramp: RAMP.three, rim: 0.25 }),
    cat: toon({ color: C.catFur, ramp: RAMP.four, rim: 0.3 }),
    crow: toon({ color: C.crow, ramp: RAMP.two, rim: 0.4 }),
    leaf: toon({ color: C.leaf, ramp: RAMP.four, rim: 0.15 }),
    wood: toon({ color: C.woodLight, ramp: RAMP.three, rim: 0.2 }),
    stopSign: toon({ color: 0xffffff, map: stopSign(), ramp: RAMP.two, rim: 0.15, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    glowPatch: new THREE.MeshBasicMaterial({
      map: softDisc('rgba(255,238,200,0.20)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false, opacity: 0.55,
    }),
  };
}

// ---------------------------------------------------------------------------

/**
 * 自動販売機. The face is a painted lightbox — `emissiveMap` makes the bottles
 * and price tags glow, and the bloom pass picks them up.
 */
function vendingMachine(b, m, { accent = C.vendRed, seed = 1, sold = false }) {
  const W = 1.12, H = 1.86, D = 0.78;
  const shell = accent === C.vendRed ? m.vendRed : m.vendBlue;
  const face = vendingFace({ accent, drinks: DRINKS, seed });
  // Emissive is deliberately gentle. The face texture is already near-white
  // where the lightbox is, so anything above ~0.2 pushes the whole panel past
  // the bloom threshold and the machine turns into a floodlight.
  const lit = toon({
    color: 0xffffff, map: face, emissiveMap: face,
    emissive: 0xfff2d8, emissiveIntensity: sold ? 0.09 : 0.19,
    ramp: RAMP.three, rim: 0.15,
  });

  // Carcass, then the face inset slightly so the shell reads as a bezel.
  b.boxOn(shell, { p: [0, 0.04, 0], s: [W, H, D] });
  b.boxOn(m.dark, { p: [0, 0, 0], s: [W - 0.06, 0.06, D - 0.04] });
  b.plane(lit, { p: [0, 0.04 + H / 2, -D / 2 - 0.012], s: [W - 0.09, H - 0.07, 1], ry: Math.PI });
  // Bezel.
  for (const [dx, dy, sw, sh] of [
    [0, H - 0.035, W, 0.07], [0, 0.035, W, 0.07],
    [-(W / 2 - 0.022), H / 2, 0.045, H], [W / 2 - 0.022, H / 2, 0.045, H],
  ]) {
    b.box(shell, { p: [dx, 0.04 + dy, -D / 2 - 0.02], s: [sw, sh, 0.05] });
  }
  // Top light box with the brand band.
  b.box(shell, { p: [0, 0.04 + H + 0.06, 0], s: [W + 0.04, 0.12, D + 0.03] });
  // Coin slot, return lever, delivery flap lip.
  b.box(m.metal, { p: [W * 0.30, 1.28, -D / 2 - 0.05], s: [0.09, 0.14, 0.05] });
  b.cyl(m.metal, { p: [W * 0.30, 1.08, -D / 2 - 0.05], r: 0.035, h: 0.05, seg: 10, rx: Math.PI / 2 });
  b.box(m.dark, { p: [-W * 0.10, 0.36, -D / 2 - 0.06], s: [0.56, 0.22, 0.06], rx: 0.18 });
  // Feet.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(m.dark, { p: [sx * (W / 2 - 0.1), 0.02, sz * (D / 2 - 0.1)], s: [0.12, 0.04, 0.12] });
  }

  // Warm pool of light on the pavement in front — sells the "glowing" read.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), m.glowPatch);
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.015, -0.72);
  glow.renderOrder = 5;
  b.attach(glow);
}

/** リサイクルボックス — always bolted to the side of a vending machine. */
function recycleBin(b, m) {
  b.boxOn(m.bin, { p: [0, 0, 0], s: [0.52, 0.98, 0.52] });
  b.box(m.dark, { p: [0, 1.0, 0], s: [0.56, 0.06, 0.56] });
  b.cyl(m.dark, { p: [0, 0.86, -0.27], r: 0.16, h: 0.06, seg: 12, rx: Math.PI / 2 });
  b.box(m.white, { p: [0, 0.5, -0.27], s: [0.34, 0.2, 0.02] });
}

/**
 * 電柱. Concrete, tapered, with the crossarms and porcelain insulators that
 * carry the overhead web. `transformer` adds the drum that hangs off the busy
 * ones; `lamp` adds the 防犯灯 on its bracket.
 */
function utilityPole(b, m, { h = 9.4, transformer = false, lamp = false, tag = '', lean = 0 }) {
  b.at({ rz: lean }, () => {
    b.cyl(m.concrete, { p: [0, h / 2, 0], r: 0.14, r2: 0.09, h, seg: 10 });
    b.cyl(m.concrete, { p: [0, 0.06, 0], r: 0.19, h: 0.12, seg: 10 });
    // The pale bands every couple of metres.
    for (let y = 1.6; y < h - 0.6; y += 2.2) {
      b.cyl(m.band, { p: [0, y, 0], r: 0.135 - y * 0.004, h: 0.1, seg: 10 });
    }

    // Crossarms: the top one for the high-voltage line, the lower for services.
    for (const [y, len, n] of [[h - 0.5, 1.9, 3], [h - 1.35, 1.6, 3]]) {
      b.box(m.darkMetal, { p: [0, y, 0], s: [len, 0.09, 0.09] });
      b.box(m.darkMetal, { p: [0, y - 0.24, 0], s: [0.5, 0.06, 0.06], rz: 0.5 });
      for (let i = 0; i < n; i++) {
        const x = -len / 2 + len * i / (n - 1);
        b.cyl(m.grey, { p: [x, y + 0.14, 0], r: 0.055, h: 0.14, seg: 8 });
        b.cyl(m.grey, { p: [x, y + 0.24, 0], r: 0.075, h: 0.06, seg: 8 });
        b.cyl(m.darkMetal, { p: [x, y + 0.06, 0], r: 0.02, h: 0.12, seg: 6 });
      }
    }

    if (transformer) {
      // 柱上変圧器 on its platform, with the cutout fuses above.
      b.box(m.darkMetal, { p: [0, h - 2.5, 0], s: [1.1, 0.07, 0.5] });
      for (const dx of [-0.3, 0.3]) {
        b.cyl(m.grey, { p: [dx, h - 2.9, 0.06], r: 0.24, h: 0.72, seg: 12 });
        b.cyl(m.grey, { p: [dx, h - 2.52, 0.06], r: 0.26, h: 0.06, seg: 12 });
        b.cyl(m.band, { p: [dx, h - 2.44, 0.06], r: 0.06, h: 0.12, seg: 8 });
      }
      b.box(m.darkMetal, { p: [0, h - 2.2, 0], s: [0.9, 0.5, 0.06] });
    }

    if (lamp) {
      // 防犯灯 on its short arm.
      b.rod(m.metal, [0, h - 3.6, 0], [0, h - 3.4, -0.85], 0.03, 5);
      b.box(m.white, { p: [0, h - 3.42, -0.95], s: [0.26, 0.1, 0.5] });
      b.box(m.band, { p: [0, h - 3.49, -0.95], s: [0.2, 0.04, 0.42] });
    }

    // Cable coil and the junction box every pole seems to carry.
    b.torus(m.wire, { p: [0.0, h - 3.0, 0.22], r: 0.26, tube: 0.045, rx: 0.4, seg: 12, rseg: 5 });
    b.box(m.grey, { p: [0, h - 4.2, 0.2], s: [0.26, 0.4, 0.18] });

    if (tag) {
      const t = toon({ color: 0xffffff, map: poleTag(tag), ramp: RAMP.two, rim: 0.1, side: THREE.DoubleSide });
      b.plane(t, { p: [0, 3.1, -0.16], s: [0.16, 0.32, 1], ry: Math.PI });
    }
  });
}

/**
 * ママチャリ — the step-through shopping bike.
 *
 * Authored rolling along X, so every wheel lies in the XY plane. That is the
 * detail that has to be right before anything else reads: a TorusGeometry is
 * already in XY with its axis on Z, so a wheel here takes *no* rotation. Turn
 * it 90° and the frame and the wheels end up on different planes, and the whole
 * thing stops looking like a bicycle without it being obvious why.
 *
 * Joint positions come first, tubes follow. Real frame geometry:
 * rear hub → bottom bracket → seat tube → head tube → fork → front hub.
 */
function bicycle(b, m, { frame = m.bike, seed = 1 }) {
  const rnd = mulberry32(seed * 613);

  const R = 0.335;                    // 26" wheel
  const REAR = [-0.55, R];            // rear hub
  const FRONT = [0.55, R];            // front hub
  const BB = [-0.09, 0.27];           // bottom bracket
  const SEAT = [-0.27, 0.80];         // seat tube top / saddle clamp
  const HEAD_LO = [0.41, 0.51];       // head tube bottom
  const HEAD_HI = [0.47, 0.76];       // head tube top
  const BAR = [0.50, 0.98];           // handlebar centre

  const rod2 = (mat, a, c, r, seg = 6, z = 0) =>
    b.rod(mat, [a[0], a[1], z], [c[0], c[1], z], r, seg);

  // ---- wheels -------------------------------------------------------------
  for (const [hx, hy] of [REAR, FRONT]) {
    b.torus(m.tyre, { p: [hx, hy, 0], r: R, tube: 0.036, seg: 20, rseg: 5 });
    b.torus(m.rim, { p: [hx, hy, 0], r: R - 0.05, tube: 0.014, seg: 20, rseg: 4 });
    // Spokes, in the plane of the wheel.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI;
      const dx = Math.cos(a) * (R - 0.055), dy = Math.sin(a) * (R - 0.055);
      b.rod(m.rim, [hx - dx, hy - dy, 0], [hx + dx, hy + dy, 0], 0.006, 3);
    }
    b.cyl(m.rim, { p: [hx, hy, 0], r: 0.045, h: 0.09, seg: 10, rx: Math.PI / 2 });
    // Valve.
    b.cyl(m.dark, { p: [hx, hy + R - 0.05, 0], r: 0.011, h: 0.06, seg: 5 });
  }

  // ---- mudguards ----------------------------------------------------------
  // Arcs hugging the top of each wheel, tighter at the rear where the rack sits.
  const guard = (hub, from, to) => {
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const a = from + (to - from) * (i / steps);
      b.box(frame, {
        p: [hub[0] + Math.cos(a) * (R + 0.055), hub[1] + Math.sin(a) * (R + 0.055), 0],
        s: [0.10, 0.018, 0.10], rz: a - Math.PI / 2,
      });
    }
  };
  guard(FRONT, 0.35, Math.PI - 0.55);
  guard(REAR, 0.55, Math.PI - 0.30);

  // ---- frame --------------------------------------------------------------
  rod2(frame, BB, SEAT, 0.021, 8);                 // seat tube
  rod2(frame, BB, HEAD_LO, 0.024, 8);              // down tube
  rod2(frame, HEAD_LO, HEAD_HI, 0.026, 8);         // head tube
  // Step-through bar: a shallow curve from the head tube back to the seat tube.
  rod2(frame, HEAD_HI, [0.13, 0.66], 0.019, 6);
  rod2(frame, [0.13, 0.66], [-0.20, 0.66], 0.019, 6);
  rod2(frame, [-0.20, 0.66], SEAT, 0.019, 6);
  // Stays, doubled either side of the wheel.
  for (const z of [-0.055, 0.055]) {
    b.rod(frame, [BB[0], BB[1], z], [REAR[0], REAR[1], z], 0.015, 5);   // chain stay
    b.rod(frame, [SEAT[0], SEAT[1] - 0.05, z], [REAR[0], REAR[1], z], 0.014, 5); // seat stay
  }
  // Fork, doubled either side of the front wheel.
  for (const z of [-0.05, 0.05]) {
    b.rod(frame, [HEAD_LO[0], HEAD_LO[1], z], [FRONT[0], FRONT[1], z], 0.017, 5);
  }

  // ---- drivetrain ---------------------------------------------------------
  b.cyl(m.rim, { p: [BB[0], BB[1], 0], r: 0.032, h: 0.13, seg: 10, rx: Math.PI / 2 });
  b.cyl(m.rim, { p: [BB[0], BB[1], 0.075], r: 0.10, h: 0.012, seg: 16, rx: Math.PI / 2 });
  // Full chain case — the ママチャリ signature.
  b.box(frame, { p: [(BB[0] + REAR[0]) / 2, BB[1] - 0.02, 0.075], s: [0.50, 0.13, 0.035] });
  b.cyl(frame, { p: [BB[0], BB[1], 0.075], r: 0.125, h: 0.035, seg: 16, rx: Math.PI / 2 });
  b.cyl(m.rim, { p: [REAR[0], REAR[1], 0.062], r: 0.055, h: 0.02, seg: 12, rx: Math.PI / 2 });
  // Cranks and pedals, one forward and one back.
  for (const s of [-1, 1]) {
    b.rod(m.rim, [BB[0], BB[1], s * 0.075], [BB[0] + s * 0.14, BB[1] - s * 0.10, s * 0.085], 0.015, 5);
    b.box(m.dark, {
      p: [BB[0] + s * 0.14, BB[1] - s * 0.10, s * 0.135], s: [0.11, 0.025, 0.07],
    });
  }

  // ---- cockpit ------------------------------------------------------------
  b.rod(m.rim, [HEAD_HI[0], HEAD_HI[1], 0], [BAR[0], BAR[1], 0], 0.019, 6);  // stem
  // Swept-back bar: straight centre, then grips angled back.
  b.rod(m.rim, [BAR[0], BAR[1], -0.14], [BAR[0], BAR[1], 0.14], 0.016, 6);
  for (const s of [-1, 1]) {
    b.rod(m.rim, [BAR[0], BAR[1], s * 0.14], [BAR[0] - 0.08, BAR[1] + 0.02, s * 0.26], 0.016, 5);
    b.cyl(m.dark, { p: [BAR[0] - 0.10, BAR[1] + 0.025, s * 0.28], r: 0.022, h: 0.11, seg: 8, rz: Math.PI / 2, ry: s * 0.5 });
    // Brake lever.
    b.rod(m.rim, [BAR[0] - 0.06, BAR[1] + 0.01, s * 0.22], [BAR[0] + 0.08, BAR[1] - 0.04, s * 0.20], 0.011, 4);
  }
  // Bell.
  b.cyl(m.rim, { p: [BAR[0] - 0.02, BAR[1] + 0.04, 0.11], r: 0.026, h: 0.03, seg: 10 });

  // ---- saddle -------------------------------------------------------------
  b.rod(m.rim, [SEAT[0], SEAT[1], 0], [SEAT[0], SEAT[1] + 0.06, 0], 0.017, 6);
  b.box(m.dark, { p: [SEAT[0] - 0.02, SEAT[1] + 0.10, 0], s: [0.26, 0.055, 0.15] });
  b.sphere(m.dark, { p: [SEAT[0] + 0.11, SEAT[1] + 0.10, 0], s: [0.12, 0.05, 0.09], w: 8, hs: 5 });

  // ---- basket, rack, stand, light ----------------------------------------
  const bx = 0.66, by = 0.80;
  b.box(m.basket, { p: [bx, by, 0], s: [0.30, 0.24, 0.32] });
  b.box(m.basket, { p: [bx, by + 0.13, 0], s: [0.33, 0.025, 0.35] });
  // Mesh, hinted with a few bars rather than modelled.
  for (let i = -1; i <= 1; i++) {
    b.box(m.rim, { p: [bx, by, i * 0.11], s: [0.31, 0.245, 0.012] });
    b.box(m.rim, { p: [bx + i * 0.1, by, 0], s: [0.012, 0.245, 0.33] });
  }
  b.rod(m.rim, [bx - 0.13, by - 0.10, 0], [HEAD_HI[0], HEAD_HI[1] - 0.08, 0], 0.014, 5);

  b.box(frame, { p: [-0.47, 0.63, 0], s: [0.36, 0.028, 0.20] });
  for (const s of [-1, 1]) {
    b.rod(m.rim, [-0.60, 0.62, s * 0.09], [REAR[0] + 0.02, REAR[1] + 0.04, s * 0.075], 0.011, 4);
  }
  // Kickstand, down on one side.
  b.rod(m.rim, [-0.28, 0.24, 0.06], [-0.40, 0.0, 0.15], 0.014, 5);
  // Dynamo lamp on the fork crown.
  b.cyl(m.rim, { p: [0.50, 0.60, 0], r: 0.038, h: 0.07, seg: 10, rz: Math.PI / 2 });
  b.cyl(m.mirrorFace, { p: [0.545, 0.60, 0], r: 0.034, h: 0.012, seg: 10, rz: Math.PI / 2 });
  // Rear reflector.
  b.box(m.cone, { p: [-0.62, 0.60, 0], s: [0.03, 0.05, 0.09] });

  // Sometimes a bag in the basket.
  if (rnd() < 0.5) b.box(m.cloth ?? m.basket, { p: [bx, by + 0.06, 0], s: [0.24, 0.20, 0.26] });
}

/** カーブミラー at the blind corner by the crossing. */
function roadMirror(b, m, { h = 2.9, ry = 0 }) {
  b.cyl(m.mirrorPole, { p: [0, h / 2, 0], r: 0.05, h, seg: 8 });
  for (let y = 0.4; y < h - 0.4; y += 0.7) {
    b.cyl(m.white, { p: [0, y, 0], r: 0.052, h: 0.22, seg: 8 });
  }
  b.box(m.dark, { p: [0, 0.06, 0], s: [0.3, 0.12, 0.3] });
  b.at({ p: [0, h - 0.1, 0], ry }, () => {
    b.rod(m.mirrorPole, [0, 0, 0], [0, 0.34, -0.42], 0.035, 6);
    b.cyl(m.mirrorPole, { p: [0, 0.34, -0.5], r: 0.44, h: 0.07, seg: 20, rx: Math.PI / 2 + 0.22 });
    b.cyl(m.mirrorFace, { p: [0, 0.35, -0.545], r: 0.40, h: 0.03, seg: 20, rx: Math.PI / 2 + 0.22 });
    b.cyl(m.mirrorPole, { p: [0, 0.34, -0.46], r: 0.46, h: 0.04, seg: 20, rx: Math.PI / 2 + 0.22 });
  });
}

function guardRail(b, m, { len = 6, ry = 0 }) {
  const posts = Math.max(2, Math.round(len / 2));
  for (let i = 0; i <= posts; i++) {
    const x = -len / 2 + (len * i) / posts;
    b.cyl(m.guardrail, { p: [x, 0.34, 0], r: 0.05, h: 0.68, seg: 8 });
    b.box(m.dark, { p: [x, 0.02, 0], s: [0.16, 0.04, 0.16] });
  }
  // The pressed W-beam, faked with three stacked strips.
  b.box(m.guardrail, { p: [0, 0.62, 0], s: [len, 0.09, 0.05] });
  b.box(m.guardrail, { p: [0, 0.5, -0.02], s: [len, 0.09, 0.05] });
  b.box(m.guardrail, { p: [0, 0.38, 0], s: [len, 0.09, 0.05] });
  for (let i = 0; i <= posts; i++) {
    const x = -len / 2 + (len * i) / posts;
    b.box(m.white, { p: [x, 0.5, -0.05], s: [0.07, 0.07, 0.02] });
  }
}

function trafficCone(b, m, { seed = 1 }) {
  const rnd = mulberry32(seed * 97);
  b.at({ rz: range(rnd, -0.06, 0.06) }, () => {
    b.box(m.cone, { p: [0, 0.02, 0], s: [0.34, 0.04, 0.34] });
    b.cone(m.cone, { p: [0, 0.36, 0], r: 0.13, h: 0.66, seg: 10 });
    b.cyl(m.white, { p: [0, 0.36, 0], r: 0.088, h: 0.09, seg: 10 });
    b.cyl(m.white, { p: [0, 0.18, 0], r: 0.115, h: 0.07, seg: 10 });
  });
}

/** 郵便ポスト — the round red post box. Instantly places the scene. */
function postBox(b, m) {
  b.cyl(m.post, { p: [0, 0.72, 0], r: 0.24, h: 1.36, seg: 14 });
  b.cyl(m.post, { p: [0, 1.42, 0], r: 0.26, h: 0.06, seg: 14 });
  b.sphere(m.post, { p: [0, 1.46, 0], r: 0.26, w: 14, hs: 7, s: [0.52, 0.30, 0.52] });
  b.box(m.dark, { p: [0, 1.16, -0.23], s: [0.28, 0.07, 0.06] });
  b.box(m.dark, { p: [0, 0.48, -0.22], s: [0.3, 0.36, 0.06] });
  b.cyl(m.dark, { p: [0, 0.06, 0], r: 0.28, h: 0.12, seg: 14 });
  b.box(m.white, { p: [0, 0.92, -0.23], s: [0.22, 0.16, 0.02] });
}

/** 掲示板 — the community notice board with its little pitched roof. */
function noticeBoard(b, m) {
  for (const sx of [-1, 1]) b.cyl(m.wood, { p: [sx * 0.62, 0.7, 0], r: 0.05, h: 1.4, seg: 8 });
  b.box(m.wood, { p: [0, 1.5, 0], s: [1.5, 1.0, 0.09] });
  b.box(m.white, { p: [0, 1.5, -0.06], s: [1.36, 0.88, 0.02] });
  b.box(m.dark, { p: [0, 2.06, -0.06], s: [1.6, 0.06, 0.34], rx: 0.3 });
  const rnd = mulberry32(4242);
  for (let i = 0; i < 5; i++) {
    b.plane(m.band, {
      p: [range(rnd, -0.55, 0.55), range(rnd, 1.2, 1.8), -0.072],
      s: [range(rnd, 0.2, 0.32), range(rnd, 0.26, 0.38), 1],
      rz: range(rnd, -0.06, 0.06), ry: Math.PI,
    });
  }
}

/** A cat asleep on a wall. Just a curl of blobs, but it reads instantly. */
function cat(b, m) {
  b.sphere(m.cat, { p: [0, 0.10, 0], s: [0.46, 0.19, 0.24], w: 9, hs: 6 });
  b.sphere(m.cat, { p: [0.20, 0.15, 0], r: 0.13, w: 9, hs: 6 });
  for (const sz of [-1, 1]) {
    b.cone(m.cat, { p: [0.22, 0.24, sz * 0.06], r: 0.045, h: 0.09, seg: 4 });
  }
  // Tail curled round the body.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 1.2;
    b.sphere(m.cat, {
      p: [-0.22 - Math.sin(a) * 0.13, 0.07, Math.cos(a) * 0.13 - 0.06], r: 0.045, w: 6, hs: 4,
    });
  }
}

/** A crow on the wire. Three of these do more for atmosphere than any prop. */
function crow(b, m) {
  b.sphere(m.crow, { p: [0, 0, 0], s: [0.22, 0.15, 0.13], w: 8, hs: 5 });
  b.sphere(m.crow, { p: [0.11, 0.09, 0], r: 0.08, w: 8, hs: 5 });
  b.cone(m.crow, { p: [0.19, 0.09, 0], r: 0.026, h: 0.09, seg: 5, rz: -Math.PI / 2 });
  b.cone(m.crow, { p: [-0.16, -0.02, 0], r: 0.05, h: 0.18, seg: 5, rz: Math.PI / 2 + 0.5 });
}

// ---------------------------------------------------------------------------

/** East-side pole line. The web overhead is half of what makes this Japan. */
const POLE_Z = [-64, -52, -40, -28, -16, -4, 8, 28, 40, 52, 62];
const POLE_X = L.roadHalf + L.kerbW + 1.05;
/** Everything standing on the footway shares the pavement's surface height. */
const PY = L.walkY;

export function buildProps() {
  const b = new Builder('props', { chunk: 44 });
  const m = mats();
  const rnd = mulberry32(777);

  // ---- vending machines ---------------------------------------------------
  // The pair beside 青空商店, tucked into the gap before the next shop.
  // These are authored facing local −Z, so on the east pavement they need
  // +π/2 to look back across the road.
  b.at({ p: [POLE_X - 0.35, PY, 7.7], ry: Math.PI / 2 }, () => {
    vendingMachine(b, m, { accent: C.vendRed, seed: 1 });
  });
  b.at({ p: [POLE_X - 0.35, PY, 9.0], ry: Math.PI / 2 }, () => {
    vendingMachine(b, m, { accent: C.vendBlue, seed: 5 });
  });
  b.at({ p: [POLE_X - 0.35, PY, 10.1], ry: Math.PI / 2 }, () => recycleBin(b, m));

  // ---- utility poles + overhead web --------------------------------------
  POLE_Z.forEach((z, i) => {
    b.at({ p: [POLE_X, PY, z], ry: Math.PI / 2 }, () => {
      utilityPole(b, m, {
        h: 9.4 + (i % 3) * 0.3,
        transformer: i % 3 === 1,
        lamp: i % 2 === 0,
        tag: `幸町${12 + i}`,
        lean: (i % 4 === 2 ? 0.018 : 0) * (i % 8 < 4 ? 1 : -1),
      });
    });
  });
  // A shorter pole line on the west, so wires can cross the street.
  const westZ = [-58, -34, -10, 14, 34, 56];
  westZ.forEach((z, i) => {
    b.at({ p: [-POLE_X, PY, z], ry: -Math.PI / 2 }, () => {
      utilityPole(b, m, { h: 8.8, transformer: i === 2, lamp: i % 2 === 1, tag: `幸町${40 + i}` });
    });
  });

  // Spans along each side. Three conductors up top, a fat service bundle below.
  const span = (x, list) => {
    for (let i = 0; i < list.length - 1; i++) {
      const z0 = list[i], z1 = list[i + 1];
      if (z1 - z0 > 26) continue; // the crossing gap stays clear
      for (const [dy, dx, sag] of [
        [8.9, -0.95, 0.30], [8.9, 0, 0.28], [8.9, 0.95, 0.30],
        [8.05, -0.8, 0.42], [8.05, 0.8, 0.42],
        [6.6, 0.1, 0.55], [6.45, -0.15, 0.62], [6.3, 0.25, 0.5],
      ]) {
        b.wire(m.wire, [x + dx, dy + PY, z0], [x + dx, dy + PY, z1], sag, 0.021, 7);
      }
    }
  };
  span(POLE_X, POLE_Z);
  span(-POLE_X, westZ);

  // Cross-street spans, plus service drops into the buildings.
  for (const [z, zw] of [[-52, -58], [-28, -34], [-4, -10], [40, 34]]) {
    b.wire(m.wire, [POLE_X, 8.4 + PY, z], [-POLE_X, 8.2 + PY, zw], 0.75, 0.021, 9);
    b.wire(m.wire, [POLE_X, 6.5 + PY, z], [-POLE_X, 6.4 + PY, zw], 0.9, 0.019, 9);
  }
  for (const z of POLE_Z) {
    if (Math.abs(z - L.railZ) < 12) continue;
    b.wire(m.wire, [POLE_X, 6.4 + PY, z],
      [L.buildLine + 1.4, 4.4, z + range(rnd, -2.5, 2.5)], 0.35, 0.017, 6);
  }
  for (const z of westZ) {
    if (Math.abs(z - L.railZ) < 12) continue;
    b.wire(m.wire, [-POLE_X, 6.3 + PY, z],
      [-L.buildLine - 1.4, 4.35, z + range(rnd, -2.5, 2.5)], 0.35, 0.017, 6);
  }

  // Crows on a span near the crossing.
  for (const [z, dz] of [[-4.4, 0], [-3.6, 0], [-2.2, 0]]) {
    b.at({ p: [POLE_X - 0.15, 8.9 + PY - 0.04, z + dz], ry: range(rnd, -0.5, 0.5) },
      () => crow(b, m));
  }

  // ---- signage ------------------------------------------------------------
  // 止まれ on both approaches to the crossing.
  // Each faces back down the approach it governs: the near one at traffic
  // coming from −Z, the far one at traffic coming from +Z.
  for (const [x, z, ry] of [
    [L.roadHalf + 0.5, L.gateNear - 3.4, Math.PI],
    [-(L.roadHalf + 0.5), L.gateFar + 3.4, 0],
  ]) {
    b.cyl(m.metal, { p: [x, PY + 1.1, z], r: 0.042, h: 2.2, seg: 8 });
    b.box(m.dark, { p: [x, PY + 0.06, z], s: [0.24, 0.12, 0.24] });
    b.plane(m.stopSign, { p: [x, PY + 2.35, z + (ry ? -0.05 : 0.05)], s: [0.86, 0.86, 1], ry });
  }

  const addrMat = toon({
    color: 0xffffff, ramp: RAMP.two, rim: 0.1, side: THREE.DoubleSide,
    map: signBoard({ text: '幸町 二丁目', sub: 'SAIWAI-CHO 2', bg: 0xf8f6f1, fg: 0x2f5d8a, h: 200 }),
  });
  b.plane(addrMat, { p: [POLE_X - 0.16, PY + 2.5, -16], s: [0.9, 0.24, 1], ry: -Math.PI / 2 });

  // ---- corner furniture ---------------------------------------------------
  b.at({ p: [-(L.roadHalf + 1.1), PY, L.gateNear - 5.2], ry: -0.5 }, () => {
    roadMirror(b, m, { h: 3.0, ry: 0.9 });
  });
  b.at({ p: [L.roadHalf + 1.15, PY, 44], ry: 0.4 }, () => roadMirror(b, m, { h: 2.8, ry: -2.2 }));

  b.at({ p: [POLE_X - 0.1, PY, -20.5], ry: Math.PI / 2 }, () => postBox(b, m));
  b.at({ p: [-(POLE_X - 0.2), PY, -26], ry: -Math.PI / 2 }, () => noticeBoard(b, m));

  // Guard rails protecting the pavement either side of the crossing.
  for (const [x, z, len, ry] of [
    [-(L.roadHalf + 0.62), L.gateNear - 4.6, 5.0, Math.PI / 2],
    [L.roadHalf + 0.62, L.gateFar + 4.6, 5.0, Math.PI / 2],
  ]) {
    b.at({ p: [x, PY, z], ry }, () => guardRail(b, m, { len }));
  }

  // ---- bicycles -----------------------------------------------------------
  const bikes = [
    [POLE_X - 0.55, 12.6, -Math.PI / 2 + 0.1, m.bike],
    [POLE_X - 0.55, 13.4, -Math.PI / 2 - 0.06, m.bike2],
    [-(POLE_X - 0.5), -12.4, Math.PI / 2 + 0.12, m.bike2],
    [-(POLE_X - 0.5), -13.2, Math.PI / 2, m.bike],
    [POLE_X - 0.5, -30.5, -Math.PI / 2 + 0.2, m.bike],
    [-(POLE_X - 0.5), 33.5, Math.PI / 2 - 0.1, m.bike2],
  ];
  bikes.forEach(([x, z, ry, frame], i) => {
    b.at({ p: [x, PY, z], ry }, () => bicycle(b, m, { frame, seed: i + 1 }));
  });

  // ---- odds and ends ------------------------------------------------------
  for (const [x, z] of [[-2.1, -37.2], [-2.4, -36.2], [2.2, 44.5]]) {
    b.at({ p: [x, 0, z] }, () => trafficCone(b, m, { seed: x * z }));
  }
  // A cat asleep on the wall opposite the shop.
  b.at({ p: [-(L.buildLine + 0.12), PY + 1.12, -6.4], ry: 1.9 }, () => cat(b, m));

  // Umbrella stand and a crate outside the bakery.
  b.at({ p: [POLE_X - 0.7, PY, -6.2], ry: -Math.PI / 2 }, () => {
    b.cyl(m.grey, { p: [0, 0.28, 0], r: 0.16, h: 0.56, seg: 10 });
    for (let i = 0; i < 3; i++) {
      b.cyl(pick(rnd, [m.bike, m.bike2, m.dark]), {
        p: [range(rnd, -0.06, 0.06), 0.62, range(rnd, -0.06, 0.06)],
        r: 0.028, h: 0.9, seg: 6, rz: range(rnd, -0.12, 0.12),
      });
    }
  });

  return b.build();
}
