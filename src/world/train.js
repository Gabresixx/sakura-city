import * as THREE from 'three';
import { Builder, mulberry32, range } from '../core/geo.js';
import { toon, RAMP } from '../core/materials.js';
import { C } from '../core/palette.js';
import { L } from './layout.js';

/**
 * A four-car stainless-steel commuter EMU.
 *
 * Proportions follow a real 20m Japanese commuter car — 19.5m over couplers,
 * 2.88m wide, bogies 13.8m apart — because those ratios are readable even in a
 * heavily stylised scene.
 *
 * The bodyside is *geometry*, not a painted texture. That is the whole point:
 * a flat texture on a flat box reads as a sticker no matter how good the paint
 * is. What makes a train look like a train is relief — a recessed window band,
 * individual sash frames standing proud of it, door leaves sunk into their
 * pockets with a reveal all round, corrugation on the lower body, a waist rail
 * and a cant rail catching the light along the whole length.
 *
 * Metal then comes from three things: a cool grey base, a strong sun-side rim
 * (there is no specular lobe in cel shading, so the rim has to do that job),
 * and a brighter sheen band along the upper body faking an anisotropic
 * reflection of the sky.
 */

const CAR_LEN = 19.5;
const CAR_GAP = 0.55;
const HALF_W = 1.44;      // body half-width, across the track

// Heights above top-of-rail.
const BOT = 1.12;         // underside of the bodyshell
const WAIST = 2.06;       // top of the lower body panel
const WIN0 = 2.20;        // bottom of the window band
const WIN1 = 3.02;        // top of the window band
const TOP = 3.46;         // top of the bodyside, before the roof shoulder
const ROOF = 3.62;

const DOORS = [-7.35, -2.45, 2.45, 7.35];
const DOOR_HALF = 0.66;

function lit(rgb) {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false });
  m.color.setRGB(rgb[0], rgb[1], rgb[2]);
  return m;
}

/** Window openings: everything between the doors, split into ~1.5m sashes. */
function windowSpans() {
  const edges = [-CAR_LEN / 2 + 0.55];
  for (const d of DOORS) { edges.push(d - DOOR_HALF - 0.12); edges.push(d + DOOR_HALF + 0.12); }
  edges.push(CAR_LEN / 2 - 0.55);

  const out = [];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i], bEdge = edges[i + 1];
    const span = bEdge - a;
    if (span < 0.7) continue;
    const n = Math.max(1, Math.round(span / 1.62));
    const gap = 0.14;
    const w = (span - gap * (n - 1)) / n;
    for (let k = 0; k < n; k++) out.push({ x: a + k * (w + gap) + w / 2, w });
  }
  return out;
}

const WINDOWS = windowSpans();

// ---------------------------------------------------------------------------

