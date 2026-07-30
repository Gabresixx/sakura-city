import * as THREE from 'three';
import { Builder, mulberry32, range } from '../core/geo.js';
import { toon, RAMP } from '../core/materials.js';
import { roadText } from '../core/paint.js';
import { C } from '../core/palette.js';
import { L, ROAD_SPANS, inCrossing } from './layout.js';

/**
 * Ground, asphalt, kerbs, pavement, and every bit of paint and ironwork on it.
 *
 * Streets read as fake when they're one clean quad. What sells a real
 * Japanese 生活道路 is the small stuff: the concrete gutter hugging the kerb,
 * the seam where a utility trench was patched, tactile paving running past the
 * shopfronts, and manhole covers that never quite line up with anything.
 */

function decal(map, opacity = 1) {
  return toon({
    color: 0xffffff, map, ramp: RAMP.two, rim: 0,
    transparent: true, opacity, depthWrite: false, alphaTest: 0.04,
  });
}

export function buildRoad() {
  const b = new Builder('road', { chunk: 44 });
  const rnd = mulberry32(20260730);

  const matGround = toon({ color: C.dirt, ramp: RAMP.four, rim: 0 });
  const matAsphalt = toon({ color: C.asphalt, ramp: RAMP.three, rim: 0.05 });
  const matPatch = toon({ color: C.asphaltWorn, ramp: RAMP.three, rim: 0 });
  const matLine = toon({ color: C.roadLine, ramp: RAMP.two, rim: 0 });
  const matWalk = toon({ color: C.sidewalk, ramp: RAMP.three, rim: 0.06 });
  const matKerb = toon({ color: C.curb, ramp: RAMP.three, rim: 0.1 });
  const matTactile = toon({ color: C.tactile, ramp: RAMP.three, rim: 0.12 });
  const matDrain = toon({ color: C.drain, ramp: RAMP.three, rim: 0.08 });
  const matGutter = toon({ color: C.sidewalkEdge, ramp: RAMP.three, rim: 0 });
  const matManhole = toon({ color: C.manhole, ramp: RAMP.three, rim: 0.1 });

  // ---- base terrain -------------------------------------------------------
  // Sits just below the asphalt so nothing z-fights, and reads as packed dirt
  // in the gaps between buildings.
  b.slab(matGround, { p: [0, -0.06, -8], s: [420, 420] });

  // ---- asphalt ------------------------------------------------------------
  // Split around the crossing: the level crossing has its own deck.
  const spans = ROAD_SPANS;
  for (const [z0, z1] of spans) {
    b.slab(matAsphalt, { p: [0, 0, (z0 + z1) / 2], s: [L.roadHalf * 2, z1 - z0] });
  }

  // Repair patches and trench seams. Slightly different shade, slightly askew —
  // that misalignment is most of the realism.
  for (let i = 0; i < 22; i++) {
    const z = range(rnd, L.zMin + 6, L.zMax - 6);
    if (inCrossing(z, 2)) continue;
    b.slab(matPatch, {
      p: [range(rnd, -2.3, 2.3), 0.004, z],
      s: [range(rnd, 0.9, 3.4), range(rnd, 0.7, 2.6)],
      rx: range(rnd, -0.05, 0.05),
    });
  }
  // Long trench scar running with the street, as if a pipe was laid.
  b.slab(matPatch, { p: [-1.35, 0.005, -30], s: [0.75, 62] });

  // ---- edge lines ---------------------------------------------------------
  // 外側線: solid, both sides, broken only for the crossing.
  for (const sx of [-1, 1]) {
    for (const [z0, z1] of spans) {
      b.slab(matLine, { p: [sx * L.lineX, 0.008, (z0 + z1) / 2], s: [0.15, z1 - z0] });
    }
  }

  // Stop bars either side of the crossing, plus 止まれ painted on the approach.
  // Japan drives on the left, so a driver heading +Z keeps to +X and one
  // heading −Z keeps to −X — the markings sit in those halves.
  for (const [z, half] of [[L.gateNear - 2.6, 1], [L.gateFar + 2.6, -1]]) {
    b.slab(matLine, { p: [half * 1.4, 0.009, z], s: [2.6, 0.32] });
  }
  const stopPaint = decal(roadText('とまれ'));
  b.slab(stopPaint, { p: [1.4, 0.011, L.gateNear - 5.4], s: [1.5, 3.6] });
  // rz flips the quad end-for-end while keeping its face pointing up.
  b.slab(stopPaint, { p: [-1.4, 0.011, L.gateFar + 5.4], s: [1.5, 3.6], rz: Math.PI });

  // ---- kerb, gutter, pavement --------------------------------------------
  // The pavement runs a little past the property line so the block walls and
  // forecourts land on it rather than on a 16cm ledge of bare ground.
  const walkW = L.walkOuter - (L.roadHalf + L.kerbW);
  for (const sx of [-1, 1]) {
    const kerbX = sx * (L.roadHalf + L.kerbW / 2);
    const walkX = sx * (L.roadHalf + L.kerbW + walkW / 2);

    for (const [z0, z1] of spans) {
      // Kerb stones, laid as discrete 2m blocks with hairline joints.
      for (let z = z0; z < z1; z += 2.0) {
        const len = Math.min(2.0, z1 - z) - 0.03;
        if (len < 0.2) continue;
        b.boxOn(matKerb, { p: [kerbX, 0, z + len / 2], s: [L.kerbW, L.kerbH, len] });
      }

      // Pavement surface, a touch above the kerb top.
      b.slab(matWalk, { p: [walkX, L.walkY, (z0 + z1) / 2], s: [walkW, z1 - z0] });
      // Slab under it, so the pavement has real thickness at its outer edge.
      b.boxOn(matGutter, {
        p: [walkX, 0, (z0 + z1) / 2], s: [walkW, L.walkY, z1 - z0],
      });

      // 側溝: concrete channel with a grate lid every 60cm.
      const gutX = sx * (L.roadHalf - 0.16);
      b.slab(matGutter, { p: [gutX, 0.006, (z0 + z1) / 2], s: [0.30, z1 - z0] });
      for (let z = z0 + 0.4; z < z1 - 0.4; z += 0.62) {
        b.box(matDrain, { p: [gutX, 0.012, z], s: [0.26, 0.012, 0.42] });
        for (let k = 0; k < 4; k++) {
          b.box(matGutter, { p: [gutX, 0.019, z - 0.15 + k * 0.1], s: [0.24, 0.014, 0.035] });
        }
      }
    }
  }

  // ---- tactile paving -----------------------------------------------------
  // Runs along the shopfront side and turns to warning dots at the crossing.
  const tacX = L.roadHalf + L.kerbW + 0.34;
  const tacY = L.walkY + 0.01;
  const tacSpans = [[-46, L.roadEndNear], [L.roadEndFar, 46]];
  for (const [z0, z1] of tacSpans) {
    b.slab(matTactile, { p: [tacX, tacY, (z0 + z1) / 2], s: [0.34, z1 - z0] });
    // Directional bars, except in the last 1.2m before the crossing where the
    // pattern changes to dots — the real convention for a hazard.
    for (let z = z0 + 0.05; z < z1 - 0.05; z += 0.1) {
      const nearHazard = Math.abs(z - (z0 < 0 ? z1 : z0)) < 1.2 && z0 < 0
        ? z > z1 - 1.2 : z < z0 + 1.2;
      if (nearHazard) continue;
      b.box(matTactile, { p: [tacX, tacY + 0.008, z], s: [0.30, 0.016, 0.055] });
    }
    const hz = z0 < 0 ? z1 - 1.15 : z0 + 0.05;
    for (let z = hz; z < hz + 1.1; z += 0.11) {
      for (let k = -1; k <= 1; k++) {
        b.cyl(matTactile, { p: [tacX + k * 0.1, tacY + 0.008, z], r: 0.028, h: 0.016, seg: 6 });
      }
    }
  }

  // ---- the road running on ------------------------------------------------
  // Plain asphalt beyond the detailed stretch, so the street carries into the
  // distant town instead of stopping at a hard edge in mid-air.
  for (const [z0, z1] of [[L.zMax - 0.1, 140], [-140, L.zMin + 0.1]]) {
    b.slab(matAsphalt, { p: [0, 0, (z0 + z1) / 2], s: [L.roadHalf * 2, z1 - z0] });
    for (const sx of [-1, 1]) {
      b.slab(matLine, { p: [sx * L.lineX, 0.008, (z0 + z1) / 2], s: [0.15, z1 - z0] });
      b.boxOn(matWalk, {
        p: [sx * (L.roadHalf + 0.9), 0, (z0 + z1) / 2], s: [1.8, L.walkY, z1 - z0],
      });
    }
  }

  // ---- ironware -----------------------------------------------------------
  const manholes = [[-1.1, -34], [1.6, -12], [-0.7, 6], [1.2, 34], [-1.8, 48]];
  for (const [x, z] of manholes) {
    b.cyl(matManhole, { p: [x, 0.008, z], r: 0.33, h: 0.02, seg: 16 });
    b.cyl(matDrain, { p: [x, 0.019, z], r: 0.28, h: 0.008, seg: 16 });
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      b.box(matManhole, {
        p: [x + Math.cos(ang) * 0.16, 0.024, z + Math.sin(ang) * 0.16],
        s: [0.16, 0.008, 0.05], ry: -ang,
      });
    }
  }

  // Concrete bollards keeping cars off the pavement at the crossing approach.
  for (const sx of [-1, 1]) {
    for (const z of [L.gateNear - 1.9, L.gateFar + 1.9]) {
      b.cyl(matKerb, {
        p: [sx * (L.roadHalf + L.kerbW + 0.5), L.walkY + 0.34, z], r: 0.055, h: 0.68, seg: 8,
      });
      b.sphere(toon({ color: C.roadLine, rim: 0.2 }), {
        p: [sx * (L.roadHalf + L.kerbW + 0.5), L.walkY + 0.70, z], r: 0.058, w: 8, hs: 6,
      });
    }
  }

  return b.build();
}

