import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * The entrance transition: rain landing on a photograph, its ripples
 * dissolving the photo into the live street underneath.
 *
 * This replaces what used to be two separate, jarring UI states — a progress
 * bar that vanished, then a "tap to start" modal that vanished — with one
 * continuous scene and a single deliberate transition. The photo sits in
 * front of the world the whole time; the world is already there, already
 * moving, and the rain is what lets you see it.
 *
 * It runs as the very last pass in the post-processing chain, after
 * `OutputPass`. That matters for two reasons: the shader mixes the card
 * against `tDiffuse` per-pixel, so it needs the *finished*, already-graded
 * frame, not a linear intermediate; and once the transition ends the pass
 * disables itself, so a folded-away entrance costs nothing forever after.
 */

const MAX_DROPS = 24;

const VERT = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	}
`;

// Adapted from a standalone WebGL reference (drops as a uniform array, each
// contributing a decaying concentric ripple; a running "wet" mask blends the
// card into the scene). Ported onto vUv rather than gl_FragCoord — the two are
// equivalent once divided by resolution — so it drops cleanly into a
// ShaderPass instead of needing its own GL context and canvas.
const FRAG = /* glsl */ `
	precision highp float;
	#define MAXD ${MAX_DROPS}

	varying vec2 vUv;

	uniform sampler2D tDiffuse;   // the finished, graded frame — the world
	uniform sampler2D uCard;      // the entrance photo — see reveal.js
	uniform vec2 uResolution;
	uniform vec2 uCardSize;       // the photo's natural pixel dimensions
	uniform float uTime;
	uniform vec4 uDrops[ MAXD ];  // xy: position, z: spawn time, w: strength
	uniform float uWet;           // overall transition progress, 0..1
	uniform float uSettle;        // 1 → 0 once uWet reaches 1: fades any last
	                               // ripple sparkle out on its own clock, so the
	                               // pass never has to cut away mid-glint

	// Same crop-to-fill behaviour as CSS background-size: cover — the photo's
	// own aspect ratio almost never matches the viewport's, and letterboxing
	// it would look like a placeholder rather than a chosen composition.
	vec2 coverUv( vec2 uv ) {
		float scale = max( uResolution.x / uCardSize.x, uResolution.y / uCardSize.y );
		vec2 k = uResolution / ( scale * uCardSize );
		return 0.5 + ( uv - 0.5 ) * k;
	}

	void main() {
		vec2 uv = vUv;
		vec2 asp = vec2( uResolution.x / uResolution.y, 1.0 );

		float w = 0.0;    // wave height, for the refraction and highlight
		float wet = 0.0;  // how much of the card this frame's drops have soaked
		for ( int i = 0; i < MAXD; i ++ ) {
			vec4 d = uDrops[ i ];
			if ( d.w < 0.001 ) continue;
			float age = uTime - d.z;
			if ( age < 0.0 ) continue;
			float dist = length( ( uv - d.xy ) * asp );
			float front = age * 0.5;
			float x = dist - front;
			float amp = exp( -age * 1.1 ) * d.w;
			w += sin( x * 60.0 ) * exp( -x * x * 260.0 ) * amp;
			wet += smoothstep( front, front * 0.15, dist ) * amp * 1.6;
		}

		vec2 grad = vec2( dFdx( w ), dFdy( w ) );
		vec2 refr = grad * 4.0;

		// Local ripple wetness only matters once the transition is actually
		// running (uWet > 0) — before that, drops sparkle on the card's
		// surface but never let the world underneath show through.
		float m = clamp( wet * uWet * 2.2 + uWet * uWet * 1.3 - 0.25, 0.0, 1.0 );

		vec3 a = texture2D( uCard, coverUv( uv + refr ) ).rgb;
		vec3 b = texture2D( tDiffuse, uv + refr ).rgb;
		vec3 col = mix( a, b, m );
		col += vec3( 1.0 ) * max( 0.0, w ) * 0.8 * uSettle;          // wave-crest highlight
		col += vec3( 0.3, 0.55, 1.0 ) * abs( w ) * 0.4 * uSettle;    // cool glint
		// The screen settles to a calm wash right as the transition finishes.
		col = mix( col, vec3( 0.55, 0.75, 0.95 ),
			smoothstep( 0.85, 1.0, uWet ) * ( 1.0 - smoothstep( 0.97, 1.0, uWet ) ) * 0.18 * uSettle );

		gl_FragColor = vec4( col, 1.0 );
	}