function bodyside(b, m, sz) {
  const zOut = sz * HALF_W;           // outer skin
  const zRec = sz * (HALF_W - 0.055); // recessed window band

  // Sashes: a dark reveal, glass, then an aluminium frame standing proud of it.
  for (const win of WINDOWS) {
    b.box(m.recess, { p: [win.x, (WIN0 + WIN1) / 2, zRec + sz * 0.004], s: [win.w, WIN1 - WIN0, 0.02] });
    b.box(m.glass, { p: [win.x, (WIN0 + WIN1) / 2 + 0.02, zRec + sz * 0.016], s: [win.w - 0.13, WIN1 - WIN0 - 0.16, 0.02] });
    // Frame: head, sill, two stiles, plus the opening light's mullion.
    b.box(m.frame, { p: [win.x, WIN1 - 0.05, zOut - sz * 0.012], s: [win.w, 0.07, 0.055] });
    b.box(m.frame, { p: [win.x, WIN0 + 0.06, zOut - sz * 0.012], s: [win.w, 0.09, 0.06] });
    for (const s of [-1, 1]) {
      b.box(m.frame, { p: [win.x + s * (win.w / 2 - 0.03), (WIN0 + WIN1) / 2, zOut - sz * 0.012], s: [0.06, WIN1 - WIN0, 0.055] });
    }
    b.box(m.frame, { p: [win.x, WIN1 - 0.26, zOut - sz * 0.02], s: [win.w - 0.1, 0.045, 0.04] });
    // Passengers, as flat silhouettes just inside the glass.
    const r = mulberry32(Math.round((win.x + 40) * 97) + (sz > 0 ? 3 : 11));
    const n = Math.floor(range(r, 0, 3.4));
    for (let i = 0; i < n; i++) {
      const px = win.x + range(r, -win.w * 0.33, win.w * 0.33);
      b.box(m.passenger, { p: [px, WIN0 + 0.30, zRec - sz * 0.05], s: [range(r, 0.24, 0.34), 0.62, 0.02] });
      b.sphere(m.passenger, { p: [px, WIN0 + 0.66, zRec - sz * 0.05], r: 0.11, w: 7, hs: 5 });
    }
  }

  // Doors: leaves sunk into a pocket, with a reveal, a centre gap and a seal.
  for (const dx of DOORS) {
    b.box(m.recess, { p: [dx, (BOT + TOP) / 2 + 0.06, zRec], s: [DOOR_HALF * 2 + 0.09, TOP - BOT - 0.22, 0.02] });
    for (const s of [-1, 1]) {
      const cx = dx + s * (DOOR_HALF / 2 + 0.015);
      b.box(m.door, { p: [cx, (BOT + TOP) / 2 + 0.06, zOut - sz * 0.022], s: [DOOR_HALF - 0.03, TOP - BOT - 0.3, 0.05] });
      // Door glass and its frame.
      b.box(m.glass, { p: [cx, WIN1 - 0.42, zOut - sz * 0.006], s: [DOOR_HALF - 0.20, 0.78, 0.02] });
      b.box(m.frame, { p: [cx, WIN1 - 0.02, zOut - sz * 0.012], s: [DOOR_HALF - 0.12, 0.05, 0.05] });
      b.box(m.frame, { p: [cx, WIN1 - 0.83, zOut - sz * 0.012], s: [DOOR_HALF - 0.12, 0.05, 0.05] });
    }
    // Rubber seal down the meeting edge, and the pocket surround.
    b.box(m.seal, { p: [dx, (BOT + TOP) / 2 + 0.06, zOut - sz * 0.01], s: [0.045, TOP - BOT - 0.3, 0.055] });
    b.box(m.frame, { p: [dx, TOP - 0.16, zOut - sz * 0.01], s: [DOOR_HALF * 2 + 0.1, 0.05, 0.05] });
    b.box(m.frame, { p: [dx, BOT + 0.14, zOut - sz * 0.01], s: [DOOR_HALF * 2 + 0.1, 0.05, 0.05] });
    // Grab handle beside each door.
    b.rod(m.frame, [dx + DOOR_HALF + 0.11, BOT + 0.35, zOut - sz * 0.03],
      [dx + DOOR_HALF + 0.11, WIN1 - 0.1, zOut - sz * 0.03], 0.022, 5);
  }

  // Corrugation on the lower body — the stainless-steel commuter signature.
  for (let y = BOT + 0.20; y < WAIST - 0.30; y += 0.155) {
    b.box(m.rib, { p: [0, y, zOut + sz * 0.006], s: [CAR_LEN - 0.3, 0.028, 0.016] });
  }

  // Sheen: a brighter strip high on the bodyside, faking a sky reflection.
  b.box(m.sheen, { p: [0, TOP - 0.10, zOut + sz * 0.004], s: [CAR_LEN - 0.2, 0.16, 0.012] });

  // Car number and a small maker's plate.
  b.box(m.frame, { p: [-CAR_LEN / 2 + 1.0, WAIST - 0.30, zOut + sz * 0.008], s: [0.62, 0.13, 0.012] });
}

