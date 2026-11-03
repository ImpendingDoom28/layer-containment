import { Color, MeshStandardMaterial } from "three";

/** Shared per-frame time uniform: one `{ value }` object every water material
 *  references, so a single write animates all water bodies in the scene. */
export type WaterTimeUniform = { value: number };

type CreateWaterMaterialParams = {
  color: string;
  time: WaterTimeUniform;
  glow: string;
  /**
   * Peak vertex displacement in world units (the wave field is normalized to
   * roughly -0.5..0.5, so the real swell is a bit smaller). `0` keeps the mesh
   * geometrically flat (shading only). The tile passes its top-face offset
   * and the water bodies pass a fraction of their height.
   */
  amplitude: number;
  /**
   * Local Y of the mesh's top face (half the box height / cylinder height).
   * Only vertices at the top face — and the side top ring within 1% of it —
   * are displaced, so the swelled edge matches the swelled face and the mesh
   * stays watertight.
   */
  topY: number;
};

// GLSL for the shared wave field, included verbatim in both the vertex and the
// fragment shader so the silhouette, the lighting, and the displacement all
// sample one field. waterRippleGradient is a central difference of waterHeight,
// so the sines and the drifting FBM noise share one exact derivative. Exported
// so the shader-compile gate script can balance-check the injected GLSL.
export const WATER_WAVE_GLSL = `
float waterHash( vec2 p ) {
	return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}
float waterValueNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix(
		mix( waterHash( i ), waterHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		mix( waterHash( i + vec2( 0.0, 1.0 ) ), waterHash( i + vec2( 1.0, 1.0 ) ), u.x ),
		u.y
	) - 0.5;
}
float waterFbm( vec2 p ) {
	float v = 0.0;
	float a = 0.5;
	for ( int i = 0; i < 3; i++ ) {
		v += a * waterValueNoise( p );
		p = p * 2.13 + 11.7;
		a *= 0.5;
	}
	return v;
}
float waterWave1( vec2 p ) { return sin( p.x * 2.1 + uWaterTime * 0.9 ); }
float waterWave2( vec2 p ) { return sin( ( p.x * 0.6 + p.y * 1.7 ) * 1.8 - uWaterTime * 0.7 ); }
float waterWave3( vec2 p ) { return sin( ( p.x * 0.9 - p.y * 1.3 ) * 1.1 + uWaterTime * 0.5 ); }
float waterWave4( vec2 p ) { return sin( ( p.x * 4.3 + p.y * 2.9 ) * 1.4 + uWaterTime * 1.6 ); }
float waterHeight( vec2 p ) {
	float waves = ( waterWave1( p ) * 0.5 + waterWave2( p ) * 0.3
 		+ waterWave3( p ) * 0.2 + waterWave4( p ) * 0.15 ) * 0.5;
	// Slow-drifting FBM makes the swell organic instead of regular sines;
	// it stays in world space so adjacent tiles never seam.
	float drift = uWaterTime * 0.12;
	return waves + waterFbm( vec2( p.x + drift, p.y - drift * 0.7 ) ) * 0.55;
}`;

// Vertex-side uniforms + top-face mask. Exported for the shader gate.
export const WATER_VERTEX_DISPLACE_GLSL = `
uniform float uWaterTime;
uniform float uWaterAmplitude;
uniform float uWaterTopY;
${WATER_WAVE_GLSL}
float waterElevated( float y ) {
	// Top face plus the side top ring (within 1% of the top Y).
	return step( uWaterTopY - 0.01, y );
}`;

// Fragment-side uniforms, shared wave field, and analytic gradient.
// Exported for the shader gate.
export const WATER_FRAGMENT_GLSL = `
uniform float uWaterTime;
uniform vec3 uWaterGlow;
varying vec3 vWaterWorldPos;
${WATER_WAVE_GLSL}
float waterRipple( vec2 p ) { return waterHeight( p ) + 0.5; }
// Central differences of waterHeight: one exact derivative for the sines AND
// the FBM noise (which has no closed form). Returns the world-space XZ slope
// (dH/dx, dH/dz) as a 3-vector, ready for the viewMatrix rotation.
vec3 waterRippleGradient( vec2 p ) {
	const float eps = 0.035;
	float gx = ( waterHeight( p + vec2( eps, 0.0 ) )
		- waterHeight( p - vec2( eps, 0.0 ) ) ) / ( 2.0 * eps );
	float gz = ( waterHeight( p + vec2( 0.0, eps ) )
		- waterHeight( p - vec2( 0.0, eps ) ) ) / ( 2.0 * eps );
	return vec3( gx, 0.0, gz );
}`;

