import * as THREE from 'three';
import { Builder, mulberry32, range, pick } from '../core/geo.js';
import { toon, RAMP } from '../core/materials.js';
import { petalSprite, blossomSpray } from '../core/paint.js';
import { C } from '../core/palette.js';
import { L } from './layout.js';

/**
 * Cherry trees, and the petals coming off them.
 *
 * The trees are branch skeletons wrapped in overlapping low-poly blobs — three
 * pink tones stacked so the canopy has an underside, which is what stops it
 * reading as a lollipop.
 *
 * The petals are one draw call. Position, sway, tumble and wrap are all solved
 * in the vertex shader from a per-instance seed, so a few thousand of them cost
 * nothing and never stutter. They wrap around a volume that follows the
 * player, so you are always walking through falling blossom.
 */

// ---------------------------------------------------------------------------
// trees
// ---------------------------------------------------------------------------

function branch(b, mats, { from, dir, len, radius, depth, rnd, tips }) {
  const to = from.clone().addScaledVector(dir, len);
  b.rod(mats.bark, from.toArray(), to.toArray(), radius, depth > 1 ? 6 : 5);

  if (depth <= 0 || len < 0.5) {
    tips.push({ p: to, r: radius });
    return;
  }
  const forks = depth > 2 ? 2 : (rnd() < 0.65 ? 2 : 3);
  for (let i = 0; i < forks; i++) {
    const d = dir.clone();
    // Splay outward and always bias upward — the canopy should climb.
    const axis = new THREE.Vector3(rnd() - 0.5, rnd() * 0.3, rnd() - 0.5).normalize();
    d.applyAxisAngle(axis, range(rnd, 0.38, 0.78));
    d.y += range(rnd, 0.05, 0.3);
    d.normalize();
    branch(b, mats, {
      from: to, dir: d,
      len: len * range(rnd, 0.6, 0.78),
      radius: radius * 0.66,
      depth: depth - 1, rnd, tips,
    });
  }
}

/**
 * Scatter alpha-cut flower sprays over the shell of a blossom mass.
 *
 * The low-poly blob gives the canopy its silhouette and its shadow; these give
 * it flowers you can actually pick out. Two quads each, randomly oriented in
 * 3D and double-sided, so the cluster reads from any angle without needing to
 * billboard — billboarding a whole canopy looks like a rotating decal.
 */
function spray(b, mat, rnd, { p, radius, count, size }) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    // Bias upward and outward: the underside of a canopy is mostly in shadow
    // and mostly hidden, so flowers there are paid for and never seen.
    const t = Math.acos(1 - 1.55 * rnd());
    const dx = Math.sin(t) * Math.cos(a);
    const dy = Math.cos(t);
    const dz = Math.sin(t) * Math.sin(a);
    const s = size * range(rnd, 0.75, 1.25);
    b.plane(mat, {
      p: [p[0] + dx * radius, p[1] + dy * radius * 0.8, p[2] + dz * radius],
      s: [s, s, 1],
      rx: rnd() * Math.PI * 2, ry: rnd() * Math.PI * 2, rz: rnd() * Math.PI * 2,
    });
  }
}

