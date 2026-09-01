import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RevealPass } from './reveal.js';
import { SunShaftPass } from './sunshafts.js';

/**
 * The ink pass.
 *
 * Inverted-hull outlines only catch silhouettes; hand-drawn backgrounds also
 * have lines where a roof meets a wall or a kerb meets the road. So the scene
 * is re-rendered into a view-space normal buffer with a depth attachment, and
 * a Roberts cross over *both* finds silhouette edges (depth) and crease edges
 * (normal) in one go.
 *
 * The same depth buffer also carries a restrained contact wash. It is not
 * photoreal SSAO: it only darkens the tiny screen-space pockets where nearby
 * geometry overlaps, using the scene's violet shadow family instead of black.
 * That makes props sit on the pavement and roofs sit on walls without dirtying
 * the flat painted areas that define the art direction.
 */
class InkPass extends Pass {
  constructor(scene, camera, options = {}) {
    super();
    this.scene = scene;
    this.camera = camera;
    /** Objects skipped when building the normal buffer (sky, petals, glass). */
    this.exclude = [];

    const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    depth.format = THREE.DepthFormat;
    this.normalRT = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: depth,
      type: THREE.UnsignedByteType,
    });

    this.normalMaterial = new THREE.MeshNormalMaterial();
    this._clearColor = new THREE.Color();

    const ink = new THREE.Color(options.ink ?? 0x2a2333).convertSRGBToLinear();
    const contactTint = new THREE.Color(options.contactTint ?? 0xb9b3ca).convertSRGBToLinear();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: this.normalRT.texture },
        tDepth: { value: depth },
        uTexel: { value: new THREE.Vector2() },
        uThickness: { value: options.thickness ?? 1.15 },
        uDepthSensitivity: { value: options.depthSensitivity ?? 0.028 },
        uNormalSensitivity: { value: options.normalSensitivity ?? 0.55 },
        uInk: { value: ink },
        uInkBlend: { value: options.inkBlend ?? 0.42 },
        uStrength: { value: options.strength ?? 0.92 },
        uFadeStart: { value: options.fadeStart ?? 46 },
        uFadeEnd: { value: options.fadeEnd ?? 132 },
        uContactTint: { value: contactTint },
        uContactStrength: { value: options.contactStrength ?? 0.16 },
        uContactRadius: { value: options.contactRadius ?? 2.35 },
        uContactFadeStart: { value: options.contactFadeStart ?? 8 },
        uContactFadeEnd: { value: options.contactFadeEnd ?? 92 },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
      },
      vertexShader: /* glsl */ `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}
			`,
      fragmentShader: /* glsl */ `
				#include <packing>

				varying vec2 vUv;

				uniform sampler2D tDiffuse;
				uniform sampler2D tNormal;
				uniform sampler2D tDepth;
				uniform vec2 uTexel;
				uniform float uThickness;
				uniform float uDepthSensitivity;
				uniform float uNormalSensitivity;
				uniform vec3 uInk;
				uniform float uInkBlend;
				uniform float uStrength;
				uniform float uFadeStart;
				uniform float uFadeEnd;
				uniform vec3 uContactTint;
				uniform float uContactStrength;
				uniform float uContactRadius;
				uniform float uContactFadeStart;
				uniform float uContactFadeEnd;
				uniform float uNear;
				uniform float uFar;

				float eyeDepth( vec2 uv ) {
					float d = texture2D( tDepth, uv ).x;
					return - perspectiveDepthToViewZ( d, uNear, uFar );
				}

				vec3 viewNormal( vec2 uv ) {
					return texture2D( tNormal, uv ).xyz * 2.0 - 1.0;
				}

				float contactSample( vec2 uv, float centre ) {
					float sampleDepth = eyeDepth( clamp( uv, vec2( 0.0 ), vec2( 1.0 ) ) );
					float delta = centre - sampleDepth;

					// Only accept a small nearby depth step. Large steps are silhouettes
					// and belong to the ink line, not to the contact wash.
					float bias = 0.012 + centre * 0.0009;
					float reach = 0.16 + centre * 0.0050;
					float enter = smoothstep( bias, bias * 2.6, delta );
					float leave = 1.0 - smoothstep( reach, reach * 2.0, delta );
					return enter * leave;
				}

				void main() {
					vec3 base = texture2D( tDiffuse, vUv ).rgb;

					vec2 o = uTexel * uThickness;
					vec2 a = clamp( vUv + vec2(  o.x,  o.y ), vec2( 0.0 ), vec2( 1.0 ) );
					vec2 b = clamp( vUv + vec2( -o.x, -o.y ), vec2( 0.0 ), vec2( 1.0 ) );
					vec2 c = clamp( vUv + vec2(  o.x, -o.y ), vec2( 0.0 ), vec2( 1.0 ) );
					vec2 d = clamp( vUv + vec2( -o.x,  o.y ), vec2( 0.0 ), vec2( 1.0 ) );

					float da = eyeDepth( a ), db = eyeDepth( b );
					float dc = eyeDepth( c ), dd = eyeDepth( d );
					float d0 = eyeDepth( vUv );

					// Painterly contact wash. Four cardinal taps are enough to ground
					// nearby intersections, and they reuse the depth render this pass
					// already needed for outlines.
					vec2 co = uTexel * uContactRadius;
					float contact = 0.0;
					contact += contactSample( vUv + vec2(  co.x, 0.0 ), d0 );
					contact += contactSample( vUv + vec2( -co.x, 0.0 ), d0 );
					contact += contactSample( vUv + vec2( 0.0,  co.y ), d0 );
					contact += contactSample( vUv + vec2( 0.0, -co.y ), d0 );
					contact *= 0.25;
					contact *= 1.0 - smoothstep( uContactFadeStart, uContactFadeEnd, d0 );
					base = mix( base, base * uContactTint, contact * uContactStrength );

					// Anchor to whichever sample is closest: the line belongs to the
					// near surface, not to the far one behind it.
					float dRef = min( min( min( da, db ), min( dc, dd ) ), d0 );
					float depthDiff = abs( da - db ) + abs( dc - dd );

					vec3 n0 = viewNormal( vUv );
					// abs(n.z) ~ how square-on the surface is. Grazing surfaces get a
					// much looser threshold or every floor becomes an ink puddle.
					float facing = clamp( abs( n0.z ), 0.10, 1.0 );

					float threshold = uDepthSensitivity * dRef / facing;
					float depthEdge = smoothstep( threshold, threshold * 2.2, depthDiff );

					vec3 na = viewNormal( a ), nb = viewNormal( b );
					vec3 nc = viewNormal( c ), nd2 = viewNormal( d );
					float normalDiff = dot( abs( na - nb ) + abs( nc - nd2 ), vec3( 1.0 ) );
					float normalEdge = smoothstep( uNormalSensitivity, uNormalSensitivity * 1.9, normalDiff );

					// Creases dissolve into noise with distance; silhouettes survive.
					float near = 1.0 - smoothstep( uFadeStart, uFadeEnd, dRef );
					float edge = max( depthEdge * mix( 0.45, 1.0, near ), normalEdge * near * 0.9 );

					vec3 line = mix( uInk, base * 0.30, uInkBlend );
					gl_FragColor = vec4( mix( base, line, clamp( edge, 0.0, 1.0 ) * uStrength ), 1.0 );
				}
			`,
    });

    this.fsQuad = new FullScreenQuad(this.material);
  }

  setSize(width, height) {
    this.normalRT.setSize(width, height);
    this.material.uniforms.uTexel.value.set(1 / width, 1 / height);
  }

  render(renderer, writeBuffer, readBuffer) {
    const prevOverride = this.scene.overrideMaterial;
    const prevBackground = this.scene.background;
    const prevAutoClear = renderer.autoClear;
    renderer.getClearColor(this._clearColor);
    const prevAlpha = renderer.getClearAlpha();

    const hidden = [];
    for (const obj of this.exclude) {
      if (obj && obj.visible) { hidden.push(obj); obj.visible = false; }
    }

    // Clear to a camera-facing normal so empty sky reads as a flat plate.
    this.scene.overrideMaterial = this.normalMaterial;
    this.scene.background = null;
    renderer.setRenderTarget(this.normalRT);
    renderer.setClearColor(0x8080ff, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    this.scene.overrideMaterial = prevOverride;
    this.scene.background = prevBackground;
    renderer.setClearColor(this._clearColor, prevAlpha);
    renderer.autoClear = prevAutoClear;
    for (const obj of hidden) obj.visible = true;

    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.uNear.value = this.camera.near;
    this.material.uniforms.uFar.value = this.camera.far;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.normalRT.dispose();
    this.material.dispose();
    this.normalMaterial.dispose();
    this.fsQuad.dispose();
  }
}

