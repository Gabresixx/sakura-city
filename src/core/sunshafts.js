import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { LIGHT, SKY } from './palette.js';

/**
 * Screen-space solar lighting driven by the real scene depth.
 *
 * Three related layers live here deliberately:
 *   1. depth-aware sun shafts, cut by actual scene geometry;
 *   2. world-space dappled sunlight beneath the authored sakura canopies;
 *   3. a restrained mid-scale violet shadow pocket that grounds intersections.
 *
 * The dapple pattern is reconstructed in world space and projected toward the
 * canopy along the same authored sun direction used by the sky and key light.
 * It therefore stays glued to the street rather than swimming with the camera.
 */

// x, z, canopy radius, approximate canopy plane height.
// These correspond to the street-facing sakura authored in world/sakura.js.
const CANOPIES = [
  new THREE.Vector4( 7.4, -31.2, 4.25, 6.15),
  new THREE.Vector4(-7.0, -45.9, 3.95, 5.70),
  new THREE.Vector4( 7.2, -13.3, 3.70, 5.30),
  new THREE.Vector4(-6.8, -14.0, 4.35, 6.25),
  new THREE.Vector4( 7.6,  -3.8, 3.90, 5.55),
  new THREE.Vector4(-7.4,   5.6, 4.20, 6.00),
  new THREE.Vector4(-6.6,  14.6, 2.65, 4.10),
  new THREE.Vector4( 6.8,  25.8, 3.25, 4.80),
  new THREE.Vector4( 7.4,  35.6, 4.05, 5.90),
  new THREE.Vector4(-7.0,  47.0, 3.85, 5.60),
];

export class SunShaftPass extends Pass {
  constructor(camera, depthTexture, options = {}) {
    super();
    this.camera = camera;
    this.sunDirection = new THREE.Vector3(...LIGHT.sunPosition).normalize();
    this._sunPoint = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._ndc = new THREE.Vector3();

    const shaftColor = new THREE.Color(options.color ?? SKY.glow).convertSRGBToLinear();
    const dappleColor = new THREE.Color(options.dappleColor ?? LIGHT.sun).convertSRGBToLinear();
    const shadowTint = new THREE.Color(options.shadowTint ?? 0xb9b3ca).convertSRGBToLinear();

    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depthTexture },
        uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
        uSunVisibility: { value: 0 },
        uSunDir: { value: this.sunDirection.clone() },
        uColor: { value: shaftColor },
        uIntensity: { value: options.intensity ?? 0.36 },
        uDensity: { value: options.density ?? 0.86 },
        uDecay: { value: options.decay ?? 0.945 },
        uWeight: { value: options.weight ?? 0.042 },
        uSkyContribution: { value: options.skyContribution ?? 0.42 },

        uProjectionInverse: { value: new THREE.Matrix4() },
        uCameraMatrix: { value: new THREE.Matrix4() },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uCanopies: { value: CANOPIES },

