import * as THREE from 'three';
import { LIGHT } from '../core/palette.js';
import { L } from './layout.js';
import { createDappleRig } from './dapple.js';

/**
 * Spatial, world-anchored secondary lighting.
 *
 * Nothing in this rig follows the player. The player can walk into and out of
 * these painted light fields, but the fields themselves stay fixed in world
 * space. The sun remains the only shadow-casting light and the authored toon
 * ramps remain the visual authority.
 */

function addSpot(group, {
  name, color, intensity, distance, position, target,
  angle = 0.9, penumbra = 0.78, decay = 2,
}) {
  const light = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
  light.name = name;
  light.position.set(...position);
  light.castShadow = false;
  light.target.position.set(...target);
  group.add(light, light.target);
  return light;
}

function addPoint(group, { name, color, intensity, distance, position, decay = 2 }) {
  const light = new THREE.PointLight(color, intensity, distance, decay);
  light.name = name;
  light.position.set(...position);
  light.castShadow = false;
  group.add(light);
  return light;
}

export function createLightingRig(scene) {
  const group = new THREE.Group();
  group.name = 'lighting:spatial-zones';

  // Warm facade returns. These are fixed to actual blocks instead of being
  // parked beside the camera, so walking down the street changes the balance
  // naturally. The long penumbra keeps them painterly rather than theatrical.
  const facade = [
    addSpot(group, {
      name: 'light:facade-west-near',
      color: LIGHT.facadeBounce,
      intensity: 2.0,
      distance: 16,
      position: [-6.2, 3.0, -28],
      target: [-1.2, 1.1, -26],
    }),
    addSpot(group, {
      name: 'light:facade-east-mid',
      color: LIGHT.facadeBounce,
      intensity: 1.8,
      distance: 15,
      position: [6.2, 3.0, -2],
      target: [1.2, 1.0, 0],
    }),
    addSpot(group, {
      name: 'light:facade-east-far',
      color: LIGHT.facadeBounce,
      intensity: 1.7,
      distance: 15,
      position: [6.2, 3.0, 38],
      target: [1.2, 1.0, 37],
    }),
  ];

  // A couple of fixed blossom returns under hero canopies. Not every tree gets
  // a light: the goal is colour echo, not turning the avenue into pink neon.
  const blossom = [
    addPoint(group, {
      name: 'light:blossom-mid',
      color: LIGHT.blossomBounce,
      intensity: 1.25,
      distance: 8.5,
      position: [-5.2, 2.7, -13.8],
    }),
    addPoint(group, {
      name: 'light:blossom-crossing',
      color: LIGHT.blossomBounce,
      intensity: 1.15,
      distance: 8.0,
      position: [5.1, 2.7, 25.8],
    }),
  ];

  // The railway crossing is genuinely more open to the sky than the narrow
  // residential corridor. This fixed cool pocket reinforces that geography.
  const crossingFill = addPoint(group, {
    name: 'light:crossing-sky-fill',
    color: LIGHT.crossingFill,
    intensity: 2.6,
    distance: 24,
    position: [0, 7.2, L.railZ],
    decay: 2,
  });

  // Dapple is geometry, not another full-screen effect. It lives in the same
  // fixed world-space rig and only animates its tiny procedural branch drift.
  const dapple = createDappleRig();
  group.add(dapple.group);

  scene.add(group);

  return {
    group,
    facade,
    blossom,
    crossingFill,
    dapple,
    inkExclude: dapple.inkExclude,
    update(dt) {
      dapple.update(dt);
    },
  };
}