function bogie(b, m, x) {
  const { bogie: mB, metal, tyre, recess } = m;
  const half = L.gauge / 2;

  // Frame, bolster, and the traction motor slung between the axles.
  b.box(mB, { p: [x, BOT - 0.50, 0], s: [2.6, 0.30, 2.05] });
  b.box(mB, { p: [x, BOT - 0.26, 0], s: [1.45, 0.24, 1.7] });
  b.box(recess, { p: [x, BOT - 0.52, 0.42], s: [1.1, 0.42, 0.62] });

  for (const dx of [-0.95, 0.95]) {
    for (const dz of [-1, 1]) {
      // Wheel: tyre, a brighter disc, and the brake disc inboard.
      b.cyl(tyre, { p: [x + dx, BOT - 0.74, dz * half], r: 0.43, h: 0.13, seg: 16, rx: Math.PI / 2 });
      b.cyl(metal, { p: [x + dx, BOT - 0.74, dz * (half - 0.10)], r: 0.31, h: 0.10, seg: 14, rx: Math.PI / 2 });
      b.cyl(mB, { p: [x + dx, BOT - 0.74, dz * (half - 0.28)], r: 0.24, h: 0.09, seg: 14, rx: Math.PI / 2 });
      // Axle box and its primary spring.
      b.box(mB, { p: [x + dx, BOT - 0.70, dz * (half + 0.32)], s: [0.32, 0.30, 0.30] });
      b.cyl(metal, { p: [x + dx, BOT - 0.44, dz * (half + 0.32)], r: 0.10, h: 0.26, seg: 8 });
    }
    b.cyl(metal, { p: [x + dx, BOT - 0.74, 0], r: 0.075, h: L.gauge - 0.2, seg: 8, rx: Math.PI / 2 });
  }
  // Sanding pipes.
  for (const dz of [-1, 1]) {
    b.rod(metal, [x - 1.25, BOT - 0.36, dz * 0.72], [x - 1.32, BOT - 0.66, dz * (half - 0.05)], 0.025, 5);
  }
}

function underframe(b, m) {
  const { recess, metal, bogie: mB } = m;
  // Equipment boxes of varied size read far better than one long slab.
  const boxes = [
    [-4.2, 2.6, 0.62, 1.5, 0], [-1.4, 1.9, 0.5, 1.2, 0.35],
    [1.6, 2.9, 0.66, 1.6, -0.2], [4.4, 1.6, 0.44, 1.0, 0.4],
  ];
  for (const [x, w, h, d, dz] of boxes) {
    b.box(recess, { p: [x, BOT - 0.06 - h / 2, dz], s: [w, h, d] });
    b.box(mB, { p: [x, BOT - 0.08 - h, dz], s: [w * 0.92, 0.05, d * 0.92] });
  }
  // Air reservoirs.
  for (const [x, dz] of [[-6.0, -0.55], [-6.0, 0.35]]) {
    b.cyl(metal, { p: [x, BOT - 0.34, dz], r: 0.19, h: 1.7, seg: 12, rz: Math.PI / 2 });
  }
  // Cable troughs running the length.
  for (const dz of [-0.95, 0.95]) {
    b.box(mB, { p: [0, BOT - 0.12, dz], s: [CAR_LEN - 1.2, 0.10, 0.14] });
  }
}

function roof(b, m) {
  const { roofMat, recess, metal, rib } = m;

  // Shoulder chamfers, then the flat centre panel.
  for (const sz of [-1, 1]) {
    b.box(roofMat, { p: [0, TOP + 0.05, sz * (HALF_W - 0.16)], s: [CAR_LEN, 0.30, 0.40], rx: sz * 0.72 });
    // Rain gutter along the cant rail.
    b.box(m.frame, { p: [0, TOP - 0.02, sz * (HALF_W + 0.012)], s: [CAR_LEN, 0.05, 0.07] });
  }
  b.box(roofMat, { p: [0, ROOF - 0.04, 0], s: [CAR_LEN, 0.10, HALF_W * 2 - 0.52] });

  // Roof ribs across the width.
  for (let x = -CAR_LEN / 2 + 0.7; x < CAR_LEN / 2 - 0.5; x += 1.05) {
    b.box(rib, { p: [x, ROOF + 0.015, 0], s: [0.05, 0.03, HALF_W * 2 - 0.58] });
  }

  // Air-conditioning units with fan grilles.
  for (const dx of [-5.6, 0.4, 5.6]) {
    b.box(recess, { p: [dx, ROOF + 0.20, 0], s: [2.35, 0.34, 1.72] });
    b.box(m.frame, { p: [dx, ROOF + 0.38, 0], s: [2.15, 0.04, 1.52] });
    for (const fz of [-0.42, 0.42]) {
      b.cyl(metal, { p: [dx, ROOF + 0.40, fz], r: 0.30, h: 0.04, seg: 14 });
      for (let i = 0; i < 5; i++) {
        b.box(m.frame, { p: [dx - 0.24 + i * 0.12, ROOF + 0.42, fz], s: [0.04, 0.02, 0.56] });
      }
    }
  }
  // Cable duct and aerials.
  b.box(recess, { p: [-2.6, ROOF + 0.10, 0.62], s: [3.2, 0.12, 0.26] });
  b.rod(metal, [3.0, ROOF + 0.05, -0.5], [3.0, ROOF + 0.55, -0.5], 0.018, 5);
}