        uDappleColor: { value: dappleColor },
        uDappleStrength: { value: options.dappleStrength ?? 0.72 },
        uShadowTint: { value: shadowTint },
        uShadowPocketStrength: { value: options.shadowPocketStrength ?? 0.10 },
        uShadowPocketRadius: { value: options.shadowPocketRadius ?? 5.2 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        #include <packing>

        varying vec2 vUv;

        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 uSunUv;
        uniform float uSunVisibility;
        uniform vec3 uSunDir;
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uDensity;
        uniform float uDecay;
        uniform float uWeight;
        uniform float uSkyContribution;

        uniform mat4 uProjectionInverse;
        uniform mat4 uCameraMatrix;
        uniform float uNear;
        uniform float uFar;
        uniform vec2 uTexel;
        uniform float uTime;
        uniform vec4 uCanopies[10];
        uniform vec3 uDappleColor;
        uniform float uDappleStrength;
        uniform vec3 uShadowTint;
        uniform float uShadowPocketStrength;
        uniform float uShadowPocketRadius;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm3(vec2 p) {
          float v = 0.0;
          v += noise(p) * 0.57;
          p = mat2(0.80, 0.60, -0.60, 0.80) * p * 2.03 + 8.7;
          v += noise(p) * 0.29;
          p = mat2(0.86, -0.51, 0.51, 0.86) * p * 2.11 + 3.1;
          v += noise(p) * 0.14;
          return v;
        }

        float inside01(vec2 uv) {
          vec2 lo = step(vec2(0.0), uv);
          vec2 hi = step(uv, vec2(1.0));
          return lo.x * lo.y * hi.x * hi.y;
        }

        float eyeDepth(vec2 uv) {
          float d = texture2D(tDepth, clamp(uv, vec2(0.0), vec2(1.0))).x;
          return -perspectiveDepthToViewZ(d, uNear, uFar);
        }

        vec3 worldFromDepth(vec2 uv, float depth) {
          vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          vec4 view = uProjectionInverse * clip;
          view /= max(view.w, 1e-6);
          return (uCameraMatrix * view).xyz;
        }

        float pocketSample(vec2 uv, float centre) {
          float sampleD = eyeDepth(uv);
          float delta = centre - sampleD;
          float bias = 0.035 + centre * 0.0010;
          float reach = 0.45 + centre * 0.0090;
          return smoothstep(bias, bias * 2.6, delta)
            * (1.0 - smoothstep(reach, reach * 1.9, delta));
        }

        void main() {
          vec3 base = texture2D(tDiffuse, vUv).rgb;
          float rawDepth = texture2D(tDepth, vUv).x;
          float isSky = step(0.999995, rawDepth);

          // ---------------------------------------------------------------
          // Mid-scale shadow shaping. This complements the InkPass micro
          // contact wash: a wider violet pocket where nearby geometry sits in
          // front of the current surface, never a black SSAO halo.
          if (isSky < 0.5) {
            float centre = eyeDepth(vUv);
            vec2 po = uTexel * uShadowPocketRadius;
            float pocket = 0.0;
            pocket += pocketSample(vUv + vec2( po.x, 0.0), centre);
            pocket += pocketSample(vUv + vec2(-po.x, 0.0), centre);
            pocket += pocketSample(vUv + vec2(0.0,  po.y), centre);
            pocket += pocketSample(vUv + vec2(0.0, -po.y), centre);
            pocket *= 0.25;
            pocket *= 1.0 - smoothstep(26.0, 105.0, centre);
            base = mix(base, base * uShadowTint, pocket * uShadowPocketStrength);
          }

          // ---------------------------------------------------------------
          // Sakura dapple. Reconstruct this surface in world space, trace a
          // ray toward the sun until it reaches each canopy plane, and only
          // paint the light if that ray actually passes through a canopy.
          if (isSky < 0.5) {
            vec3 world = worldFromDepth(vUv, rawDepth);
            float canopyInfluence = 0.0;
            vec2 canopyCoord = world.xz;

            for (int i = 0; i < 10; i++) {
              vec4 c = uCanopies[i];
              float below = 1.0 - smoothstep(c.w - 0.05, c.w + 0.65, world.y);
              float travel = max((c.w - world.y) / max(uSunDir.y, 0.14), 0.0);
              vec2 atCanopy = world.xz + uSunDir.xz * travel;
              float distToCanopy = length(atCanopy - c.xy);
              float influence = (1.0 - smoothstep(c.z * 0.56, c.z, distToCanopy)) * below;
              if (influence > canopyInfluence) {
                canopyInfluence = influence;
                canopyCoord = atCanopy;
              }
            }

            if (canopyInfluence > 0.001) {
              // World-space derivatives give the visible surface normal without
              // another normal texture. Flip it toward the camera so orientation
              // remains stable across meshes with different winding.
              vec3 dx = dFdx(world);
              vec3 dy = dFdy(world);
              vec3 normal = normalize(cross(dx, dy));
              vec3 cameraPos = uCameraMatrix[3].xyz;
              vec3 toCamera = normalize(cameraPos - world);
              if (dot(normal, toCamera) < 0.0) normal = -normal;

              float sunFacing = smoothstep(0.04, 0.58, dot(normal, uSunDir));

              // Two slowly drifting layers make broad painted gaps with smaller
              // leaf-sized breakup. Because the coordinates are world anchored,
              // moving the camera never makes the pattern slide over surfaces.
              vec2 drift = vec2(uTime * 0.018, sin(uTime * 0.13) * 0.055);
              float broad = fbm3(canopyCoord * 0.43 + drift);
              float detail = noise(canopyCoord * 1.34 - drift * 1.7 + 17.0);
              float breakup = noise(canopyCoord * 2.65 + drift * 2.3 + 41.0);
              float painted = broad * 0.76 + detail * 0.18 + breakup * 0.06;
              float patch = smoothstep(0.555, 0.695, painted);

              // Fade the effect with view distance before the procedural breakup
              // becomes sub-pixel noise. The hero street remains fully affected.
              float viewDistance = distance(cameraPos, world);
              float distanceFade = 1.0 - smoothstep(48.0, 105.0, viewDistance);
              float amount = patch * canopyInfluence * sunFacing * distanceFade * uDappleStrength;

              // This is sunlight, not emissive bloom. Keep it under 1.0 so the
              // following bloom pass never interprets a dapple patch as a lamp.
              vec3 sunPaint = min(base * 1.115 + uDappleColor * 0.030, vec3(1.0));
              base = mix(base, sunPaint, amount);
            }
          }

          // ---------------------------------------------------------------
          // Dynamic sun shafts. March from this pixel toward the projected sun;
          // only depth-buffer gaps contribute, so real geometry cuts the rays.
          const int SAMPLES = 28;
          vec2 ray = (uSunUv - vUv) * (uDensity / float(SAMPLES));
          float jitter = hash(gl_FragCoord.xy) - 0.5;
          vec2 coord = vUv + ray * jitter;
          float illuminationDecay = 1.0;
          float shafts = 0.0;

          for (int i = 0; i < SAMPLES; i++) {
            coord += ray;
            float inFrame = inside01(coord);
            vec2 suv = clamp(coord, vec2(0.0), vec2(1.0));
            float d = texture2D(tDepth, suv).x;
            float openSky = step(0.999995, d) * inFrame;
            float fromSun = 1.0 - smoothstep(0.08, 0.88, distance(suv, uSunUv));
            shafts += openSky * fromSun * illuminationDecay;
            illuminationDecay *= uDecay;
          }

          float surfaceWeight = mix(1.0, uSkyContribution, isSky);
          shafts *= uWeight * uIntensity * uSunVisibility * surfaceWeight;

          gl_FragColor = vec4(base + uColor * shafts, 1.0);
        }
      `,
    });

    this.fsQuad = new FullScreenQuad(this.material);
  }

  setSize(width, height) {
    this.material.uniforms.uTexel.value.set(1 / Math.max(width, 1), 1 / Math.max(height, 1));
  }

  render(renderer, writeBuffer, readBuffer) {
    // A directional sun has no finite world position. Project a point far away
    // along the authored sun vector from the camera; this stays aligned with
    // both the painted sky and the directional key regardless of player motion.
    this._sunPoint.copy(this.camera.position).addScaledVector(this.sunDirection, 1000);
    this._ndc.copy(this._sunPoint).project(this.camera);
    this.camera.getWorldDirection(this._forward);

    const facing = THREE.MathUtils.smoothstep(
      this._forward.dot(this.sunDirection), -0.08, 0.22
    );
    const screenRadius = Math.max(Math.abs(this._ndc.x), Math.abs(this._ndc.y));
    const onScreen = 1 - THREE.MathUtils.smoothstep(screenRadius, 0.82, 1.22);

    this.material.uniforms.uSunUv.value.set(
      this._ndc.x * 0.5 + 0.5,
      this._ndc.y * 0.5 + 0.5
    );
    this.material.uniforms.uSunVisibility.value = facing * onScreen;
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.uProjectionInverse.value.copy(this.camera.projectionMatrixInverse);
    this.material.uniforms.uCameraMatrix.value.copy(this.camera.matrixWorld);
    this.material.uniforms.uNear.value = this.camera.near;
    this.material.uniforms.uFar.value = this.camera.far;
    this.material.uniforms.uTime.value = performance.now() * 0.001;

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