/**
 * Final grade. Split-toning is what ties the plate together: everything dark
 * gets pulled toward violet, everything bright toward cream — the same warm/cool
 * relationship the toon shader applies per-object, now applied to the frame.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uShadowTone: { value: new THREE.Color(0.92, 0.90, 1.02) },
    uHighTone: { value: new THREE.Color(1.04, 1.01, 0.95) },
    uSaturation: { value: 1.14 },
    uExposure: { value: 1.02 },
    uVignette: { value: 0.30 },
    uGrain: { value: 0.018 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}
	`,
  fragmentShader: /* glsl */ `
		varying vec2 vUv;
		uniform sampler2D tDiffuse;
		uniform vec3 uShadowTone;
		uniform vec3 uHighTone;
		uniform float uSaturation;
		uniform float uExposure;
		uniform float uVignette;
		uniform float uGrain;
		uniform float uTime;

		float hash( vec2 p ) {
			return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
		}

		void main() {
			vec3 c = texture2D( tDiffuse, vUv ).rgb;

			float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
			c *= mix( uShadowTone, uHighTone, smoothstep( 0.06, 0.62, l ) );
			c = mix( vec3( l ), c, uSaturation );
			c *= uExposure;

			float r = length( ( vUv - 0.5 ) * vec2( 1.05, 1.0 ) );
			c *= 1.0 - smoothstep( 0.42, 0.92, r ) * uVignette;

			// Faint animated grain keeps flat cel areas from looking like vector art.
			c += ( hash( vUv * 900.0 + fract( uTime ) * 37.0 ) - 0.5 ) * uGrain;

			gl_FragColor = vec4( max( c, vec3( 0.0 ) ), 1.0 );
		}
	`,
};

export function createComposer(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4, // MSAA on the beauty pass; the ink pass smooths its own edges
  });

  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const ink = new InkPass(scene, camera);
  composer.addPass(ink);

  // Dynamic depth-aware shafts reuse the exact depth texture generated above.
  // No extra scene render is needed: branches, wires, poles and buildings cut
  // the scattering pattern as the camera moves.
  const shafts = new SunShaftPass(camera, ink.normalRT.depthTexture);
  composer.addPass(shafts);

  // Threshold sits above 1.0 on purpose: only things that genuinely emit —
  // vending machines, crossing lamps, headlights — are allowed to bloom. A
  // lower threshold catches the sky and smears the whole plate.
  const bloom = new UnrealBloomPass(size, 0.55, 0.70, 1.05);
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  composer.addPass(new OutputPass());

  // Last in the chain, and disabled until the entrance sequence needs it —
  // see reveal.js. Sitting after OutputPass means it mixes the finished,
  // display-encoded frame rather than a linear intermediate.
  const reveal = new RevealPass();
  composer.addPass(reveal);

  return { composer, ink, shafts, bloom, grade, reveal };
}