/**
 * MeshStandardMaterial with a gentle ripple in the emissive, surface tint,
 * roughness, surface normal, and — when `amplitude > 0` — the vertex
 * positions themselves. The pattern is driven by world-space XZ coordinates
 * (not the per-mesh UVs), so adjacent water tiles/bodies share one continuous
 * wave field instead of each pooling its own phase.
 *
 * The ripple reads as motion with depth: the gradient of the wave field
 * (central differences of the height field, exact for sines and FBM alike)
 * perturbs the view-space normal so specular highlights slide across the
 * surface, a roughness modulation makes the highlight shimmer, and the vertex
 * displacement (top surface only, kept watertight) gives the swell real
 * parallax. One GLSL program is shared by every water tile/body
 * (`customProgramCacheKey`); the only per-material state is the standard
 * color/emissive pair plus amplitude/topY, which are uniforms.
 */
export const createWaterMaterial = (
  params: CreateWaterMaterialParams
): MeshStandardMaterial => {
  const mat = new MeshStandardMaterial({
    color: params.color,
    emissive: new Color(params.glow),
    emissiveIntensity: 0.14,
    metalness: 0.28,
    roughness: 0.18,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms["uWaterTime"] = params.time;
    shader.uniforms["uWaterGlow"] = { value: new Color(params.glow) };
    shader.uniforms["uWaterAmplitude"] = { value: params.amplitude };
    shader.uniforms["uWaterTopY"] = { value: params.topY };

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
 varying vec3 vWaterWorldPos;
${WATER_VERTEX_DISPLACE_GLSL}`
    );

    // `transformed` is the local position. The wave field is sampled in
    // world-space XZ (so adjacent tiles on the sphere share one continuous
    // swell — their local frames are rotated), and the vertex is pushed along
    // local Y, i.e. the tile's radial surface normal, so the water rises off
    // the planet surface. Displacing here (right after begin_vertex) feeds the
    // projection, the world position, and the shadow position, so the swelled
    // surface, its silhouette, and its shadows stay in phase. The multiply by
    // uWaterAmplitude makes the whole term 0 for flat materials.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
 vec3 waterLocal = transformed;
 vec2 waterWorldXZ = ( modelMatrix * vec4( waterLocal, 1.0 ) ).xz;
 transformed.y += uWaterAmplitude * waterHeight( waterWorldXZ ) * waterElevated( waterLocal.y );`
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
 vWaterWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
${WATER_FRAGMENT_GLSL}`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "vec3 totalEmissiveRadiance = emissive;",
      `float waterR = waterRipple( vWaterWorldPos.xz );
 vec3 totalEmissiveRadiance = emissive * ( 0.55 + 0.9 * waterR ) + uWaterGlow * waterR * 0.3;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
 diffuseColor.rgb *= ( 0.92 + 0.16 * waterR );`
    );

    // Roughness modulation: the highlight tightens/loosens with the wave so
    // reflections shimmer instead of staying frozen.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
 roughnessFactor = roughnessFactor * ( 0.6 + 0.7 * waterR );`
    );

    // Normal perturbation: for a height field h(x,z) the surface normal is
    // proportional to ( -dh/dx, 1, -dh/dz ), so the view-space normal tilts
    // AGAINST the slope — the minus is what makes the highlight travel up the
    // wave face. The world-space gradient is rotated into view space so the
    // tilt is correct for every tile orientation on the planet.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
 vec3 waterWorldGrad = waterRippleGradient( vWaterWorldPos.xz );
 vec3 waterViewGrad = ( viewMatrix * vec4( waterWorldGrad, 0.0 ) ).xyz;
 normal = normalize( normal - 0.4 * waterViewGrad );`
    );
  };

  // Time, glow, amplitude, and topY are per-material uniforms, color rides the
  // standard `diffuse` uniform: no per-body program variants, one compile for
  // the whole scene.
  mat.customProgramCacheKey = () => "water_ripple";

  return mat;
};

// Keyed by the clock object so each canvas (game / editor / testing level)
// gets materials bound to its own time uniform instead of reusing another
// canvas's. A WeakMap so the per-color sub-map is dropped when a canvas's
// clock is garbage-collected on unmount — no cache to grow or prune by hand.
const waterMaterialCache = new WeakMap<
  WaterTimeUniform,
  Map<string, MeshStandardMaterial>
>();

/**
 * Returns the cached animated water material for a body color, size, and
 * clock. Materials are shared across every body of the same color *and size*
 * on the *same clock* and live as long as that clock (the scene's provider),
 * so callers must not dispose them. A body of the same color on a different
 * clock, or a different height, gets its own material.
 */
export const getWaterMaterial = (
  color: string,
  time: WaterTimeUniform,
  glow: string,
  amplitude: number,
  topY: number
): MeshStandardMaterial => {
  const key = `${color.toLowerCase()}|${amplitude}|${topY}`;
  let byColor = waterMaterialCache.get(time);
  if (!byColor) {
    byColor = new Map();
    waterMaterialCache.set(time, byColor);
  }
  const existing = byColor.get(key);
  if (existing) {
    return existing;
  }
  const material = createWaterMaterial({ color, time, glow, amplitude, topY });
  byColor.set(key, material);
  return material;
};