function pantograph(b, m, x) {
  const { metal, recess } = m;
  b.box(recess, { p: [x, ROOF + 0.08, 0], s: [2.2, 0.12, 2.0] });
  for (const dz of [-0.75, 0.75]) {
    b.cyl(recess, { p: [x - 0.9, ROOF + 0.22, dz], r: 0.12, h: 0.18, seg: 10 });
    b.cyl(m.frame, { p: [x - 0.9, ROOF + 0.34, dz], r: 0.09, h: 0.08, seg: 10 });
  }
  // Single-arm: lower arm back, upper arm forward, head on top.
  b.rod(metal, [x - 0.9, ROOF + 0.36, 0], [x + 0.1, ROOF + 1.10, 0], 0.05, 8);
  b.rod(metal, [x + 0.1, ROOF + 1.10, 0], [x - 0.6, ROOF + 1.66, 0], 0.038, 8);
  b.rod(metal, [x - 0.9, ROOF + 0.36, 0.36], [x + 0.08, ROOF + 1.06, 0.18], 0.02, 5);
  b.rod(metal, [x - 0.9, ROOF + 0.36, -0.36], [x + 0.08, ROOF + 1.06, -0.18], 0.02, 5);
  b.box(metal, { p: [x - 0.6, ROOF + 1.72, 0], s: [0.36, 0.06, 1.56] });
  b.box(recess, { p: [x - 0.6, ROOF + 1.77, 0], s: [0.20, 0.04, 1.48] });
  for (const dz of [-0.78, 0.78]) {
    b.rod(metal, [x - 0.6, ROOF + 1.72, dz], [x - 0.42, ROOF + 1.62, dz * 1.14], 0.022, 5);
  }
}

