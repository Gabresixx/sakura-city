import * as THREE from 'three';
import { Builder, mulberry32, range, pick } from '../core/geo.js';
import { toon, RAMP } from '../core/materials.js';
import { signBoard, verticalSign, shopInterior, awningStripes } from '../core/paint.js';
import { C } from '../core/palette.js';
import { L } from './layout.js';

/**
 * The buildings along the street.
 *
 * Every generator is authored the same way: the property line sits at local
 * z = 0, the front elevation faces local −Z, and depth runs into +Z. Placing a
 * plot is then just a rotation, which keeps both sides of the street honest.
 *
 * The detail budget goes where the eye goes — roof tile courses, window
 * grilles, rain gutters, meter boxes, balcony laundry. Those are the things
 * that make a box read as a Japanese house rather than a box.
 */

const M = {
  wallCream: () => toon({ color: C.wallCream, ramp: RAMP.three, rim: 0.12 }),
  roofTile: () => toon({ color: C.roofTile, ramp: RAMP.three, rim: 0.2 }),
  concrete: () => toon({ color: C.concrete, ramp: RAMP.three, rim: 0.1 }),
};

function mats() {
  return {
    wall: {
      cream: toon({ color: C.wallCream, ramp: RAMP.three, rim: 0.12 }),
      beige: toon({ color: C.wallBeige, ramp: RAMP.three, rim: 0.12 }),
      warm: toon({ color: C.wallWarm, ramp: RAMP.three, rim: 0.12 }),
      mint: toon({ color: C.wallMint, ramp: RAMP.three, rim: 0.12 }),
      blue: toon({ color: C.wallBlue, ramp: RAMP.three, rim: 0.12 }),
      pink: toon({ color: C.wallPink, ramp: RAMP.three, rim: 0.12 }),
      grey: toon({ color: C.wallGrey, ramp: RAMP.three, rim: 0.12 }),
    },
    roof: {
      slate: toon({ color: C.roofTile, ramp: RAMP.three, rim: 0.22 }),
      warm: toon({ color: C.roofTileWarm, ramp: RAMP.three, rim: 0.22 }),
      dark: toon({ color: C.roofDark, ramp: RAMP.three, rim: 0.22 }),
    },
    concrete: toon({ color: C.concrete, ramp: RAMP.three, rim: 0.1 }),
    block: toon({ color: C.blockWall, ramp: RAMP.three, rim: 0.1 }),
    woodDark: toon({ color: C.woodDark, ramp: RAMP.three, rim: 0.15 }),
    woodLight: toon({ color: C.woodLight, ramp: RAMP.three, rim: 0.15 }),
    glass: toon({ color: C.glass, ramp: RAMP.two, rim: 0.55 }),
    glassDark: toon({ color: C.glassDark, ramp: RAMP.two, rim: 0.5 }),
    frame: toon({ color: 0xe6e3e0, ramp: RAMP.three, rim: 0.25 }),
    metal: toon({ color: 0xa5a3ad, ramp: RAMP.three, rim: 0.3 }),
    dark: toon({ color: 0x4b4753, ramp: RAMP.two, rim: 0.25 }),
    shutter: toon({ color: C.shutter, ramp: RAMP.three, rim: 0.2 }),
    white: toon({ color: 0xf6f3ee, ramp: RAMP.three, rim: 0.2 }),
    cloth: toon({ color: 0xf3efe6, ramp: RAMP.four, rim: 0.15, side: THREE.DoubleSide }),
    tarp: toon({ color: 0x6f9ec4, ramp: RAMP.four, rim: 0.15, side: THREE.DoubleSide }),
    leaf: toon({ color: C.leaf, ramp: RAMP.four, rim: 0.15 }),
    leafDark: toon({ color: C.leafDark, ramp: RAMP.four, rim: 0.15 }),
    planter: toon({ color: C.planter, ramp: RAMP.three, rim: 0.15 }),
    ac: toon({ color: 0xdedbd6, ramp: RAMP.three, rim: 0.2 }),
  };
}

// ---------------------------------------------------------------------------
// shared parts
// ---------------------------------------------------------------------------

/**
 * A 瓦 roof. Courses step down the slope and continuous ridges run with the
 * fall — which is how pantiles actually sit, and far cheaper than tiling.
 */
