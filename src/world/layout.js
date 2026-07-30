/**
 * One source of truth for where everything sits.
 *
 * The street runs along +Z. The railway runs along X and crosses it, so
 * standing at the start and looking down the road puts the crossing dead
 * centre with the train cutting across the view — the shot the whole scene
 * is composed around.
 */

export const L = {
  // ---- the street ---------------------------------------------------------
  roadHalf: 3.0,        // asphalt reaches ±3.0m
  lineX: 2.72,          // 外側線, the white edge line
  kerbH: 0.14,
  kerbW: 0.18,
  walkOuter: 5.30,      // pavement runs slightly past the property line
  walkLimit: 4.55,      // how far the player may stray onto the pavement
  buildLine: 4.95,      // property line — plots are stamped from here
  walkY: 0.16,          // pavement surface height; plots and props sit on it
  zMin: -78,
  zMax: 62,

  // ---- the railway --------------------------------------------------------
  gauge: 1.067,         // JR narrow gauge — noticeably tighter than standard
  trackA: 17.9,         // down line (train runs -X → +X)
  trackB: 21.9,         // up line
  railZ: 19.9,          // midpoint, for the crossing furniture
  crossHalfX: 5.4,      // how far the timber crossing deck spans
  ballastHalf: 3.6,     // ballast shoulder either side of the pair
  gateNear: 15.2,       // barrier on the player's side
  gateFar: 24.6,        // barrier on the far side
  railTop: 0.30,        // top-of-rail height above the road

  // ---- where the player starts -------------------------------------------
  // Standing short of the shopfront, facing +Z so the crossing sits centred
  // about 25m ahead with the sakura closing overhead. Yaw is π because a
  // three.js camera looks down −Z at zero rotation.
  eye: 1.62,
  spawn: [0.9, 1.62, -8.5],
  spawnYaw: Math.PI,
};

// Derived: the crossing deck, and where the asphalt has to stop to meet it.
L.deckZ0 = L.trackA - 1.3;
L.deckZ1 = L.trackB + 1.3;
L.roadEndNear = L.deckZ0 - 0.85;
L.roadEndFar = L.deckZ1 + 0.85;

/** The two stretches of ordinary street, either side of the crossing. */
export const ROAD_SPANS = [
  [L.zMin, L.roadEndNear],
  [L.roadEndFar, L.zMax],
];

/** True inside the span where the road furniture gives way to the crossing. */
export function inCrossing(z, pad = 0) {
  return z > L.roadEndNear - pad && z < L.roadEndFar + pad;
}

/**
 * True when a position is standing on the crossing itself.
 *
 * Used to hold trains back: nobody should be sent a 20 m/s EMU while they are
 * between the rails looking at the ballast.
 */
export function onTracks(pos, pad = 1.2) {
  return pos.z > L.roadEndNear - pad && pos.z < L.roadEndFar + pad
    && Math.abs(pos.x) < L.crossHalfX + pad;
}