/** `end` is -1 for a cab at the low-x end, +1 at the high-x end, 0 for none. */
function cab(b, m, end) {
  const s = end;
  const nose = s * (CAR_LEN / 2 + 0.10);
  const { body, recess, glass, metal, frame, skirt } = m;
  const lights = [];

  // Front bulkhead, slightly proud of the bodyside, with a raked screen above.
  b.box(body, { p: [s * (CAR_LEN / 2 - 0.25), (BOT + TOP) / 2, 0], s: [0.72, TOP - BOT, HALF_W * 2] });
  b.box(body, { p: [nose - s * 0.06, (BOT + WAIST) / 2 + 0.1, 0], s: [0.16, WAIST - BOT + 0.2, HALF_W * 2 - 0.05] });

  // Windscreen: black mask, glass, centre pillar, wiper.
  b.box(recess, { p: [nose, WIN1 - 0.38, 0], s: [0.13, 1.10, HALF_W * 2 - 0.24] });
  b.box(glass, { p: [nose + s * 0.05, WIN1 - 0.38, 0], s: [0.05, 0.92, HALF_W * 2 - 0.48] });
  b.box(recess, { p: [nose + s * 0.06, WIN1 - 0.38, 0], s: [0.06, 0.94, 0.10] });
  b.box(frame, { p: [nose + s * 0.03, WIN1 + 0.20, 0], s: [0.12, 0.09, HALF_W * 2 - 0.2] });
  b.box(frame, { p: [nose + s * 0.03, WIN1 - 0.95, 0], s: [0.12, 0.09, HALF_W * 2 - 0.2] });
  b.rod(recess, [nose + s * 0.09, WIN1 - 0.82, -0.55], [nose + s * 0.09, WIN1 - 0.42, 0.42], 0.022, 5);

  // Destination board, lit.
  b.box(recess, { p: [nose + s * 0.02, TOP - 0.16, -0.52], s: [0.09, 0.28, 0.98] });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.20), lit([2.0, 1.85, 1.4]));
  board.position.set(nose + s * 0.075, TOP - 0.16, -0.52);
  board.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
  b.attach(board);

  // Headlight / tail-light cluster in a housing.
  for (const dz of [-1, 1]) {
    b.box(recess, { p: [nose + s * 0.02, BOT + 0.62, dz * 1.05], s: [0.10, 0.30, 0.56] });
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.115, 14), lit([3.2, 3.0, 2.5]));
    head.position.set(nose + s * 0.08, BOT + 0.62, dz * 0.93);
    head.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    b.attach(head);
    lights.push({ mesh: head, kind: 'head', end: s });

    const tail = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), lit([2.4, 0.22, 0.2]));
    tail.position.set(nose + s * 0.08, BOT + 0.62, dz * 1.17);
    tail.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    b.attach(tail);
    lights.push({ mesh: tail, kind: 'tail', end: s });
  }

  // Skirt, coupler cover, horn, handrails, and the anti-climber.
  b.box(skirt, { p: [nose - s * 0.02, BOT - 0.10, 0], s: [0.24, 0.5, HALF_W * 2 - 0.16] });
  b.box(recess, { p: [nose + s * 0.10, BOT - 0.34, 0], s: [0.42, 0.46, 0.62] });
  b.box(metal, { p: [nose + s * 0.30, BOT - 0.34, 0], s: [0.24, 0.20, 0.30] });
  b.box(frame, { p: [nose + s * 0.02, BOT + 0.12, 0], s: [0.14, 0.09, HALF_W * 2 - 0.2] });
  b.cyl(metal, { p: [nose + s * 0.04, TOP - 0.05, 0.72], r: 0.06, h: 0.16, seg: 10, rz: Math.PI / 2 });
  for (const dz of [-1, 1]) {
    b.rod(frame, [nose + s * 0.05, TOP - 0.32, dz * 1.30], [nose + s * 0.05, BOT + 0.45, dz * 1.30], 0.024, 6);
  }

  return lights;
}

function car(m, { end = 0, panto = false }) {
  const b = new Builder('car');

  // Core shell: lower body, recessed window band, upper body, waist and cant.
  b.box(m.body, { p: [0, (BOT + WAIST) / 2, 0], s: [CAR_LEN, WAIST - BOT, HALF_W * 2] });
  b.box(m.recess, { p: [0, (WIN0 + WIN1) / 2, 0], s: [CAR_LEN, WIN1 - WIN0, HALF_W * 2 - 0.11] });
  b.box(m.body, { p: [0, (WIN1 + TOP) / 2 + 0.03, 0], s: [CAR_LEN, TOP - WIN1 - 0.06, HALF_W * 2] });
  // Waist rail and cant rail — continuous highlights down the whole length.
  b.box(m.frame, { p: [0, WAIST + 0.07, 0], s: [CAR_LEN, 0.10, HALF_W * 2 + 0.03] });
  b.box(m.frame, { p: [0, WIN1 + 0.05, 0], s: [CAR_LEN, 0.08, HALF_W * 2 + 0.03] });
  // Livery band, raised off the skin so it catches its own edge light.
  b.box(m.stripe, { p: [0, WAIST - 0.20, 0], s: [CAR_LEN, 0.26, HALF_W * 2 + 0.014] });

  for (const sz of [-1, 1]) bodyside(b, m, sz);

  roof(b, m);
  underframe(b, m);
  bogie(b, m, -6.9);
  bogie(b, m, 6.9);
  if (panto) pantograph(b, m, 3.4);

  // Gangway ends.
  for (const sx of [-1, 1]) {
    if (end === sx) continue;
    b.box(m.recess, { p: [sx * (CAR_LEN / 2 + 0.04), (BOT + TOP) / 2, 0], s: [0.14, 2.05, 1.42] });
    b.box(m.seal, { p: [sx * (CAR_LEN / 2 + 0.13), (BOT + TOP) / 2, 0], s: [0.06, 2.0, 1.36] });
    b.box(m.metal, { p: [sx * (CAR_LEN / 2 + 0.2), BOT + 0.06, 0], s: [0.3, 0.26, 0.5] });
  }

  const lights = end !== 0 ? cab(b, m, end) : [];
  const g = b.build();
  g.userData.lights = lights;
  return g;
}