function sakuraTree(b, mats, { h = 7.5, seed = 1, lean = 0.1, canopy = 1 }) {
  const rnd = mulberry32(seed * 7919);
  const tips = [];

  // Trunk: three kinked segments, thicker at the flare.
  const base = new THREE.Vector3(0, 0, 0);
  const trunkH = h * range(rnd, 0.36, 0.46);
  const leanDir = new THREE.Vector3(Math.cos(seed) * lean, 1, Math.sin(seed * 1.7) * lean).normalize();
  let p = base.clone();
  let r = h * 0.042;
  b.cyl(mats.bark, { p: [0, 0.12, 0], r: r * 1.5, r2: r * 1.15, h: 0.26, seg: 9 });
  for (let i = 0; i < 3; i++) {
    const seg = trunkH / 3;
    const d = leanDir.clone();
    d.x += range(rnd, -0.09, 0.09);
    d.z += range(rnd, -0.09, 0.09);
    d.normalize();
    const q = p.clone().addScaledVector(d, seg);
    b.rod(mats.bark, p.toArray(), q.toArray(), r, 9);
    // Bark texture: shallow lenticel bands, the horizontal streaks on 桜.
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.5) / 3;
      const bp = p.clone().lerp(q, t);
      b.cyl(mats.barkLight, {
        p: bp.toArray(), r: r * 1.02, h: 0.05, seg: 9,
      });
    }
    p = q;
    r *= 0.84;
  }

  // Main limbs.
  const limbs = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rnd() * 0.8;
    const d = new THREE.Vector3(Math.cos(a) * 0.75, range(rnd, 0.55, 0.95), Math.sin(a) * 0.75).normalize();
    branch(b, mats, {
      from: p, dir: d, len: h * range(rnd, 0.2, 0.28),
      radius: r * 0.8, depth: 3, rnd, tips,
    });
  }

  // Blossom. Cluster on the tips, then fill the gaps so the mass closes up.
  const pinks = [mats.blossom, mats.blossomLight, mats.blossomDeep];
  const shuffled = tips.slice();
  for (const t of shuffled) {
    const n = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const off = new THREE.Vector3(
        range(rnd, -0.5, 0.5), range(rnd, -0.25, 0.5), range(rnd, -0.5, 0.5)
      );
      const q = t.p.clone().add(off);
      // Underside clusters take the deep pink so the canopy has a belly.
      const high = q.y > p.y + h * 0.16;
      const mat = high ? pick(rnd, [pinks[0], pinks[1], pinks[1]]) : pick(rnd, [pinks[0], pinks[2]]);
      const rx = range(rnd, 0.9, 1.5) * canopy;
      b.blob(mat, {
        p: q.toArray(),
        s: [rx, range(rnd, 0.6, 0.95) * canopy, range(rnd, 0.9, 1.5) * canopy],
        seed: Math.floor(rnd() * 8) + 1, jitter: 0.42, w: 6, hs: 4,
      });
      spray(b, mats.spray, rnd, {
        p: q.toArray(), radius: rx * 0.46, count: 3, size: 0.46 * canopy,
      });
    }
  }
  // A couple of large masses to unify the silhouette.
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = h * range(rnd, 0.1, 0.26);
    const q = [Math.cos(a) * rad, p.y + h * range(rnd, 0.18, 0.34), Math.sin(a) * rad];
    const rx = range(rnd, 2.2, 3.2) * canopy;
    b.blob(pinks[0], {
      p: q,
      s: [rx, range(rnd, 1.4, 2.0) * canopy, range(rnd, 2.2, 3.2) * canopy],
      seed: i + 2, jitter: 0.38, w: 7, hs: 4,
    });
    spray(b, mats.spray, rnd, { p: q, radius: rx * 0.47, count: 26, size: 0.5 * canopy });
  }
}

/** Petals that have already landed — swept into the gutter and along the kerb. */
function fallenPetals(b, mat, rnd, { x, z, radius, count }) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * radius;
    b.plane(mat, {
      p: [x + Math.cos(a) * d, 0.014, z + Math.sin(a) * d],
      s: [range(rnd, 0.05, 0.1), range(rnd, 0.05, 0.1), 1],
      rx: -Math.PI / 2, rz: rnd() * Math.PI,
    });
  }
}

/**
 * Where the trees go.
 *
 * Two constraints that are easy to violate and obvious once violated: nothing
 * may stand inside the track bed, and nothing may stand inside a building plot.
 * The plot band is roughly |x| 5–13, so the line-side rows are kept beyond it,
 * and every street tree sits in a measured gap between two plots.
 */
