import * as THREE from 'three';
import { LIGHT } from '../core/palette.js';
import { L } from './layout.js';

/**
 * Painterly secondary lighting that adds readable spatial depth without
 * replacing the authored cel-shaded key light.
 *
 * The rule is simple: these lights may change how a place feels, but they may
 * not become physically believable light sources. They stay broad, shadowless,
 * palette-bound and slow-moving so the street still reads like an anime plate.
 */

const STREET_CANOPIES = [
  [7.4, -31.2], [-7.0, -45.9], [7.2, -13.3], [-6.8, -14.0],
  [7.6, -3.8], [-7.4, 5.6], [-6.6, 14.6], [6.8, 25.8],
  [7.4, 35.6], [-7.0, 47.0],
];

function smooth01(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(edge1 - edge0, 1e-5), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createLightingRig(scene) {
  const facadeBounce = new THREE.PointLight(
    LIGHT.facadeBounce, 0, LIGHT.facadeBounceDistance, 1.45
  );
  facadeBounce.name = 'light:facade-bounce';
  facadeBounce.castShadow = false;

  const blossomBounce = new THREE.PointLight(
    LIGHT.blossomBounce, 0, LIGHT.blossomBounceDistance, 1.5
  );
  blossomBounce.name = 'light:blossom-bounce';
  blossomBounce.castShadow = false;

  const crossingFill = new THREE.PointLight(
    LIGHT.crossingFill,
    LIGHT.crossingFillIntensity,
    LIGHT.crossingFillDistance,
    1.35
  );
  crossingFill.name = 'light:crossing-sky-fill';
  crossingFill.position.set(0, 7.4, L.railZ);
  crossingFill.castShadow = false;

  // A low warm return that follows the player and only becomes visible where
  // the road is sunlit enough to plausibly kick colour back upward. This is the
  // missing "ground bounce" layer that stops lower walls / props feeling flat.
  const groundBounce = new THREE.PointLight(
    LIGHT.groundBounce, 0, LIGHT.groundBounceDistance, 1.5
  );
  groundBounce.name = 'light:ground-bounce';
  groundBounce.castShadow = false;

  scene.add(facadeBounce, blossomBounce, crossingFill, groundBounce);

  const facadeTarget = new THREE.Vector3();
  const blossomTarget = new THREE.Vector3();
  const groundTarget = new THREE.Vector3();
  let facadeLevel = 0;
  let blossomLevel = 0;
  let groundLevel = 0;

  function update(dt, camera) {
    const p = camera.position;
    const follow = 1 - Math.exp(-dt * 8.0);
    const intensityFollow = 1 - Math.exp(-dt * 6.0);

    // ---- facade bounce ----------------------------------------------------
    // Wider activation than before: starts in the road lane, then ramps hard
    // as the player approaches the shopfronts. The visible change is local,
    // not a global grade shift.
    const edge = smooth01(1.55, L.walkLimit, Math.abs(p.x));
    const side = p.x >= 0 ? 1 : -1;
    facadeTarget.set(side * (L.buildLine - 0.25), 2.0, p.z + 0.4);
    facadeBounce.position.lerp(facadeTarget, follow);

    const facadeTargetLevel = LIGHT.facadeBounceIntensity * edge;
    facadeLevel += (facadeTargetLevel - facadeLevel) * intensityFollow;
    facadeBounce.intensity = facadeLevel;

    // ---- blossom bounce ---------------------------------------------------
    let nearest = STREET_CANOPIES[0];
    let nearestD2 = Infinity;
    for (const c of STREET_CANOPIES) {
      const dx = p.x - c[0];
      const dz = p.z - c[1];
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestD2) {
        nearestD2 = d2;
        nearest = c;
      }
    }

    const nearestD = Math.sqrt(nearestD2);
    const canopy = 1 - smooth01(4.2, 13.5, nearestD);
    blossomTarget.set(nearest[0] * 0.82, 3.2, nearest[1]);
    blossomBounce.position.lerp(blossomTarget, follow);

    const blossomTargetLevel = LIGHT.blossomBounceIntensity * canopy;
    blossomLevel += (blossomTargetLevel - blossomLevel) * intensityFollow;
    blossomBounce.intensity = blossomLevel;

    // ---- ground bounce ----------------------------------------------------
    // Strongest down the residential stretch, eased out at the crossing where
    // the cool open-sky pocket should dominate instead.
    const crossingDistance = Math.abs(p.z - L.railZ);
    const residential = smooth01(4.0, 16.0, crossingDistance);
    const roadCentre = 1.0 - smooth01(2.8, L.walkLimit + 0.4, Math.abs(p.x));
    groundTarget.set(p.x * 0.35, 0.18, p.z - 0.8);
    groundBounce.position.lerp(groundTarget, follow);

    const groundTargetLevel = LIGHT.groundBounceIntensity
      * (0.45 + roadCentre * 0.55)
      * residential;
    groundLevel += (groundTargetLevel - groundLevel) * intensityFollow;
    groundBounce.intensity = groundLevel;

    // Let the open crossing breathe harder than the residential corridor.
    // The light itself stays fixed; only its strength ramps as you approach.
    const crossingPresence = 1 - smooth01(12.0, 34.0, crossingDistance);
    crossingFill.intensity = LIGHT.crossingFillIntensity * (0.35 + crossingPresence * 0.65);
  }

  return {
    facadeBounce,
    blossomBounce,
    crossingFill,
    groundBounce,
    update,
  };
}
