import * as THREE from 'three';
import { SKY } from './palette.js';

/**
 * Painted sky dome.
 *
 * Not a photographic sky — a *background plate*. Three vertical colour zones,
 * a warm bloom around the sun, and clouds that are posterised into two tones
 * (lit top, cool underside) with a flat-ish base, the way they get painted in
 * anime backgrounds. Everything drifts very slowly so stills feel alive.
 */

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = normalize( position );
	vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	gl_Position.z = gl_Position.w; // pin to the far plane
}
`;

const frag = /* glsl */ `
precision highp float;

varying vec3 vDir;

uniform vec3 uZenith;
uniform vec3 uMiddle;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uCloud;
uniform vec3 uCloudShade;
uniform vec3 uSunDir;
uniform float uTime;

float hash( vec2 p ) {
	p = fract( p * vec2( 233.34, 851.73 ) );
	p += dot( p, p + 23.45 );
	return fract( p.x * p.y );
}

float noise( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	float a = hash( i );
	float b = hash( i + vec2( 1.0, 0.0 ) );
	float c = hash( i + vec2( 0.0, 1.0 ) );
	float d = hash( i + vec2( 1.0, 1.0 ) );
	return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}

float fbm( vec2 p ) {
	float v = 0.0;
	float amp = 0.5;
	mat2 rot = mat2( 0.8, 0.6, -0.6, 0.8 );
	for ( int i = 0; i < 5; i ++ ) {
		v += amp * noise( p );
		p = rot * p * 2.02;
		amp *= 0.5;
	}
	return v;
}

void main() {
	vec3 dir = normalize( vDir );
	float h = clamp( dir.y, -1.0, 1.0 );

	// Two-stage vertical ramp: hot pastel at the horizon, cooling upward.
	float lowT = smoothstep( -0.06, 0.30, h );
	float highT = smoothstep( 0.16, 0.78, h );
	vec3 col = mix( uHorizon, uMiddle, lowT );
	col = mix( col, uZenith, highT );

	// Warm bloom hugging the sun. Deliberately restrained — a blown-out sun
	// fights the flat cel shading rather than supporting it.
	float sd = max( dot( dir, normalize( uSunDir ) ), 0.0 );
	col = mix( col, uGlow, pow( sd, 7.0 ) * 0.42 );
	col = mix( col, uGlow, pow( sd, 90.0 ) * 0.30 );

	// Clouds. Project onto a plane above the viewer so they stretch toward
	// the horizon the way real cloud decks do.
	float above = max( h, 0.035 );
	vec2 uv = dir.xz / above;
	uv *= 0.22;
	uv += vec2( uTime * 0.0032, uTime * 0.0011 );

	float n = fbm( uv * 1.6 );
	float n2 = fbm( uv * 3.4 + 11.7 );
	float shelf = n * 0.76 + n2 * 0.24;

	// Posterise into body + a lower, brighter core: two flat tones, no gradient.
	float body = smoothstep( 0.455, 0.50, shelf );
	float core = smoothstep( 0.535, 0.58, shelf );

	// Fade clouds out near the horizon so the dome edge never shows a seam.
	float band = smoothstep( 0.02, 0.26, h ) * ( 1.0 - smoothstep( 0.75, 1.0, h ) * 0.35 );
	body *= band;
	core *= band;

	col = mix( col, uCloudShade, body * 0.92 );
	col = mix( col, uCloud, core * 0.96 );

	// Very faint paper-grain so large flat areas don't band on cheap panels.
	col += ( hash( gl_FragCoord.xy * 0.7 ) - 0.5 ) * 0.010;

	gl_FragColor = vec4( col, 1.0 );
	#include <colorspace_fragment>
}
`;

export function createSky(sunDirection) {
  const uniforms = {
    uZenith: { value: new THREE.Color(SKY.zenith) },
    uMiddle: { value: new THREE.Color(SKY.middle) },
    uHorizon: { value: new THREE.Color(SKY.horizon) },
    uGlow: { value: new THREE.Color(SKY.glow) },
    uCloud: { value: new THREE.Color(SKY.cloud) },
    uCloudShade: { value: new THREE.Color(SKY.cloudShade) },
    uSunDir: { value: sunDirection.clone().normalize() },
    uTime: { value: 0 },
  };

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 20),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    })
  );
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.position.copy(camera.position);
  };
  mesh.userData.update = (t) => { uniforms.uTime.value = t; };
  return mesh;
}