function tiledRoof(b, m, { w, d, y, rise, tile, overhang = 0.42, hip = false }) {
  const slope = Math.atan2(rise, d / 2 + overhang);
  const runLen = Math.hypot(d / 2 + overhang, rise);
  const W = w + overhang * 2;

  for (const sz of [-1, 1]) {
    b.at({ p: [0, y, sz * (d / 2 + overhang) / 2 + (sz > 0 ? d / 2 : 0) * 0], rx: 0 }, () => {});
    // Slope plane, hinged at the ridge.
    const cz = sz * (d / 2 + overhang) / 2;
    const cy = y + rise / 2;
    b.box(tile, {
      p: [0, cy, cz + (sz > 0 ? 0 : 0)], s: [W, 0.09, runLen],
      rx: sz * slope,
    });
    // Course lines: thin steps every 32cm down the fall.
    const n = Math.max(3, Math.floor(runLen / 0.34));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const zz = THREE.MathUtils.lerp(0, sz * (d / 2 + overhang), t);
      const yy = y + rise * (1 - t);
      b.box(m.roof.dark, { p: [0, yy + 0.045, zz], s: [W, 0.05, 0.05], rx: sz * slope });
    }
    // Down-slope ridges.
    for (let x = -W / 2 + 0.16; x < W / 2; x += 0.30) {
      b.box(tile, {
        p: [x, cy + 0.05, cz], s: [0.085, 0.05, runLen], rx: sz * slope,
      });
    }
    // 軒先: the thickened eave edge, with a drip lip.
    const ez = sz * (d / 2 + overhang);
    b.box(tile, { p: [0, y - rise + 0.02, ez - sz * 0.05], s: [W, 0.16, 0.14] });
    b.box(m.roof.dark, { p: [0, y - rise - 0.04, ez], s: [W, 0.07, 0.06] });
    // Rafter tails under the eave.
    for (let x = -W / 2 + 0.2; x < W / 2; x += 0.55) {
      b.box(m.woodDark, { p: [x, y - rise + 0.06, ez - sz * 0.22], s: [0.07, 0.09, 0.5] });
    }
    // 雨樋 hanging off the eave.
    b.cyl(m.white, {
      p: [0, y - rise - 0.09, ez - sz * 0.02], r: 0.055, h: W, seg: 8, rz: Math.PI / 2,
    });
  }

  // 棟: ridge cap built from stacked courses with a bold end block.
  b.box(m.roof.dark, { p: [0, y + 0.10, 0], s: [W, 0.14, 0.46] });
  b.box(tile, { p: [0, y + 0.20, 0], s: [W, 0.10, 0.38] });
  b.box(m.roof.dark, { p: [0, y + 0.28, 0], s: [W, 0.08, 0.30] });
  for (const sx of [-1, 1]) {
    b.box(tile, { p: [sx * (W / 2 - 0.06), y + 0.30, 0], s: [0.16, 0.30, 0.42] });
    b.box(m.roof.dark, { p: [sx * (W / 2 - 0.06), y + 0.46, 0], s: [0.18, 0.10, 0.36] });
  }

  // Gable ends, closing the triangle so you never see inside.
  if (!hip) {
    for (const sx of [-1, 1]) {
      b.at({ p: [sx * (w / 2), y - rise, 0], ry: Math.PI / 2 }, () => {
        b.shape(m.wall.cream, [
          [-(d / 2 + overhang), 0], [d / 2 + overhang, 0], [0, rise],
        ], 0.12, {});
      });
    }
  }
  return slope;
}

/** Aluminium sash window with an optional grille and a shutter case. */
function window(b, m, { x, y, z, w, h, grille = false, shutter = false, dark = false, sill = true }) {
  b.box(m.frame, { p: [x, y, z], s: [w + 0.1, h + 0.1, 0.09] });
  b.box(dark ? m.glassDark : m.glass, { p: [x, y, z - 0.03], s: [w, h, 0.03] });
  // Sash division: one vertical mullion, one horizontal transom.
  b.box(m.frame, { p: [x, y, z - 0.045], s: [0.05, h, 0.04] });
  b.box(m.frame, { p: [x, y + h * 0.5 - 0.02, z - 0.045], s: [w, 0.05, 0.04] });
  if (sill) b.box(m.concrete, { p: [x, y - h / 2 - 0.07, z - 0.05], s: [w + 0.24, 0.07, 0.16] });
  if (grille) {
    // 面格子 — the vertical bar screen on every ground-floor window.
    for (let gx = x - w / 2 + 0.09; gx < x + w / 2; gx += 0.11) {
      b.box(m.metal, { p: [gx, y, z - 0.10], s: [0.022, h - 0.02, 0.022] });
    }
    b.box(m.metal, { p: [x, y + h / 2 - 0.03, z - 0.10], s: [w, 0.03, 0.03] });
    b.box(m.metal, { p: [x, y - h / 2 + 0.03, z - 0.10], s: [w, 0.03, 0.03] });
  }
  if (shutter) {
    // 雨戸 case tucked under the head.
    b.box(m.shutter, { p: [x, y + h / 2 + 0.14, z - 0.06], s: [w + 0.22, 0.2, 0.18] });
  }
}

/** Concrete block wall along the property line, with a gate opening. */
function blockWall(b, m, { z = 0.12, w, h = 1.05, gateX = null, gateW = 1.1 }) {
  const courses = Math.max(2, Math.round(h / 0.2));
  const spans = gateX === null
    ? [[-w / 2, w / 2]]
    : [[-w / 2, gateX - gateW / 2], [gateX + gateW / 2, w / 2]];
  for (const [x0, x1] of spans) {
    if (x1 - x0 < 0.1) continue;
    for (let i = 0; i < courses; i++) {
      const y = 0.02 + i * (h / courses) + (h / courses) / 2;
      b.box(m.block, {
        p: [(x0 + x1) / 2, y, z], s: [x1 - x0, h / courses - 0.018, 0.17],
      });
    }
    // Coping.
    b.box(m.concrete, { p: [(x0 + x1) / 2, h + 0.05, z], s: [x1 - x0 + 0.06, 0.07, 0.23] });
    // Perpend joints, staggered course by course. Running them full height
    // instead reads as a picket fence rather than as blockwork.
    for (let i = 0; i < courses; i++) {
      const y = 0.02 + i * (h / courses);
      const ch = h / courses - 0.018;
      for (let x = x0 + (i % 2 ? 0.2 : 0.5); x < x1 - 0.1; x += 0.62) {
        b.box(m.concrete, { p: [x, y + ch / 2, z - 0.09], s: [0.022, ch * 0.82, 0.02] });
      }
    }
  }
  if (gateX !== null) {
    // Aluminium gate: two posts and a set of vertical rails.
    for (const sx of [-1, 1]) {
      b.box(m.metal, { p: [gateX + sx * gateW / 2, 0.62, z], s: [0.09, 1.24, 0.14] });
    }
    for (let gx = gateX - gateW / 2 + 0.12; gx < gateX + gateW / 2 - 0.05; gx += 0.13) {
      b.box(m.metal, { p: [gx, 0.55, z], s: [0.03, 0.98, 0.03] });
    }
    b.box(m.metal, { p: [gateX, 1.06, z], s: [gateW - 0.06, 0.05, 0.05] });
    b.box(m.metal, { p: [gateX, 0.12, z], s: [gateW - 0.06, 0.05, 0.05] });
  }
}

