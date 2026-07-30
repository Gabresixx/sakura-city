import * as THREE from 'three';
import { TINT } from './palette.js';

/**
 * Anime shading, in one place.
 *
 * Three ingredients make the look:
 *   1. a stepped gradient map, so diffuse light snaps into flat bands
 *   2. a warm/cool tint applied *after* lighting, so the shaded band drifts
 *      violet while the lit band drifts cream (this is the single biggest
 *      difference between "toon shader" and "anime background")
 *   3. a thin sun-side rim, which is how cel artists separate a subject from
 *      the plate behind it
 *
 * Everything shares one set of uniform objects, so the whole city can be
 * re-graded at runtime by writing to `SHARED.*.value`.
 */

/**
 * A tint must shift hue without stealing brightness.
 *
 * Colours from hex arrive already converted into the linear working space, so
 * a "light violet" like #c4bfdc is only ~0.54 luminance by the time it reaches
 * the shader — multiplying by it crushes every shadow to mud. Normalising to a
 * target luminance keeps the warm/cool split purely chromatic and leaves the
 * tone ramp in charge of value.
 */
function tint(hex, targetLuminance) {
  const c = new THREE.Color(hex);
  const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  return c.multiplyScalar(targetLuminance / Math.max(lum, 1e-4));
}

export const SHARED = {
  uSunTint: { value: tint(TINT.sun, TINT.sunLevel) },
  uShadeTint: { value: tint(TINT.shade, TINT.shadeLevel) },
  uShadeLo: { value: TINT.lo },
  uShadeHi: { value: TINT.hi },
};

/** Stepped 1-D ramp. `stops` are the brightness of each band, dark → light. */
function toneMap(stops) {
  const data = new Uint8Array(stops.length * 4);
  stops.forEach((v, i) => {
    const b = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Three bands is the classic anime-background split: shadow / mid / light.
export const RAMP = {
  three: toneMap([0.34, 0.7, 1.0]),
  // Softer ramp for big organic masses (foliage) so they don't read as slabs.
  four: toneMap([0.4, 0.62, 0.82, 1.0]),
  // Hard two-tone for flat props and signage.
  two: toneMap([0.46, 1.0]),
  // High-key ramp for blossom. Cherry canopy is painted bright all the way
  // into its own shadow — let it fall to 0.34 like everything else and it
  // turns into a grey lump the moment it faces away from the sun.
  bloom: toneMap([0.66, 0.80, 0.91, 1.0]),
};

const INJECT_PARS = /* glsl */ `
uniform vec3 uSunTint;
uniform vec3 uShadeTint;
uniform float uShadeLo;
uniform float uShadeHi;
#ifdef ANIME_RIM
uniform float uRimStrength;
#endif
`;

// Replaces the stock line that folds the light accumulators into the output.
const OUTGOING = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;';

const INJECT_MAIN = /* glsl */ `
vec3 _lightSum = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;

// Recover the *light* by dividing the albedo back out, so the warm/cool split
// keys off illumination rather than off how dark the paint happens to be.
vec3 _albedo = max( diffuseColor.rgb, vec3( 1e-3 ) );
float _lum = clamp( dot( _lightSum / _albedo, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0, 4.0 );
float _lit = smoothstep( uShadeLo, uShadeHi, _lum );

vec3 outgoingLight = _lightSum * mix( uShadeTint, uSunTint, _lit ) + totalEmissiveRadiance;

#ifdef ANIME_RIM
	float _rim = 1.0 - clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 );
	outgoingLight += smoothstep( 0.55, 1.0, _rim ) * _lit * uRimStrength * uSunTint * _albedo;
#endif
`;

let variantId = 0;
const cache = new Map();

/**
 * Toon material with the anime grade baked in.
 *
 * @param {object} o
 * @param {number} o.color          base albedo
 * @param {THREE.Texture} [o.ramp]  tone ramp, defaults to the 3-band one
 * @param {number} [o.emissive]     self-lit colour (vending machines, signals)
 * @param {number} [o.rim]          sun-side rim strength, 0 disables
 */
export function toon(o = {}) {
  const {
    color = 0xffffff,
    ramp = RAMP.three,
    emissive = 0x000000,
    emissiveIntensity = 1,
    rim = 0.22,
    emissiveMap = null,
    transparent = false,
    opacity = 1,
    side = THREE.FrontSide,
    map = null,
    alphaTest = 0,
    depthWrite = undefined,
    fog = true,
  } = o;

  const key = [
    color, ramp.uuid, emissive, emissiveIntensity, rim, transparent, opacity,
    side, map ? map.uuid : 0, emissiveMap ? emissiveMap.uuid : 0,
    alphaTest, depthWrite, fog,
  ].join('|');
  if (cache.has(key)) return cache.get(key);

  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: ramp,
    emissive,
    emissiveIntensity,
    emissiveMap,
    transparent,
    opacity,
    side,
    map,
    alphaTest,
    fog,
  });
  if (depthWrite !== undefined) mat.depthWrite = depthWrite;

  const useRim = rim > 0;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunTint = SHARED.uSunTint;
    shader.uniforms.uShadeTint = SHARED.uShadeTint;
    shader.uniforms.uShadeLo = SHARED.uShadeLo;
    shader.uniforms.uShadeHi = SHARED.uShadeHi;
    if (useRim) shader.uniforms.uRimStrength = { value: rim };

    shader.fragmentShader =
      (useRim ? '#define ANIME_RIM\n' : '') +
      INJECT_PARS +
      shader.fragmentShader.replace(OUTGOING, INJECT_MAIN);
  };
  // Without this, three would reuse a program compiled for a different rim flag.
  mat.customProgramCacheKey = () => `anime:${useRim ? 1 : 0}`;
  mat.userData.animeId = variantId++;

  cache.set(key, mat);
  return mat;
}

/** Unlit flat colour — used for anything that should ignore the sun entirely. */
export function flat(color, o = {}) {
  return new THREE.MeshBasicMaterial({ color, ...o });
}

/**
 * Push the global grade around. Handy for a dusk toggle or for tuning by eye
 * from the console.
 */
export function setGrade({ sun, sunLevel, shade, shadeLevel, lo, hi } = {}) {
  if (sun !== undefined) SHARED.uSunTint.value.copy(tint(sun, sunLevel ?? TINT.sunLevel));
  if (shade !== undefined) SHARED.uShadeTint.value.copy(tint(shade, shadeLevel ?? TINT.shadeLevel));
  if (lo !== undefined) SHARED.uShadeLo.value = lo;
  if (hi !== undefined) SHARED.uShadeHi.value = hi;
}