`;

export class RevealPass extends ShaderPass {
  constructor() {
    super({
      name: 'RevealPass',
      uniforms: {
        tDiffuse: { value: null },
        uCard: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCardSize: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uWet: { value: 0 },
        uSettle: { value: 1 },
        uDrops: {
          value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4(0, 0, -999, 0)),
        },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });

    this.enabled = false; // the caller turns this on once a card is set
    this._t = 0;
    this._head = 0;
    this._idleNext = 1.4 + Math.random() * 1.6; // first idle drop lands soon
    /** 'idle' (waiting for a tap) → 'running' (rain) → 'settling' (fade out). */
    this._phase = 'idle';
    this._t0 = 0;
    this._duration = 1.8;
    this._settleT = 0;
    this._settleDuration = 0.7;
    this._onComplete = null;
  }

  /** `texture.image` must already be loaded — see `loadEntranceCard()`. */
  setCard(texture) {
    this.uniforms.uCard.value = texture;
    const img = texture.image;
    this.uniforms.uCardSize.value.set(img.naturalWidth || img.width, img.naturalHeight || img.height);
  }

  setSize(width, height) { this.uniforms.uResolution.value.set(width, height); }

  _drop(x, y, strength) {
    this.uniforms.uDrops.value[this._head].set(x, y, this._t, strength);
    this._head = (this._head + 1) % MAX_DROPS;
  }

  /**
   * Begin dissolving the card into the world behind it.
   *
   * `duration` is deliberately short and the drop rate deliberately sparse —
   * a handful of ripples, not a downpour. Making the whole thing feel quicker
   * is a `duration` change, not a speed multiplier: every ripple still
   * expands and decays at the same physical rate (see the wave/decay
   * constants in the shader above), there are just fewer of them and the
   * sequence stops sooner. Playing the same rain back at 2x would look
   * frantic; this looks like less rain.
   */
  start(onComplete, duration = 1.8) {
    if (this._phase !== 'idle') return;
    this._phase = 'running';
    this._t0 = this._t;
    this._duration = duration;
    this._onComplete = onComplete;
    // A first deliberate drop right where the tap landed, so the rain feels
    // caused by the interaction rather than just starting on a timer.
    this._drop(0.5, 0.46, 0.9);
  }

  /** Advance the clock. Call every frame regardless of phase. */
  update(dt) {
    this._t += dt;
    this.uniforms.uTime.value = this._t;

    if (this._phase === 'running') {
      const p = Math.min(1, (this._t - this._t0) / this._duration);
      // Heaviest in the middle of the transition, tapering at both ends —
      // the rain builds, peaks, and eases off rather than switching on.
      // Kept sparse throughout: a light shower, not a storm.
      const density = Math.sin(p * Math.PI);
      if (Math.random() < 0.035 + density * 0.22) {
        this._drop(Math.random(), Math.random(), 0.35 + Math.random() * 0.85);
      }
      this.uniforms.uWet.value = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
      if (p >= 1) {
        // The world is fully visible now, but a ripple or two may still be
        // mid-decay. Rather than cut the whole pass here — which is what
        // used to make the entrance pop off abruptly — hold `uWet` at 1 and
        // fade the ripple highlights out over their own short window before
        // handing off. `uWet` doesn't move during this, so the world stays
        // exactly as revealed; only the last of the water goes quiet.
        this._phase = 'settling';
        this._settleT = 0;
      }
    } else if (this._phase === 'settling') {
      this._settleT += dt;
      const s = Math.max(0, 1 - this._settleT / this._settleDuration);
      this.uniforms.uSettle.value = s;
      if (this._settleT >= this._settleDuration) {
        this._phase = 'done';
        const cb = this._onComplete;
        this._onComplete = null;
        cb?.();
      }
    } else if (this._phase === 'idle' && this.enabled) {
      // A quiet, occasional drop while the card waits for a tap — just
      // enough motion that the entrance never looks like a frozen screenshot.
      this._idleNext -= dt;
      if (this._idleNext <= 0) {
        this._idleNext = 2.8 + Math.random() * 3.6;
        this._drop(0.16 + Math.random() * 0.68, 0.18 + Math.random() * 0.40,
          0.28 + Math.random() * 0.24);
      }
    }
  }
}

/**
 * Load the entrance photo as a texture.
 *
 * Deliberately left at the texture's default colour space (raw sRGB bytes,
 * not GPU-decoded to linear) because this pass runs after `OutputPass` and
 * mixes against `tDiffuse`, which is already display-encoded at that point.
 * Marking this `SRGBColorSpace` would have the GPU linearise it on sample,
 * mixing linear values against gamma-encoded ones and washing out the blend.
 *
 * Returns a promise so the caller can kick this off the moment the URL is
 * known (in parallel with the heavy world-build work) and just await it once
 * the entrance actually needs the texture.
 */
export function loadEntranceCard(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.minFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}