export function createTrain({ cars = 4, livery = C.trainStripe } = {}) {
  const m = {
    // Cool grey, high rim. In a cel scene the rim *is* the specular highlight.
    body: toon({ color: C.trainBody, ramp: RAMP.three, rim: 0.52 }),
    sheen: toon({ color: 0xf6f9ff, ramp: RAMP.two, rim: 0.7 }),
    rib: toon({ color: 0xb9c0cc, ramp: RAMP.three, rim: 0.45 }),
    recess: toon({ color: 0x6f7684, ramp: RAMP.three, rim: 0.2 }),
    frame: toon({ color: 0xc9cfd9, ramp: RAMP.three, rim: 0.6 }),
    door: toon({ color: C.trainDoor, ramp: RAMP.three, rim: 0.45 }),
    seal: toon({ color: 0x3c3f47, ramp: RAMP.two, rim: 0.25 }),
    glass: toon({ color: C.trainGlass, ramp: RAMP.two, rim: 0.62 }),
    passenger: toon({ color: 0x39404e, ramp: RAMP.two, rim: 0.1 }),
    roofMat: toon({ color: C.trainRoof, ramp: RAMP.three, rim: 0.35 }),
    skirt: toon({ color: C.trainSkirt, ramp: RAMP.three, rim: 0.25 }),
    metal: toon({ color: 0xa8aeba, ramp: RAMP.three, rim: 0.55 }),
    bogie: toon({ color: C.bogie, ramp: RAMP.three, rim: 0.3 }),
    tyre: toon({ color: C.tyre, ramp: RAMP.two, rim: 0.3 }),
    stripe: toon({ color: livery, ramp: RAMP.three, rim: 0.3 }),
  };

  const group = new THREE.Group();
  group.name = 'train';
  group.visible = false;

  const pitch = CAR_LEN + CAR_GAP;
  const total = cars * pitch - CAR_GAP;
  const allLights = [];
  for (let i = 0; i < cars; i++) {
    const end = i === 0 ? -1 : i === cars - 1 ? 1 : 0;
    const c = car(m, { end, panto: i === 1 || i === cars - 2 });
    c.position.x = -total / 2 + pitch * i + CAR_LEN / 2;
    group.add(c);
    for (const l of c.userData.lights) allLights.push(l);
  }

  const state = { active: false, dir: 1, speed: 0, x: 0 };

  return {
    group,
    length: total,
    get active() { return state.active; },
    /** Where the nose is, in world X. */
    get nose() { return state.x + state.dir * (total / 2); },

    launch({ dir = 1, trackZ = L.trackA, speed = 21, from = 215 }) {
      state.active = true;
      state.dir = dir;
      state.speed = speed;
      state.x = -dir * from;
      group.visible = true;
      group.position.set(state.x, L.railTop, trackZ);
      group.rotation.y = dir > 0 ? 0 : Math.PI;

      // Headlights lead, tail lights trail.
      for (const l of allLights) {
        const leading = l.end === (dir > 0 ? 1 : -1);
        const on = l.kind === 'head' ? leading : !leading;
        if (l.kind === 'head') {
          l.mesh.material.color.setRGB(on ? 3.2 : 0.16, on ? 3.0 : 0.15, on ? 2.5 : 0.13);
        } else {
          l.mesh.material.color.setRGB(on ? 2.4 : 0.18, on ? 0.22 : 0.04, on ? 0.20 : 0.04);
        }
      }
      return this;
    },

    update(dt) {
      if (!state.active) return false;
      state.x += state.dir * state.speed * dt;
      group.position.x = state.x;
      if (Math.abs(state.x) > 215 + total) {
        state.active = false;
        group.visible = false;
      }
      return state.active;
    },
  };
}
