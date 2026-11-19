import { Color, MeshStandardMaterial } from "three";

type CreatePathMaterialParams = {
  color: string;
  /** Lighter tone for the worn highlights (top of cracks, flake edges). */
  highlight: string;
  /** Darker tone for the deep crack and pit bottoms. */
  shadow: string;
};

// Shared noise/hash field, inlined into both the fragment shader (color and
// bump terms) and the test's JS port. Kept as one string so the GLSL and the
// numerical test can never drift apart.
export const PATH_GLSL_NOISE = `
float pathHash( vec2 p ) {
	return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}
float pathValueNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix(
		mix( pathHash( i ), pathHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		mix( pathHash( i + vec2( 0.0, 1.0 ) ), pathHash( i + vec2( 1.0, 1.0 ) ), u.x ),
		u.y
	) - 0.5;
}
float pathFbm( vec2 p ) {
	float v = 0.0;
	float a = 0.5;
	for ( int i = 0; i < 3; i++ ) {
		v += a * pathValueNoise( p );
		p = p * 2.13 + 11.7;
		a *= 0.5;
	}
	return v;
}`;

// Crack field: ridged (1 - |noise|) noise sharpened with a tight threshold so
// only the ridge crests read as hairline cracks. Ridged noise has no closed
// form for a derivative, so the crack bump uses its own central difference
// (the grain uses the closed-form derivative of the FBM itself).
export const PATH_GLSL_CRACKS = `
float pathCracks( vec2 p ) {
	float r = 1.0 - abs( pathFbm( p ) );
	return smoothstep( 0.985, 1.0, r );
}`;

/**
 * A worn-stone `MeshStandardMaterial` for the path surface: procedural
 * tonal mottling, regolith grain, bright mineral flecks, and hairline cracks
 * painted in world space, so every path strip and corner tile on the planet
 * shares one continuous surface — no UV seams between the ~2,000 baked strip
 * chunks, and no texture asset to load.
 *
 * The field modulates the base color, the roughness (glossy mineral flecks
 * against a matte ground), and the fragment normal through the analytic
 * gradient of the FBM (closed form: each value-noise octave differentiates as
 * `a_i * 2.13^i * u'(f)` with `u' = 6 f (1 - f)` — the test checks it against
 * finite differences). The cracks add dark hairlines with their own bump
 * (central differences, since ridged noise has no closed form) and a bright
 * top-lit edge so they read as real fissures instead of printed lines. The
 * mineral flecks and grit use lattice-interpolated (band-limited) noise rather
 * than a thresholded raw hash, so the specks read as soft grains and do not
 * flicker when the camera pans. One GLSL program is shared by every path in
 * the scene (`customProgramCacheKey`); all the variation rides on the world
 * coordinates, so the material is created once per level load.
 */