const TREES = [
  // Lining the railway — the pink band across the back of the view. Kept past
  // |x| > 14 so they clear the buildings that front the street.
  ...Array.from({ length: 9 }, (_, i) => ({
    x: -46 + i * 11.5, z: L.railZ + 5.6, h: 8.2, seed: 200 + i,
  })).filter((t) => Math.abs(t.x) > 14),
  ...Array.from({ length: 8 }, (_, i) => ({
    x: -42 + i * 11.5, z: L.railZ - 5.9, h: 7.6, seed: 300 + i,
  })).filter((t) => Math.abs(t.x) > 14),

  // Leaning over the street from the gaps between plots.
  { x: 7.4, z: -31.2, h: 8.6, seed: 401, lean: 0.22 },   // gap −32.25…−30.25
  { x: -7.0, z: -45.9, h: 8.0, seed: 402, lean: 0.2 },   // gap −47…−44.9
  { x: 7.2, z: -13.3, h: 7.4, seed: 403, lean: 0.24 },   // gap −14.8…−11.8
  { x: -6.8, z: -14.0, h: 8.8, seed: 404, lean: 0.26 },  // gap −15.5…−12.4
  { x: 7.6, z: -3.8, h: 7.8, seed: 405, lean: 0.2 },     // gap −5.2…−2.4
  { x: -7.4, z: 5.6, h: 8.4, seed: 406, lean: 0.24 },    // gap 4.2…7
  { x: 7.4, z: 35.6, h: 8.2, seed: 409, lean: 0.22 },    // gap 34.1…37
  { x: -7.0, z: 47.0, h: 7.8, seed: 410, lean: 0.2 },    // gap 45.7…48.5

  // Framing the crossing. Both sit in the open ground between the last plot
  // and the line-side fence — outside the ballast, outside the fence. The west
  // one is deliberately small: that gap is only 1.2m, and a full-size trunk
  // would push into the house behind it.
  { x: -6.6, z: 14.6, h: 5.8, seed: 501, lean: 0.3, canopy: 0.78 },
  { x: 6.8, z: 25.8, h: 6.8, seed: 502, lean: 0.3, canopy: 0.9 },
];

export function buildSakura() {
  const b = new Builder('sakura', { chunk: 44 });
  const rnd = mulberry32(31337);
  const mats = {
    bark: toon({ color: C.bark, ramp: RAMP.three, rim: 0.2 }),
    barkLight: toon({ color: C.barkLight, ramp: RAMP.three, rim: 0.2 }),
    // A touch of emissive keeps blossom pink even where the shadow map cuts
    // the sun entirely. Ambient alone is violet, and a violet cherry tree is
    // the fastest way to lose the season.
    blossom: toon({
      color: C.blossom, ramp: RAMP.bloom, rim: 0.3,
      emissive: 0xd97ba6, emissiveIntensity: 0.17,
    }),
    blossomLight: toon({
      color: C.blossomLight, ramp: RAMP.bloom, rim: 0.35,
      emissive: 0xe8a2be, emissiveIntensity: 0.16,
    }),
    blossomDeep: toon({
      color: C.blossomDeep, ramp: RAMP.bloom, rim: 0.25,
      emissive: 0xc4658f, emissiveIntensity: 0.18,
    }),
    // Alpha-cut flower sprays. `alphaTest` rather than `transparent` so they
    // write depth and need no sorting; excluded from the shadow and ink passes
    // because the blob behind each one already carries both.
    spray: toon({
      color: 0xffffff, map: blossomSpray(1), ramp: RAMP.bloom, rim: 0.25,
      emissive: 0xe8a2be, emissiveIntensity: 0.14,
      alphaTest: 0.45, side: THREE.DoubleSide,
    }),
  };
  mats.spray.userData.noShadow = true;
  mats.spray.userData.noInk = true;
  const fallen = toon({ color: C.petal, ramp: RAMP.two, rim: 0 });

  for (const t of TREES) {
    b.at({ p: [t.x, 0, t.z] }, () => {
      sakuraTree(b, mats, { h: t.h, seed: t.seed, lean: t.lean ?? 0.12, canopy: t.canopy ?? 1 });
    });
    // Drifts of fallen blossom under each tree, thicker toward the kerb.
    fallenPetals(b, fallen, rnd, { x: t.x, z: t.z, radius: t.h * 0.5, count: 90 });
  }
  // Petals that have blown into the gutters along the whole street.
  for (const sx of [-1, 1]) {
    for (let z = L.zMin + 8; z < L.zMax - 8; z += 1.1) {
      if (z > L.gateNear - 2 && z < L.gateFar + 2) continue;
      fallenPetals(b, fallen, rnd, {
        x: sx * (L.roadHalf - 0.16), z, radius: 0.42, count: 4,
      });
    }
  }

  return b.build({ castShadow: true, receiveShadow: true });
}

// ---------------------------------------------------------------------------
// falling petals
// ---------------------------------------------------------------------------

