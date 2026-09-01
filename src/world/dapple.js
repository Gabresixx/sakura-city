import * as THREE from 'three';
import { LIGHT } from '../core/palette.js';
import { L } from './layout.js';

/**
 * Painted dappled sunlight.
 *
 * This deliberately avoids screen-space world reconstruction. The pattern is
 * real transparent geometry placed a few millimetres above the surfaces that
 * should receive the cherry-canopy light: road, pavement and selected facade
 * planes. That makes failure local and predictable — this system can never
 * black out the frame or disturb the main toon/depth pipeline.
 *
 * Two instanced meshes cover every patch in two draw calls:
 *   - warm additive sun holes;
 *   - a very restrained multiplicative violet canopy pocket.
 *
 * The meshes never follow the player. Only the procedural pattern drifts a few
 * centimetres over time, like branches moving in a light breeze.
 */

const PATCHES = [
  // West-side trees throw their canopy read across pavement / road edge.
  { p: [-2.35, 0.028, -44.4], s: [6.3, 8.0], r: [-Math.PI / 2, 0, 0], seed: 1.3, strength: 0.92 },
  { p: [-2.20, 0.028, -12.5], s: [6.6, 8.2], r: [-Math.PI / 2, 0, 0], seed: 2.7, strength: 1.00 },
  { p: [-2.35, 0.028,   7.0], s: [6.4, 7.8], r: [-Math.PI / 2, 0, 0], seed: 4.1, strength: 0.92 },
  { p: [-2.10, 0.028,  16.0], s: [5.5, 6.2], r: [-Math.PI / 2, 0, 0], seed: 5.8, strength: 0.72 },
  { p: [-2.30, 0.028,  48.4], s: [6.0, 7.4], r: [-Math.PI / 2, 0, 0], seed: 7.2, strength: 0.86 },

  // East-side canopies mostly paint the raised pavement rather than the lane.
  { p: [ 3.75, L.walkY + 0.012, -12.3], s: [3.0, 7.2], r: [-Math.PI / 2, 0, 0], seed: 8.6, strength: 0.82 },
  { p: [ 3.80, L.walkY + 0.012,  -2.7], s: [3.0, 6.6], r: [-Math.PI / 2, 0, 0], seed: 9.9, strength: 0.80 },
  { p: [ 3.75, L.walkY + 0.012,  27.0], s: [3.1, 6.0], r: [-Math.PI / 2, 0, 0], seed: 11.2, strength: 0.72 },
  { p: [ 3.75, L.walkY + 0.012,  36.8], s: [3.0, 7.0], r: [-Math.PI / 2, 0, 0], seed: 12.8, strength: 0.78 },

  // A few street-facing walls catch broken sunlight as well. These are placed
  // just in front of the authored build line so depth testing still lets doors,
  // signs and props naturally occlude the painted light.
  { p: [ L.buildLine - 0.018, 2.05, -12.8], s: [5.4, 3.4], r: [0, -Math.PI / 2, 0], seed: 14.0, strength: 0.54 },
  { p: [ L.buildLine - 0.018, 2.00,  -3.4], s: [4.8, 3.2], r: [0, -Math.PI / 2, 0], seed: 15.6, strength: 0.48 },
  { p: [ L.buildLine - 0.018, 2.10,  35.9], s: [5.2, 3.5], r: [0, -Math.PI / 2, 0], seed: 17.1, strength: 0.50 },

  // West facade gets only a faint reflected version; direct sun comes from the
  // west, so this side should never compete with the brighter east-side read.
  { p: [-L.buildLine + 0.018, 1.95, -13.7], s: [4.4, 3.0], r: [0, Math.PI / 2, 0], seed: 18.7, strength: 0.30 },
];