export const createPathMaterial = (
  params: CreatePathMaterialParams
): MeshStandardMaterial => {
  const mat = new MeshStandardMaterial({
    color: params.color,
    metalness: 0.05,
    roughness: 0.9,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms["uPathHighlight"] = {
      value: new Color(params.highlight),
    };
    shader.uniforms["uPathShadow"] = { value: new Color(params.shadow) };

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
 varying vec3 vPathWorldPos;
 uniform vec3 uPathHighlight;
 uniform vec3 uPathShadow;
 ${PATH_GLSL_NOISE}
 ${PATH_GLSL_CRACKS}
 // Analytic gradient of pathFbm, matching its octaves one for one: octave i
 // has amplitude a_i, argument q_i = 2.13^i * p (+ offset), so its frequency
 // factor is 2.13^i, and the value-noise derivative is u' = 6 f (1 - f).
 vec3 pathFbmGradient( vec2 p ) {
 	vec2 g = vec2( 0.0 );
 	float a = 0.5;
 	float s = 1.0;
 	vec2 q = p;
 	for ( int i = 0; i < 3; i++ ) {
		vec2 ic = floor( q );
		vec2 fc = fract( q );
		vec2 uc = fc * fc * ( 3.0 - 2.0 * fc );
		vec2 du = 6.0 * fc * ( 1.0 - fc );
		float c00 = pathHash( ic );
		float c10 = pathHash( ic + vec2( 1.0, 0.0 ) );
		float c01 = pathHash( ic + vec2( 0.0, 1.0 ) );
		float c11 = pathHash( ic + vec2( 1.0, 1.0 ) );
		g += a * s * du * vec2(
			( c10 - c00 ) * ( 1.0 - uc.y ) + ( c11 - c01 ) * uc.y,
			( c01 - c00 ) * ( 1.0 - uc.x ) + ( c11 - c10 ) * uc.x
		);
		q = q * 2.13 + 11.7;
		a *= 0.5;
		s *= 2.13;
	}
 	return vec3( g.x, 0.0, g.y );
 }
 vec3 pathCrackGradient( vec2 p ) {
 	const float eps = 0.05;
 	float gx = ( pathCracks( p + vec2( eps, 0.0 ) )
		- pathCracks( p - vec2( eps, 0.0 ) ) ) / ( 2.0 * eps );
 	float gz = ( pathCracks( p + vec2( 0.0, eps ) )
		- pathCracks( p - vec2( 0.0, eps ) ) ) / ( 2.0 * eps );
 	return vec3( gx, 0.0, gz );
 }`
    );

    // `transformed` is the local (pre-merge) position; modelMatrix is the
    // identity here, so this is the world position of the merged path.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
 varying vec3 vPathWorldPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
 vPathWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
    );

    // Color: low-frequency mottling (large tonal patches), fine FBM grain,
    // bright mineral flecks, and dark grit — all sampled in world XZ so the
    // pattern is continuous across every strip chunk.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
 {
 	vec2 pp = vPathWorldPos.xz;
 	float grain = pathFbm( pp * 2.2 );
 	float mottle = pathFbm( pp * 0.55 + vec2( 7.3, 3.1 ) );
 	// Lattice-interpolated (band-limited) noise instead of the raw per-cell
 	// hash, so the specks read as soft grains and do not flicker when the
 	// camera pans. The color and the roughness mask sample the same fleck
 	// field, so the bright grain and its glassy specular stay in register.
 	float fleck = smoothstep( 0.28, 0.44, pathValueNoise( pp * 4.0 ) );
 	float grit = smoothstep( 0.32, 0.46, pathValueNoise( pp * 11.0 + vec2( 3.7, 9.2 ) ) );
 	float cracks = pathCracks( pp * 1.7 );
 	float crackEdge = pathCracks( pp * 1.7 + vec2( 0.06, 0.0 ) ) - cracks;
 	diffuseColor.rgb *= 0.9 + 0.2 * ( 0.5 + grain * 0.5 + mottle * 0.35 );
 	diffuseColor.rgb = mix( diffuseColor.rgb, uPathHighlight, fleck * 0.22 );
 	diffuseColor.rgb = mix( diffuseColor.rgb, uPathShadow, grit * 0.28 );
 	diffuseColor.rgb = mix( diffuseColor.rgb, uPathShadow, cracks * 0.45 );
 	diffuseColor.rgb += uPathHighlight * crackEdge * 0.25;
 }`
    );

    // Roughness: the ground is matte, the mineral flecks are glassy, the
    // grain breathes — so the specular response is no longer a uniform gray.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
 {
 	vec2 rp = vPathWorldPos.xz;
 	float rFleck = smoothstep( 0.28, 0.44, pathValueNoise( rp * 4.0 ) );
 	float rGrain = pathFbm( rp * 2.2 );
 	roughnessFactor = roughnessFactor * ( 0.85 + 0.2 * ( 0.5 + rGrain * 0.5 ) ) - rFleck * 0.45;
 }`
    );

    // Bump: tilt the fragment normal against the grain's slope (the minus,
    // like the water ripple, is what makes light travel across the surface).
    // The crack field peaks at the fissure center, so its gradient is ADDED —
    // a negative-height bump, the opposite sign of the raised grain/water — to
    // carve the fissure in instead of embossing it out.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
 {
 	vec2 bp = vPathWorldPos.xz;
 	vec3 pathWorldGrad = pathFbmGradient( bp * 2.2 ) * 2.2;
 	vec3 pathViewGrad = ( viewMatrix * vec4( pathWorldGrad, 0.0 ) ).xyz;
 	vec3 crackViewGrad = ( viewMatrix * vec4( pathCrackGradient( bp * 1.7 ), 0.0 ) ).xyz;
 	normal = normalize( normal - 0.10 * pathViewGrad + 0.45 * crackViewGrad );
 }`
    );
  };

  // Highlight and shadow ride uniforms, not program variants: one compile
  // for every path in the scene.
  mat.customProgramCacheKey = () => "path_stone";

  return mat;
};