const petalVert = /* glsl */ `
attribute vec3 aOffset;
attribute vec4 aRand;

uniform float uTime;
uniform vec3 uOrigin;
uniform vec3 uSize;
uniform float uScale;
uniform float uWind;

varying float vFace;
varying float vHeight;
varying vec2 vUv;

void main() {
	float t = uTime;

	// Fall, then wrap through the volume height.
	float fall = 0.30 + aRand.x * 0.55;
	float y = mod( aOffset.y - t * fall, uSize.y );

	// Two out-of-phase oscillations give the side-to-side flutter that makes
	// a falling petal read as a petal rather than as snow.
	float sway = 0.55 + aRand.w * 1.5;
	float px = aOffset.x + sin( t * ( 0.45 + aRand.y * 0.6 ) + aRand.z * 6.283 ) * sway
		+ t * uWind;
	float pz = aOffset.z + cos( t * ( 0.38 + aRand.z * 0.5 ) + aRand.y * 6.283 ) * sway * 0.8;

	// Wrap horizontally around the player so the drift never runs out.
	px = mod( px - uOrigin.x + uSize.x * 0.5, uSize.x ) - uSize.x * 0.5 + uOrigin.x;
	pz = mod( pz - uOrigin.z + uSize.z * 0.5, uSize.z ) - uSize.z * 0.5 + uOrigin.z;

	vec3 world = vec3( px, y, pz );
	vHeight = y / uSize.y;

	vec4 mv = modelViewMatrix * vec4( world, 1.0 );

	// Billboard, spin in screen space, and squash on one axis to fake the
	// petal turning edge-on as it tumbles.
	float spin = t * ( 0.9 + aRand.x * 2.2 ) + aRand.y * 6.283;
	float tumble = sin( t * ( 0.8 + aRand.w * 1.6 ) + aRand.x * 6.283 );
	vFace = tumble;

	vec2 q = position.xy * uScale * ( 0.8 + aRand.z * 0.5 );
	q.x *= 0.28 + 0.72 * abs( tumble );
	float c = cos( spin ), s = sin( spin );
	q = vec2( q.x * c - q.y * s, q.x * s + q.y * c );

	mv.xy += q;
	gl_Position = projectionMatrix * mv;
	vUv = uv;
}
`;

const petalFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uFront;
uniform vec3 uBack;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying float vFace;
varying float vHeight;
varying vec2 vUv;

void main() {
	float a = texture2D( uMap, vUv ).a;
	if ( a < 0.35 ) discard;

	// The back of a petal is in its own shadow — swapping tone as it tumbles
	// is what gives the drift its shimmer.
	vec3 col = mix( uBack, uFront, smoothstep( -0.2, 0.4, vFace ) );
	// Petals higher in the column catch more light.
	col *= 0.88 + 0.20 * vHeight;

	float depth = gl_FragCoord.z / gl_FragCoord.w;
	float fog = smoothstep( uFogNear, uFogFar, depth );
	col = mix( col, uFogColor, fog * 0.85 );

	gl_FragColor = vec4( col, 1.0 );
	#include <colorspace_fragment>
}
`;

export function createPetals({ count = 2600, size = [64, 26, 64], fog } = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  geo.instanceCount = count;

  const rnd = mulberry32(9182);
  const offsets = new Float32Array(count * 3);
  const rands = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    offsets[i * 3] = range(rnd, -size[0] / 2, size[0] / 2);
    offsets[i * 3 + 1] = rnd() * size[1];
    offsets[i * 3 + 2] = range(rnd, -size[2] / 2, size[2] / 2);
    rands[i * 4] = rnd();
    rands[i * 4 + 1] = rnd();
    rands[i * 4 + 2] = rnd();
    rands[i * 4 + 3] = rnd();
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 4));

  const uniforms = {
    uTime: { value: 0 },
    uOrigin: { value: new THREE.Vector3() },
    uSize: { value: new THREE.Vector3(...size) },
    uScale: { value: 0.115 },
    uWind: { value: 0.20 },
    uMap: { value: petalSprite() },
    uFront: { value: new THREE.Color(C.petal).convertSRGBToLinear() },
    uBack: { value: new THREE.Color(C.blossomDeep).convertSRGBToLinear().multiplyScalar(0.82) },
    uFogColor: { value: new THREE.Color(fog?.color ?? 0xffe9ec).convertSRGBToLinear() },
    uFogNear: { value: fog?.near ?? 40 },
    uFogFar: { value: fog?.far ?? 190 },
  };

  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: petalVert,
    fragmentShader: petalFrag,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  }));
  mesh.name = 'petals';
  mesh.frustumCulled = false;

  return {
    mesh,
    update(t, playerPos) {
      uniforms.uTime.value = t;
      // Snap the volume to the player, but keep the base on the ground.
      uniforms.uOrigin.value.set(playerPos.x, 0, playerPos.z);
    },
  };
}
