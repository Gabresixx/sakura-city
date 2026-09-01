import * as THREE from 'three';
import { LIGHT } from '../core/palette.js';
import { L } from './layout.js';

/**
 * Low-frequency, painterly light that sits underneath the authored toon look.
 *
 * These lights are deliberately not trying to simulate GI. They behave like
 * the broad colour washes an anime background artist would paint into a plate:
 * warm facade bounce near the pavement edge, a faint pink return under cherry
 * canopies, and a cool pocket of open-sky fill around the railway crossing.
 *
 * None cast shadows. The directional sun remains the only shadow authority, so
 * the scene keeps its crisp graphic read and the extra depth never turns into
 * photorealistic multi-light noise.
 */

const STREET_CANOPIES = [
  [7.4, -31.2],
  [-7.0, -45.9],
  [7.2, -13.3],
  [-6.8, -14.0],
  [7.6, -3.8],
  [-7.4, 5.6],
  [-6.6, 14.6],
  [6.8, 25.8],
  [7.4, 35.6],
  [-7.0, 47.0],
];

function smooth01(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(edge1 - edge0, 1e-5), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createLightingRig(scene) {
  // A local wall bounce that follows the player along the nearest facade.
  // It only wakes up near the pavement edge, where a painted warm return is
  // visually expected. From the middle of the road its contribution is zero.
  const facadeBounce = new THREE.PointLight(
    LIGHT.facadeBounce,
    0,
    LIGHT.facadeBounceDistance,
    2
  );
  facadeBounce.name = 'light:facade-bounce';
  facadeBounce.castShadow = false;

  // One mobile cherry-light is enough: it parks under the closest canopy and
  // fades with distance. This avoids turning every tree into a pink lamp while
  // still letting nearby pale surfaces pick up a trace of blossom colour.
  const blossomBounce = new THREE.PointLight(
    LIGHT.blossomBounce,
    0,
    LIGHT.blossomBounceDistance,
    2
  );
  blossomBounce.name = 'light:blossom-bounce';
  blossomBounce.castShadow = false;

  // The crossing breaks out of the narrow residential street into open sky.
  // A fixed cool fill makes that spatial change readable before the player has
  // even reached the tracks, without touching the painted sky itself.
  const crossingFill = new THREE.PointLight(
    LIGHT.crossingFill,
    LIGHT.crossingFillIntensity,
    LIGHT.crossingFillDistance,
    2
  );
  crossingFill.name = 'light:crossing-sky-fill';
  crossingFill.position.set(0, 6.8, L.railZ);
  crossingFill.castShadow = false;

  scene.add(facadeBounce, blossomBounce, crossingFill);

  const facadeTarget = new THREE.Vector3();
  const blossomTarget = new THREE.Vector3();
  let facadeLevel = 0;
  let blossomLevel = 0;

  function update(dt, camera) {
    const p = camera.position;
    const follow = 1 - Math.exp(-dt * 7.0);
    const intensityFollow = 1 - Math.exp(-dt * 5.0);

    // ---- facade bounce ----------------------------------------------------
    // The player can walk to |x| ~= 4.55. Start the bounce late enough that it
    // reads as proximity to a facade, not as a second key light in the road.
    const edge = smooth01(2.45, L.walkLimit, Math.abs(p.x));
    const side = p.x >= 0 ? 1 : -1;
    facadeTarget.set(side * L.buildLine, 2.15, p.z + 0.8);
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
    const canopy = 1 - smooth01(5.0, 12.5, nearestD);
    blossomTarget.set(nearest[0] * 0.72, 3.6, nearest[1]);
    blossomBounce.position.lerp(blossomTarget, follow);

    const blossomTargetLevel = LIGHT.blossomBounceIntensity * canopy;
    blossomLevel += (blossomTargetLevel - blossomLevel) * intensityFollow;
    blossomBounce.intensity = blossomLevel;
  }

  return {
    facadeBounce,
    blossomBounce,
    crossingFill,
    update,
  };
}