const vertex = /* glsl */ `
attribute float aSeed;
attribute float aStrength;

varying vec2 vUv;
varying float vSeed;
varying float vStrength;

void main() {
  vUv = uv;
  vSeed = aSeed;
  vStrength = aStrength;

  vec4 local = instanceMatrix * vec4(position, 1.0);
  vec4 world = modelMatrix * local;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const noiseChunk = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm3(vec2 p) {
  float v = 0.0;
  v += valueNoise(p) * 0.57;
  p = p * 2.03 + 11.7;
  v += valueNoise(p) * 0.28;
  p = p * 2.07 - 4.3;
  v += valueNoise(p) * 0.15;
  return v;
}

float canopyEnvelope(vec2 uv, float seed) {
  vec2 q = (uv - 0.5) * 2.0;
  q.x *= 0.88 + 0.08 * sin(seed * 2.1);
  q.y *= 1.04;
  float radial = 1.0 - smoothstep(0.58, 1.03, length(q));

  // Break the perfect ellipse so the outer edge feels like foliage rather than
  // a projected theatre gobos circle.
  float ragged = fbm3(q * 1.75 + seed * vec2(1.91, 3.17));
  return radial * smoothstep(0.12, 0.42, ragged + radial * 0.55);
}

float dapplePattern(vec2 uv, float seed, float time) {
  // Very slow drift. The pattern remains in local world geometry and only the
  // faux branch motion moves, so there is no camera swimming.
  vec2 wind = vec2(time * 0.018, -time * 0.011);
  vec2 p = uv * vec2(5.3, 5.8) + wind + seed * vec2(1.37, 2.11);

  float broad = fbm3(p);
  float medium = fbm3(p * 1.92 + vec2(7.2, -3.4));
  float fine = fbm3(p * 3.55 - vec2(2.8, 5.1));

  float holes = smoothstep(0.57, 0.73, broad * 0.64 + medium * 0.36);
  float pinholes = smoothstep(0.66, 0.82, fine) * 0.28;
  return clamp(holes + pinholes, 0.0, 1.0);
}
`;

function makeLightMaterial() {
  const warm = new THREE.Color(LIGHT.sun).convertSRGBToLinear();
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      uTime: { value: 0 },
      uWarm: { value: warm },
      uStrength: { value: 0.23 },
    },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vSeed;
      varying float vStrength;
      uniform float uTime;
      uniform vec3 uWarm;
      uniform float uStrength;
      ${noiseChunk}

      void main() {
        float env = canopyEnvelope(vUv, vSeed);
        float holes = dapplePattern(vUv, vSeed, uTime);
        float mask = env * holes * vStrength;
        if (mask < 0.012) discard;

        // Broad holes get a soft body while tiny pinholes stay crisp enough to
        // read as sunlight instead of a generic glow decal.
        float shaped = smoothstep(0.03, 0.72, mask);
        gl_FragColor = vec4(uWarm, shaped * uStrength);
      }
    `,
  });
}

function makeShadowMaterial() {
  const shadow = new THREE.Color(0xc8c2d7).convertSRGBToLinear();
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.MultiplyBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -0.5,
    polygonOffsetUnits: -0.5,
    uniforms: {
      uTime: { value: 0 },
      uShadow: { value: shadow },
      uStrength: { value: 0.11 },
    },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vSeed;
      varying float vStrength;
      uniform float uTime;
      uniform vec3 uShadow;
      uniform float uStrength;
      ${noiseChunk}

      void main() {
        float env = canopyEnvelope(vUv, vSeed);
        float holes = dapplePattern(vUv, vSeed, uTime);

        // The pocket is intentionally broad and faint; the actual directional
        // shadow map still owns the graphic shadow edge.
        float canopyShade = env * (1.0 - holes * 0.58) * vStrength;
        float amount = smoothstep(0.10, 0.82, canopyShade) * uStrength;
        vec3 multiplier = mix(vec3(1.0), uShadow, amount);
        gl_FragColor = vec4(multiplier, 1.0);
      }
    `,
  });
}

function buildInstanced(material, name) {
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const seeds = new Float32Array(PATCHES.length);
  const strengths = new Float32Array(PATCHES.length);
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute('aStrength', new THREE.InstancedBufferAttribute(strengths, 1));

  const mesh = new THREE.InstancedMesh(geometry, material, PATCHES.length);
  mesh.name = name;
  mesh.frustumCulled = true;
  mesh.renderOrder = 3;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const dummy = new THREE.Object3D();
  PATCHES.forEach((patch, i) => {
    dummy.position.set(...patch.p);
    dummy.rotation.set(...patch.r);
    dummy.scale.set(patch.s[0], patch.s[1], 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    seeds[i] = patch.seed;
    strengths[i] = patch.strength;
  });
  mesh.instanceMatrix.needsUpdate = true;
  geometry.attributes.aSeed.needsUpdate = true;
  geometry.attributes.aStrength.needsUpdate = true;
  return mesh;
}

export function createDappleRig() {
  const group = new THREE.Group();
  group.name = 'lighting:dapple-painted';

  const shadowMaterial = makeShadowMaterial();
  const lightMaterial = makeLightMaterial();
  const shadowMesh = buildInstanced(shadowMaterial, 'dapple:canopy-shadow');
  const lightMesh = buildInstanced(lightMaterial, 'dapple:sun-holes');
  group.add(shadowMesh, lightMesh);

  let time = 0;
  function update(dt) {
    time += dt;
    shadowMaterial.uniforms.uTime.value = time;
    lightMaterial.uniforms.uTime.value = time;
  }

  return {
    group,
    lightMesh,
    shadowMesh,
    update,
    inkExclude: [lightMesh, shadowMesh],
  };
}