/**
 * Distant town + treeline, drawn as flat silhouettes and dropped into the fog.
 * Without this the horizon is an empty gradient and the street feels staged.
 */
export function buildBackdrop() {
  const b = new Builder('backdrop');
  const rnd = mulberry32(4477);
  // Darker than they "should" be: fog lifts them a long way toward the sky
  // colour, and a light base turns the far end of the street into a white wall.
  const far = toon({ color: 0x9c99b4, ramp: RAMP.two, rim: 0 });
  const farRoof = toon({ color: 0x8a87a6, ramp: RAMP.two, rim: 0 });
  const farTree = toon({ color: 0x8fa39e, ramp: RAMP.two, rim: 0 });

  // The street has to terminate in more town, not in open sky — a corridor
  // that runs out into nothing is the fastest way to make a set feel like a set.
  const inCorridor = (x, z) => Math.abs(x) < 13 && z > -96 && z < 78;

  for (let i = 0; i < 190; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = range(rnd, 88, 165);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist - 6;
    if (inCorridor(x, z)) continue;
    const w = range(rnd, 5, 13);
    const h = range(rnd, 4, 13);
    const d = range(rnd, 5, 12);
    b.boxOn(far, { p: [x, -0.4, z], s: [w, h, d], ry: range(rnd, -0.5, 0.5) });
    if (rnd() < 0.6) {
      b.boxOn(farRoof, { p: [x, h - 0.4, z], s: [w * 1.06, 0.5, d * 1.06], ry: 0 });
    }
  }
  // A cross-street of buildings closing each end of the corridor, so the view
  // down the road stops on rooftops instead of on the horizon line.
  for (const [zc, spread] of [[124, 44], [-136, 44]]) {
    for (let i = 0; i < 34; i++) {
      const x = range(rnd, -spread, spread);
      // Leave the road's own line of sight open, or the street terminates in
      // a flat wall instead of running away into the town.
      if (Math.abs(x) < 9) continue;
      const z = zc + range(rnd, -22, 30);
      const w = range(rnd, 5, 13);
      const h = range(rnd, 3.5, 12);
      b.boxOn(far, { p: [x, -0.4, z], s: [w, h, range(rnd, 6, 12)], ry: range(rnd, -0.35, 0.35) });
      b.boxOn(farRoof, { p: [x, h - 0.4, z], s: [w * 1.08, 0.6, 8] });
    }
  }

  for (let i = 0; i < 120; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = range(rnd, 80, 175);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist - 6;
    if (inCorridor(x, z)) continue;
    b.blob(farTree, {
      p: [x, range(rnd, 3, 7), z], r: range(rnd, 3, 6.5), seed: i + 1, w: 6, hs: 4,
    });
  }

  // Low hills closing the far distance.
  const hill = toon({ color: 0xb4bdd4, ramp: RAMP.two, rim: 0 });
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    b.sphere(hill, {
      p: [Math.cos(ang) * 230, -8, Math.sin(ang) * 230 - 6],
      s: [range(rnd, 90, 150), range(rnd, 26, 46), 70], w: 10, hs: 6,
    });
  }

  const g = b.build({ castShadow: false, receiveShadow: false });
  g.traverse((o) => { o.frustumCulled = false; });
  return g;
}