/** Outdoor AC unit on its little bracket — one on nearly every Japanese wall. */
function acUnit(b, m, { x, y, z, ry = 0 }) {
  b.at({ p: [x, y, z], ry }, () => {
    b.box(m.ac, { p: [0, 0, 0.24], s: [0.78, 0.55, 0.30] });
    b.cyl(m.dark, { p: [0, 0, 0.085], r: 0.20, h: 0.03, seg: 14, rx: Math.PI / 2 });
    for (let i = 0; i < 5; i++) {
      b.box(m.metal, { p: [0, -0.18 + i * 0.09, 0.09], s: [0.7, 0.02, 0.02] });
    }
    b.box(m.metal, { p: [0, -0.32, 0.24], s: [0.86, 0.05, 0.36] });
    b.cyl(m.white, { p: [0.3, -0.1, 0.42], r: 0.03, h: 0.5, seg: 6, rx: 0.4 });
  });
}

function potPlant(b, m, { x, z, scale = 1, seed = 1 }) {
  const rnd = mulberry32(seed * 977);
  b.at({ p: [x, 0, z], s: scale }, () => {
    b.cyl(m.planter, { p: [0, 0.13, 0], r: 0.17, r2: 0.20, h: 0.26, seg: 10 });
    b.cyl(m.planter, { p: [0, 0.27, 0], r: 0.21, h: 0.04, seg: 10 });
    const leafMat = rnd() < 0.5 ? m.leaf : m.leafDark;
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      b.blob(leafMat, {
        p: [range(rnd, -0.12, 0.12), range(rnd, 0.36, 0.62), range(rnd, -0.12, 0.12)],
        r: range(rnd, 0.14, 0.24), seed: i + seed, w: 6, hs: 4,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// plot generators
// ---------------------------------------------------------------------------

function house(b, m, { w = 7.2, d = 8, seed = 1, wall, roof, storeys = 2 }) {
  const rnd = mulberry32(seed * 5501);
  const wallMat = wall || pick(rnd, Object.values(m.wall));
  const roofMat = roof || pick(rnd, [m.roof.slate, m.roof.warm, m.roof.dark]);
  const setback = range(rnd, 1.5, 2.6);
  const h = storeys === 2 ? 5.5 : 3.2;
  const zc = setback + d / 2;

  // Foundation and body.
  b.boxOn(m.concrete, { p: [0, 0, zc], s: [w + 0.16, 0.42, d + 0.16] });
  b.boxOn(wallMat, { p: [0, 0.4, zc], s: [w, h, d] });
  // Floor band between storeys.
  if (storeys === 2) {
    b.box(m.white, { p: [0, 3.05, zc], s: [w + 0.06, 0.14, d + 0.06] });
  }
  // Corner trims catch the ink pass and give the block an edge.
  for (const sx of [-1, 1]) {
    b.box(m.white, { p: [sx * w / 2, 0.4 + h / 2, setback + 0.01], s: [0.09, h, 0.09] });
  }

  const roofY = 0.4 + h;
  tiledRoof(b, m, { w, d, y: roofY + 1.05, rise: 1.05, tile: roofMat });

  // ---- front elevation ----------------------------------------------------
  const fz = setback - 0.03;
  const entryX = rnd() < 0.5 ? -w * 0.28 : w * 0.28;

  // 玄関: recessed porch with its own little canopy.
  b.box(m.dark, { p: [entryX, 1.55, fz + 0.16], s: [1.22, 2.2, 0.4] });
  b.box(m.woodDark, { p: [entryX, 1.48, fz + 0.02], s: [0.98, 2.0, 0.07] });
  b.box(m.glassDark, { p: [entryX, 2.05, fz - 0.02], s: [0.34, 0.72, 0.03] });
  b.box(m.metal, { p: [entryX + 0.38, 1.42, fz - 0.05], s: [0.05, 0.7, 0.05] });
  b.box(m.concrete, { p: [entryX, 0.32, fz - 0.36], s: [1.5, 0.16, 0.8] });
  b.box(m.concrete, { p: [entryX, 0.16, fz - 0.62], s: [1.5, 0.16, 0.5] });
  // Canopy over the door.
  b.box(m.metal, { p: [entryX, 2.72, fz - 0.36], s: [1.7, 0.07, 0.95], rx: 0.11 });
  for (const sx of [-1, 1]) {
    b.rod(m.metal, [entryX + sx * 0.7, 2.62, fz + 0.02], [entryX + sx * 0.7, 2.9, fz - 0.5], 0.02, 4);
  }
  // 表札 and intercom.
  b.box(m.white, { p: [entryX + 0.78, 1.62, fz + 0.01], s: [0.26, 0.11, 0.03] });
  b.box(m.dark, { p: [entryX + 0.78, 1.35, fz + 0.01], s: [0.11, 0.16, 0.04] });

  // Ground-floor window with a grille.
  const winX = -entryX;
  window(b, m, { x: winX, y: 1.72, z: fz, w: 1.9, h: 1.35, grille: true, shutter: rnd() < 0.5 });
  // Small utility window beside the entrance.
  window(b, m, { x: entryX + (entryX > 0 ? -1.5 : 1.5), y: 2.1, z: fz, w: 0.6, h: 0.7, grille: true });

  if (storeys === 2) {
    // Balcony with railing, laundry pole and hanging washing.
    const bx = winX;
    b.box(m.concrete, { p: [bx, 3.32, fz - 0.42], s: [3.0, 0.12, 0.95] });
    b.box(m.metal, { p: [bx, 3.82, fz - 0.86], s: [3.0, 0.9, 0.06] });
    for (let gx = bx - 1.42; gx <= bx + 1.42; gx += 0.16) {
      b.box(m.metal, { p: [gx, 3.82, fz - 0.86], s: [0.025, 0.86, 0.03] });
    }
    b.box(m.metal, { p: [bx, 4.28, fz - 0.86], s: [3.06, 0.06, 0.09] });
    for (const sx of [-1, 1]) {
      b.box(m.metal, { p: [bx + sx * 1.5, 3.82, fz - 0.64], s: [0.05, 0.9, 0.5] });
    }
    // 物干し竿.
    for (const sx of [-1, 1]) {
      b.box(m.metal, { p: [bx + sx * 1.15, 4.42, fz - 0.36], s: [0.05, 0.62, 0.05] });
      b.box(m.metal, { p: [bx + sx * 1.15, 4.7, fz - 0.36], s: [0.06, 0.08, 0.26] });
    }
    b.cyl(m.metal, { p: [bx, 4.72, fz - 0.36], r: 0.026, h: 2.6, seg: 6, rz: Math.PI / 2 });
    if (rnd() < 0.75) {
      // Laundry: a couple of shirts and a towel, hanging still.
      const items = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < items; i++) {
        const lx = bx - 1.0 + i * (2.0 / Math.max(1, items - 1));
        const lw = range(rnd, 0.34, 0.52);
        const lh = range(rnd, 0.5, 0.78);
        b.plane(i % 2 ? m.cloth : m.tarp, {
          p: [lx, 4.7 - lh / 2 - 0.03, fz - 0.36], s: [lw, lh, 1],
        });
      }
    }
    if (rnd() < 0.4) {
      // A futon over the rail — unmistakably a Japanese suburb on a clear day.
      b.box(m.cloth, { p: [bx + range(rnd, -0.5, 0.5), 4.16, fz - 0.86], s: [1.3, 0.22, 0.6] });
    }
    // Upper-floor windows.
    window(b, m, { x: bx, y: 4.2, z: fz - 0.02, w: 2.4, h: 1.35, dark: true, sill: false });
    window(b, m, { x: entryX, y: 4.24, z: fz, w: 1.1, h: 1.1, shutter: rnd() < 0.4 });
  }

  // Downpipes at the corners, meters, and a gas box.
  for (const sx of [-1, 1]) {
    b.cyl(m.white, {
      p: [sx * (w / 2 - 0.09), (0.4 + h) / 2, setback + 0.06], r: 0.045, h: 0.4 + h, seg: 8,
    });
  }
  b.box(m.white, { p: [-entryX * 0.2 + w * 0.42, 1.55, fz + 0.01], s: [0.3, 0.42, 0.13] });
  b.box(m.metal, { p: [-entryX * 0.2 + w * 0.42, 1.15, fz + 0.01], s: [0.24, 0.3, 0.1] });

  acUnit(b, m, { x: w * 0.36, y: 0.72, z: setback - 0.35, ry: Math.PI });

  // ---- forecourt ----------------------------------------------------------
  const gateX = entryX;
  blockWall(b, m, { w: w + 1.4, h: range(rnd, 0.85, 1.25), gateX, gateW: 1.15 });
  // Path from the gate to the door.
  b.slab(m.concrete, { p: [gateX, 0.03, setback / 2], s: [1.2, setback] });
  // Gravel / planting either side of the path.
  for (let i = 0; i < 4 + Math.floor(rnd() * 4); i++) {
    potPlant(b, m, {
      x: range(rnd, -w / 2 + 0.4, w / 2 - 0.4),
      z: range(rnd, 0.45, setback - 0.25),
      scale: range(rnd, 0.8, 1.25), seed: seed * 7 + i,
    });
  }
  if (rnd() < 0.5) {
    // A bicycle parked in the forecourt corner is basically mandatory.
    b.box(m.metal, { p: [w * 0.36, 0.02, setback * 0.55], s: [0.6, 0.03, 1.5] });
  }
}

/**
 * The hero shopfront: 青空商店. Sign board, striped awning, glazed front,
 * crates of produce, a 暖簾 and a bank of vending machines to one side.
 */
function shop(b, m, {
  name = '青空商店', sub = 'AOZORA STORE', seed = 3,
  w = 9.5, d = 7.5, accent = C.awningRed, signBg = C.signBlue,
}) {
  const rnd = mulberry32(seed * 331);
  const setback = 0.85;
  const h = 4.4;
  const zc = setback + d / 2;

  b.boxOn(m.concrete, { p: [0, 0, zc], s: [w + 0.18, 0.3, d + 0.18] });
  b.boxOn(m.wall.beige, { p: [0, 0.28, zc], s: [w, h, d] });
  // Flat roof with a parapet — shops rarely get a tile roof.
  b.box(m.concrete, { p: [0, 0.28 + h + 0.24, zc], s: [w + 0.3, 0.48, d + 0.3] });
  b.box(m.roof.dark, { p: [0, 0.28 + h + 0.5, zc], s: [w + 0.36, 0.08, d + 0.36] });

  const fz = setback - 0.02;

  // ---- sign board ---------------------------------------------------------
  const signTex = signBoard({ text: name, sub, bg: signBg, fg: C.signWhite, border: 0xf8f6f1 });
  const signMat = toon({ color: 0xffffff, map: signTex, ramp: RAMP.three, rim: 0.15 });
  b.box(m.dark, { p: [0, 3.92, fz - 0.06], s: [w - 0.3, 1.06, 0.16] });
  // ry:π turns the quad to face the street. A PlaneGeometry faces local +Z,
  // which on these plots points *into* the building.
  b.plane(signMat, { p: [0, 3.92, fz - 0.15], s: [w - 0.42, 0.92, 1], ry: Math.PI });
  // Two lamps on gooseneck arms lighting the board.
  for (const sx of [-1, 1]) {
    b.rod(m.metal, [sx * w * 0.26, 4.62, fz - 0.1], [sx * w * 0.26, 4.62, fz - 0.62], 0.026, 5);
    b.cyl(m.metal, {
      p: [sx * w * 0.26, 4.56, fz - 0.66], r: 0.13, r2: 0.06, h: 0.16, seg: 10,
    });
  }
  // 袖看板 sticking out perpendicular so it reads from up the street.
  const bladeTex = verticalSign({ text: '商店', bg: signBg, fg: C.signWhite });
  const bladeMat = toon({ color: 0xffffff, map: bladeTex, ramp: RAMP.three, rim: 0.15, side: THREE.DoubleSide });
  b.box(m.metal, { p: [-w / 2 - 0.05, 3.3, fz - 0.02], s: [0.12, 0.12, 0.5] });
  b.plane(bladeMat, { p: [-w / 2 - 0.42, 2.9, fz - 0.02], s: [0.62, 1.9, 1], ry: Math.PI / 2 });

  // ---- awning -------------------------------------------------------------
  const awnMat = toon({
    color: 0xffffff, ramp: RAMP.four, rim: 0.1, side: THREE.DoubleSide,
    map: awningStripes({ a: accent, b: C.awningStripe, count: 14 }),
  });
  const awnDepth = 1.85;
  b.box(awnMat, { p: [0, 3.06, fz - awnDepth / 2], s: [w - 0.5, 0.06, awnDepth], rx: 0.16 });
  // Valance hanging off the front edge, with a scalloped feel from the stripes.
  b.box(awnMat, { p: [0, 2.72, fz - awnDepth], s: [w - 0.5, 0.34, 0.05] });
  for (const sx of [-1, 1]) {
    b.rod(m.metal, [sx * (w / 2 - 0.3), 3.32, fz - 0.02],
      [sx * (w / 2 - 0.3), 2.94, fz - awnDepth], 0.03, 5);
    b.rod(m.metal, [sx * (w / 2 - 0.3), 2.96, fz - awnDepth],
      [sx * (w / 2 - 0.3), 2.2, fz - 0.02], 0.022, 5);
  }
  b.rod(m.metal, [-(w / 2 - 0.3), 2.94, fz - awnDepth], [w / 2 - 0.3, 2.94, fz - awnDepth], 0.03, 6);

  // ---- glazed front -------------------------------------------------------
  const interior = toon({
    color: 0xffffff, ramp: RAMP.two, rim: 0.05,
    map: shopInterior({ tint: C.wallCream, seed }),
  });
  const glassW = w - 2.6;
  b.plane(interior, { p: [-0.4, 1.62, fz - 0.03], s: [glassW, 2.5, 1], ry: Math.PI });
  // Sash grid over the glass.
  for (let gx = -0.4 - glassW / 2; gx <= -0.4 + glassW / 2 + 0.01; gx += glassW / 4) {
    b.box(m.frame, { p: [gx, 1.62, fz - 0.07], s: [0.07, 2.56, 0.08] });
  }
  b.box(m.frame, { p: [-0.4, 2.9, fz - 0.07], s: [glassW + 0.1, 0.12, 0.1] });
  b.box(m.frame, { p: [-0.4, 0.4, fz - 0.07], s: [glassW + 0.1, 0.24, 0.12] });
  // Shutter box above the glazing.
  b.box(m.shutter, { p: [-0.4, 3.12, fz + 0.04], s: [glassW + 0.3, 0.3, 0.28] });

  // 暖簾 across the entrance.
  const norenMat = toon({ color: C.noren, ramp: RAMP.four, rim: 0.1, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    b.plane(norenMat, { p: [-0.4 - 1.2 + i * 0.8, 2.44, fz - 0.14], s: [0.74, 0.62, 1] });
  }
  b.cyl(m.woodDark, { p: [-0.4, 2.76, fz - 0.14], r: 0.028, h: 3.4, seg: 6, rz: Math.PI / 2 });

  // ---- goods on the pavement ---------------------------------------------
  const crate = toon({ color: 0xd9c9a8, ramp: RAMP.three, rim: 0.15 });
  const produce = [0xe8623c, 0x6aa84f, 0xf2c53f, 0xd94a6a, 0x8f6fd0];
  for (let i = 0; i < 4; i++) {
    const cx = w * 0.30 - i * 0.62;
    const cz = fz - 0.62 - (i % 2) * 0.5;
    b.box(crate, { p: [cx, 0.16, cz], s: [0.56, 0.30, 0.42], ry: range(rnd, -0.15, 0.15) });
    b.box(crate, { p: [cx, 0.46, cz], s: [0.56, 0.30, 0.42], ry: range(rnd, -0.15, 0.15) });
    for (let k = 0; k < 5; k++) {
      b.sphere(toon({ color: pick(rnd, produce), ramp: RAMP.four, rim: 0.2 }), {
        p: [cx + range(rnd, -0.2, 0.2), 0.66, cz + range(rnd, -0.14, 0.14)],
        r: range(rnd, 0.06, 0.1), w: 7, hs: 5,
      });
    }
  }
  // A-board on the kerb.
  for (const rz of [0.18, -0.18]) {
    b.box(m.woodLight, { p: [-w * 0.36 + rz * 0.8, 0.42, fz - 1.3], s: [0.5, 0.84, 0.04], rx: rz });
  }
  potPlant(b, m, { x: -w * 0.44, z: fz - 0.5, scale: 1.35, seed: seed + 11 });
  potPlant(b, m, { x: -w * 0.44, z: fz - 1.05, scale: 1.1, seed: seed + 12 });

  acUnit(b, m, { x: w * 0.42, y: 3.6, z: setback + 0.1, ry: Math.PI });
}

/** A narrow shop with a coloured awning — the filler along a 商店街. */
function smallShop(b, m, { name, sub = '', accent, signBg, w = 6.2, d = 6.5, seed = 5, banner = null }) {
  const rnd = mulberry32(seed * 719);
  const setback = 0.7;
  const h = 3.5;
  const zc = setback + d / 2;

  b.boxOn(m.concrete, { p: [0, 0, zc], s: [w + 0.14, 0.26, d + 0.14] });
  b.boxOn(m.wall.warm, { p: [0, 0.24, zc], s: [w, h, d] });
  b.box(m.concrete, { p: [0, 0.24 + h + 0.2, zc], s: [w + 0.26, 0.4, d + 0.26] });

  const fz = setback - 0.02;
  const signTex = signBoard({ text: name, sub, bg: signBg, fg: C.signWhite, border: null, h: 200 });
  const signMat = toon({ color: 0xffffff, map: signTex, ramp: RAMP.three, rim: 0.15 });
  b.box(m.dark, { p: [0, 3.16, fz - 0.05], s: [w - 0.2, 0.8, 0.14] });
  b.plane(signMat, { p: [0, 3.16, fz - 0.13], s: [w - 0.34, 0.68, 1], ry: Math.PI });

  const awnMat = toon({
    color: 0xffffff, ramp: RAMP.four, rim: 0.1, side: THREE.DoubleSide,
    map: awningStripes({ a: accent, b: C.awningStripe, count: 10 }),
  });
  b.box(awnMat, { p: [0, 2.5, fz - 0.75], s: [w - 0.4, 0.05, 1.5], rx: 0.19 });
  b.box(awnMat, { p: [0, 2.2, fz - 1.5], s: [w - 0.4, 0.3, 0.05] });
  for (const sx of [-1, 1]) {
    b.rod(m.metal, [sx * (w / 2 - 0.26), 2.68, fz], [sx * (w / 2 - 0.26), 2.4, fz - 1.5], 0.026, 5);
  }

  const interior = toon({
    color: 0xffffff, ramp: RAMP.two, rim: 0.05,
    map: shopInterior({ tint: C.wallBeige, seed: seed + 2 }),
  });
  b.plane(interior, { p: [0, 1.4, fz - 0.03], s: [w - 1.4, 2.1, 1], ry: Math.PI });
  for (let gx = -(w - 1.4) / 2; gx <= (w - 1.4) / 2 + 0.01; gx += (w - 1.4) / 3) {
    b.box(m.frame, { p: [gx, 1.4, fz - 0.07], s: [0.07, 2.16, 0.08] });
  }
  b.box(m.frame, { p: [0, 0.36, fz - 0.07], s: [w - 1.3, 0.2, 0.11] });

  if (banner) {
    // 幟 on a pole by the kerb — the 氷 flag outside an ice shop.
    const bm = toon({
      color: 0xffffff, ramp: RAMP.three, rim: 0.1, side: THREE.DoubleSide,
      map: verticalSign({ text: banner.text, bg: banner.bg, fg: banner.fg }),
    });
    const bxp = -w * 0.40;
    b.cyl(m.metal, { p: [bxp, 1.3, fz - 1.75], r: 0.03, h: 2.6, seg: 6 });
    b.box(m.metal, { p: [bxp, 0.06, fz - 1.75], s: [0.4, 0.12, 0.4] });
    b.plane(bm, { p: [bxp + 0.36, 1.72, fz - 1.75], s: [0.66, 1.72, 1] });
    b.cyl(m.metal, { p: [bxp + 0.2, 2.58, fz - 1.75], r: 0.018, h: 0.42, seg: 5, rz: Math.PI / 2 });
  }

  for (let i = 0; i < 3; i++) {
    potPlant(b, m, {
      x: range(rnd, -w * 0.45, w * 0.45), z: fz - range(rnd, 0.3, 0.9),
      scale: range(rnd, 0.9, 1.3), seed: seed * 3 + i,
    });
  }
  acUnit(b, m, { x: w * 0.38, y: 2.9, z: setback + 0.08, ry: Math.PI });
}

/** Two-storey walk-up アパート with an external corridor and stair. */
function apartment(b, m, { w = 11, d = 7, seed = 9, wall }) {
  const rnd = mulberry32(seed * 1301);
  const wallMat = wall || m.wall.grey;
  const setback = 1.4;
  const zc = setback + d / 2;
  const h = 5.9;

  b.boxOn(m.concrete, { p: [0, 0, zc], s: [w + 0.2, 0.35, d + 0.2] });
  b.boxOn(wallMat, { p: [0, 0.33, zc], s: [w, h, d] });
  tiledRoof(b, m, { w, d, y: 0.33 + h + 0.75, rise: 0.75, tile: m.roof.dark, overhang: 0.5 });

  const fz = setback - 0.02;
  // Access deck at first floor with its railing.
  b.box(m.concrete, { p: [0, 3.02, fz - 0.62], s: [w, 0.16, 1.25] });
  b.box(m.metal, { p: [0, 3.52, fz - 1.2], s: [w, 0.05, 0.07] });
  b.box(m.metal, { p: [0, 3.14, fz - 1.2], s: [w, 0.05, 0.07] });
  for (let gx = -w / 2 + 0.1; gx < w / 2; gx += 0.15) {
    b.box(m.metal, { p: [gx, 3.34, fz - 1.2], s: [0.025, 0.44, 0.03] });
  }
  for (let gx = -w / 2 + 0.6; gx < w / 2; gx += 2.4) {
    b.box(m.metal, { p: [gx, 1.6, fz - 1.2], s: [0.11, 3.0, 0.11] });
  }

  // Four doors per floor, with meters and a little balcony rail below.
  for (let i = 0; i < 4; i++) {
    const dx = -w / 2 + w * (i + 0.5) / 4;
    for (const [y, z] of [[1.35, fz], [4.05, fz - 0.05]]) {
      b.box(m.dark, { p: [dx, y, z + 0.12], s: [1.0, 2.1, 0.3] });
      b.box(m.woodDark, { p: [dx, y, z], s: [0.86, 1.98, 0.06] });
      b.box(m.metal, { p: [dx + 0.32, y - 0.05, z - 0.05], s: [0.04, 0.5, 0.04] });
      b.box(m.white, { p: [dx + 0.62, y + 0.5, z], s: [0.22, 0.3, 0.1] });
      window(b, m, { x: dx - 0.85, y: y + 0.35, z, w: 0.55, h: 0.65, grille: true, sill: false });
    }
    acUnit(b, m, { x: dx + 0.3, y: 0.6, z: setback - 0.4, ry: Math.PI });
  }

  // External stair.
  //
  // It runs *along* the building, parallel to the access deck, which is how
  // these are actually built — a flight running away from the facade would
  // either climb into the wall or land out in the street.
  //
  // Rise and run are chosen first and everything else is derived from them.
  // Hard-coding a tilt separately is how the stringers end up leaning the
  // opposite way to the treads they are supposed to carry.
  const STEPS = 13;
  const RISE = 0.232;                       // 13 × 0.232 ≈ the 3.02m deck height
  const RUN = 0.27;
  const sz = fz - 1.62;                     // just outside the deck's railing
  const xBot = w / 2 - 0.25;                // bottom of the flight
  const y0 = 0.28;
  const runLen = Math.hypot(RISE, RUN) * STEPS;
  // The flight climbs toward −X, so the +X end of a stringer must drop:
  // rotating about Z by −θ sends +X downward.
  const tilt = -Math.atan2(RISE, RUN);
  const midX = xBot - (RUN * (STEPS - 1)) / 2;
  const midY = y0 + (RISE * (STEPS - 1)) / 2;

  for (let i = 0; i < STEPS; i++) {
    const x = xBot - i * RUN;
    const y = y0 + i * RISE;
    b.box(m.metal, { p: [x, y, sz], s: [RUN + 0.03, 0.045, 1.05] });      // tread
    b.box(m.dark, { p: [x + RUN / 2 - 0.02, y - RISE / 2, sz], s: [0.03, RISE - 0.05, 1.05] }); // riser
  }
  for (const side of [-1, 1]) {
    const zz = sz + side * 0.55;
    b.box(m.metal, { p: [midX, midY - 0.14, zz], s: [runLen, 0.20, 0.06], rz: tilt });
    b.box(m.metal, { p: [midX, midY + 0.90, zz], s: [runLen, 0.05, 0.05], rz: tilt });
    for (let i = 1; i < STEPS; i += 3) {
      b.box(m.metal, {
        p: [xBot - i * RUN, y0 + i * RISE + 0.45, zz], s: [0.04, 0.94, 0.04],
      });
    }
  }
  // Top landing, bridging back to the access deck.
  const xTop = xBot - (STEPS - 1) * RUN;
  b.box(m.concrete, { p: [xTop - 0.45, y0 + (STEPS - 1) * RISE, sz], s: [0.9, 0.10, 1.05] });
  b.box(m.concrete, { p: [xTop - 0.45, y0 + (STEPS - 1) * RISE, sz + 0.62], s: [0.9, 0.10, 0.9] });
  // The columns carrying the flight.
  for (const x of [xBot - RUN * 3, xBot - RUN * 8]) {
    b.box(m.metal, { p: [x, (y0 + RISE * ((xBot - x) / RUN)) / 2, sz], s: [0.09, y0 + RISE * ((xBot - x) / RUN), 0.09] });
  }

  // Mailboxes and a bicycle rack in the forecourt.
  b.box(m.metal, { p: [-w / 2 + 0.9, 1.1, fz - 1.5], s: [1.3, 0.75, 0.3] });
  for (let i = 0; i < 4; i++) {
    b.box(m.dark, { p: [-w / 2 + 0.42 + i * 0.32, 1.1, fz - 1.66], s: [0.28, 0.66, 0.03] });
  }
  b.box(m.metal, { p: [-w / 2 + 0.9, 0.36, fz - 1.5], s: [0.1, 0.72, 0.1] });

  for (let i = 0; i < 5; i++) {
    potPlant(b, m, {
      x: range(rnd, -w / 2 + 0.5, w / 2 - 0.5), z: range(rnd, 0.3, setback - 0.2),
      scale: range(rnd, 0.85, 1.2), seed: seed * 13 + i,
    });
  }
  blockWall(b, m, { w: w + 0.8, h: 0.62, gateX: -w * 0.3, gateW: 2.6 });
}

/** A gap in the street wall: parking bay, hedge, or a tiny 稲荷 shrine. */
function lot(b, m, { w = 6, seed = 11, kind = 'parking' }) {
  const rnd = mulberry32(seed * 173);
  if (kind === 'parking') {
    b.slab(m.concrete, { p: [0, 0.02, 3.2], s: [w, 6.4] });
    for (let i = 0; i <= 2; i++) {
      b.slab(m.white, { p: [-w / 2 + w * i / 2, 0.03, 3.2], s: [0.1, 6.2] });
    }
    b.slab(m.white, { p: [0, 0.03, 0.35], s: [w, 0.1] });
    // Wheel stops and a coin-parking pole.
    for (let i = 0; i < 2; i++) {
      b.boxOn(m.concrete, { p: [-w / 4 + i * w / 2, 0.02, 5.4], s: [1.5, 0.12, 0.16] });
    }
    for (let i = 0; i < 3; i++) {
      b.cyl(m.metal, { p: [-w / 2 + 0.3 + i * (w - 0.6) / 2, 0.4, 0.3], r: 0.04, h: 0.8, seg: 6 });
      b.sphere(m.dark, { p: [-w / 2 + 0.3 + i * (w - 0.6) / 2, 0.82, 0.3], r: 0.05, w: 8, hs: 6 });
      b.box(m.metal, {
        p: [-w / 2 + 0.3 + i * (w - 0.6) / 2 + (w - 0.6) / 4, 0.7, 0.3],
        s: [(w - 0.6) / 2, 0.03, 0.03],
      });
    }
  } else {
    // Hedge-backed side alley — gives the street somewhere to breathe.
    b.slab(m.concrete, { p: [0, 0.02, 3.0], s: [w, 6.0] });
    for (let i = 0; i < 8; i++) {
      b.blob(m.leafDark, {
        p: [range(rnd, -w / 2, w / 2), 0.6, 5.6], r: range(rnd, 0.55, 0.85),
        seed: seed + i, w: 6, hs: 4,
      });
    }
    b.boxOn(m.block, { p: [0, 0, 5.95], s: [w, 1.5, 0.18] });
  }
}

// ---------------------------------------------------------------------------
// street composition
// ---------------------------------------------------------------------------

/**
 * Each entry is [side, centreZ, generator, params]. Composed by hand rather
 * than randomised, because the sightline down the street — shop, gap, houses,
 * crossing — is the whole point.
 */
const PLOTS = [
  ['E', -58, house, { w: 7.6, d: 8.2, seed: 21 }],
  ['E', -48, house, { w: 7.0, d: 7.6, seed: 22, storeys: 2 }],
  ['E', -38, apartment, { w: 11.5, d: 7.5, seed: 23 }],
  ['E', -27, lot, { w: 6.5, seed: 24, kind: 'parking' }],
  ['E', -18.5, house, { w: 7.4, d: 8.0, seed: 25 }],
  ['E', -8.5, smallShop, {
    name: '田中ベーカリー', sub: 'BAKERY', accent: C.awningGreen,
    signBg: 0x3f6b4a, w: 6.6, d: 6.8, seed: 26,
  }],
  ['E', 2.5, shop, {
    name: '青空商店', sub: 'AOZORA STORE', seed: 27,
    w: 9.8, d: 7.8, accent: C.awningRed, signBg: C.signBlue,
  }],
  ['E', 11.5, smallShop, {
    name: '丸山米穀店', sub: '', accent: 0xd8a13a, signBg: 0x8a5a2a,
    w: 6.0, d: 6.4, seed: 28,
  }],
  ['E', 30.5, house, { w: 7.2, d: 7.8, seed: 29 }],
  ['E', 40, smallShop, {
    name: 'こばやし理容', sub: 'BARBER', accent: 0x3d72b0,
    signBg: 0x2f5d8a, w: 6.0, d: 6.2, seed: 30,
  }],
  ['E', 50, house, { w: 7.6, d: 8.0, seed: 31 }],

  ['W', -60, house, { w: 7.2, d: 7.8, seed: 41 }],
  ['W', -50, lot, { w: 6.0, seed: 42, kind: 'alley' }],
  ['W', -41, house, { w: 7.8, d: 8.4, seed: 43 }],
  ['W', -30, apartment, { w: 11.0, d: 7.2, seed: 44, wall: null }],
  ['W', -19, house, { w: 7.0, d: 7.4, seed: 45 }],
  ['W', -9.5, smallShop, {
    name: '氷', sub: 'KAKIGŌRI', accent: 0xc94a44, signBg: 0xc94a44,
    w: 5.8, d: 6.0, seed: 46,
    banner: { text: '氷', bg: 0xf8f6f1, fg: 0xc22f2f },
  }],
  ['W', 0.5, house, { w: 7.4, d: 8.0, seed: 47 }],
  ['W', 10.5, house, { w: 7.0, d: 7.6, seed: 48, storeys: 2 }],
  ['W', 31, apartment, { w: 11.0, d: 7.4, seed: 49 }],
  ['W', 42, house, { w: 7.4, d: 7.8, seed: 50 }],
  ['W', 52, house, { w: 7.0, d: 7.4, seed: 51 }],
];

export function buildBuildings() {
  const b = new Builder('buildings', { chunk: 44 });
  const m = mats();

  // Plots are stamped at pavement level so forecourts, gates and block walls
  // meet the footway instead of hovering over a step.
  for (const [side, z, gen, params] of PLOTS) {
    const east = side === 'E';
    b.at({
      p: [east ? L.buildLine : -L.buildLine, L.walkY, z],
      ry: east ? Math.PI / 2 : -Math.PI / 2,
    }, () => gen(b, m, params));
  }

  // A back row, set well behind the front plots, so gaps don't show open sky
  // at ground level and the street feels embedded in a town.
  const rnd = mulberry32(60321);
  for (let i = 0; i < 15; i++) {
    const east = i % 2 === 0;
    const z = -70 + i * 9.6 + range(rnd, -2, 2);
    const x = (east ? 1 : -1) * range(rnd, 17, 27);
    if (Math.abs(z - L.railZ) < 9) continue;
    b.at({ p: [x, 0, z], ry: range(rnd, -Math.PI, Math.PI) }, () => {
      house(b, m, { w: range(rnd, 6.4, 8.4), d: range(rnd, 6.5, 8.5), seed: 100 + i });
    });
  }

  return b.build();
}
