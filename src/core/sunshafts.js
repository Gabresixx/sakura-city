import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { LIGHT, SKY } from './palette.js';

/**
 * Screen-space sun shafts driven by the real scene depth.
 *
 * This is deliberately not a generic white radial-blur effect. The source is
 * the same authored sun direction used by the sky and directional key light,
 * and visibility comes from the depth buffer the InkPass already renders.
 * Branches, wires, poles and buildings therefore cut the shafts dynamically as
 * the camera moves, while the colour stays inside Sakura City's warm pastel
 * lighting language.
 */
export class SunShaftPass extends Pass {
  constructor(camera, depthTexture, options = {}) {
    super();
    this.camera = camera;
    this.sunDirection = new THREE.Vector3(...LIGHT.sunPosition).normalize();
    this._sunPoint = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._ndc = new THREE.Vector3();

    const shaftColor = new THREE.Color(options.color ?? SKY.glow).convertSRGBToLinear();

    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depthTexture },
        uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
        uSunVisibility: { value: 0 },
        uColor: { value: shaftColor },
        uIntensity: { value: options.intensity ?? 0.36 },
        uDensity: { value: options.density ?? 0.86 },
        uDecay: { value: options.decay ?? 0.945 },
        uWeight: { value: options.weight ?? 0.042 },
        uSkyContribution: { value: options.skyContribution ?? 0.42 },
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
        varying vec2 vUv;

        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 uSunUv;
        uniform float uSunVisibility;
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uDensity;
        uniform float uDecay;
        uniform float uWeight;
        uniform float uSkyContribution;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        float inside01(vec2 uv) {
          vec2 lo = step(vec2(0.0), uv);
          vec2 hi = step(uv, vec2(1.0));
          return lo.x * lo.y * hi.x * hi.y;
        }

        void main() {
          vec3 base = texture2D(tDiffuse, vUv).rgb;

          // March from this pixel toward the projected sun. The depth target
          // clears to exactly 1.0, so only genuine gaps in geometry contribute.
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

            // 1.0 means no geometry was written here. A very tight threshold
            // avoids treating genuinely distant buildings as open sky.
            float openSky = step(0.999995, d) * inFrame;

            // Only sky reasonably close to the sun acts as the scattering
            // source. This prevents the whole blue sky becoming a radial blur.
            float fromSun = 1.0 - smoothstep(0.08, 0.88, distance(suv, uSunUv));
            shafts += openSky * fromSun * illuminationDecay;
            illuminationDecay *= uDecay;
          }

          float hereDepth = texture2D(tDepth, vUv).x;
          float hereIsSky = step(0.999995, hereDepth);
          float surfaceWeight = mix(1.0, uSkyContribution, hereIsSky);

          shafts *= uWeight * uIntensity * uSunVisibility * surfaceWeight;
          vec3 outColor = base + uColor * shafts;
          gl_FragColor = vec4(outColor, 1.0);
        }
      `,
    });

    this.fsQuad = new FullScreenQuad(this.material);
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

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
