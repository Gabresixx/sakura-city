import * as THREE from 'three';
import { LIGHT } from '../core/palette.js';
import { L } from './layout.js';

/**
 * Painterly secondary lighting that adds readable spatial depth without
 * replacing the authored cel-shaded key light.
 *
 * These are local colour washes, not extra suns. Keep their falloff tight and
 * their activation contextual so they add depth without clipping the palette.
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
    LIGHT.facadeBounce, 0, LIGHT.facadeBounceDistance, 1.75
  );
  facadeBounce.name = 'light:facade-bounce';
  facadeBounce.castShadow = false;

  const blossomBounce = new THREE.PointLight(
    LIGHT.blossomBounce, 0, LIGHT.blossomBounceDistance, 1.8
  );
  blossomBounce.name = 'light:blossom-bounce';
  blossomBounce.castShadow = false;

  const crossingFill = new THREE.PointLight(
    LIGHT.crossingFill,
    LIGHT.crossingFillIntensity,
    LIGHT.crossingFillDistance,
    1.65
  );
  crossingFill.name = 'light:crossing-sky-fill';
  crossingFill.position.set(0, 7.8, L.railZ);
  crossingFill.castShadow = false;

  const groundBounce = new THREE.PointLight(
    LIGHT.groundBounce, 0, LIGHT.groundBounceDistance, 2.0
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
    const follow = 1 - Math.exp(-dt * 7.0);
    const intensityFollow = 1 - Math.exp(-dt * 5.0);

    // Facade colour return only wakes up near the shopfronts. The centre lane
    // deliberately stays under the original sun/hemi/ambient composition.
    const edge = smooth01(2.65, L.walkLimit, Math.abs(p.x));
    const side = p.x >= 0 ? 1 : -1;
    facadeTarget.set(side * (L.buildLine - 0.1), 2.25, p.z + 0.25);
    facadeBounce.position.lerp(facadeTarget, follow);
    const facadeTargetLevel = LIGHT.facadeBounceIntensity * edge;
    facadeLevel += (facadeTargetLevel - facadeLevel) * intensityFollow;
    facadeBounce.intensity = facadeLevel;

    // Cherry bounce remains local to the nearest canopy and fades before it can
    // wash an entire block pink.
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
    const canopy = 1 - smooth01(4.0, 10.5, nearestD);
    blossomTarget.set(nearest[0] * 0.82, 3.45, nearest[1]);
    blossomBounce.position.lerp(blossomTarget, follow);
    const blossomTargetLevel = LIGHT.blossomBounceIntensity * canopy;
    blossomLevel += (blossomTargetLevel - blossomLevel) * intensityFollow;
    blossomBounce.intensity = blossomLevel;

    // Ground return is now a small local lift, strongest near the road centre
    // and disabled around the crossing so it cannot flatten the open-sky read.
    const crossingDistance = Math.abs(p.z - L.railZ);
    const residential = smooth01(7.0, 18.0, crossingDistance);
    const roadCentre = 1.0 - smooth01(2.2, 3.8, Math.abs(p.x));
    groundTarget.set(p.x * 0.2, 0.12, p.z - 0.45);
    groundBounce.position.lerp(groundTarget, follow);
    const groundTargetLevel = LIGHT.groundBounceIntensity * roadCentre * residential;
    groundLevel += (groundTargetLevel - groundLevel) * intensityFollow;
    groundBounce.intensity = groundLevel;

    // Crossing fill ramps only in the final approach. Farther away it is almost
    // dormant, so the residential street retains its original value structure.
    const crossingPresence = 1 - smooth01(10.0, 25.0, crossingDistance);
    crossingFill.intensity = LIGHT.crossingFillIntensity * (0.10 + crossingPresence * 0.90);
  }

  return {
    facadeBounce,
    blossomBounce,
    crossingFill,
    groundBounce,
    update,
  };
}
