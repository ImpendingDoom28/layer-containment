import { Color, MeshStandardMaterial } from "three";

type CreatePathMaterialParams = {
  color: string;
  /** Lighter tone for the worn highlights (specks). */
  highlight: string;
  /** Darker tone for the grit pits. */
  shadow: string;
};

// Shared noise field, inlined into both the fragment shader and the test's JS
// port. Kept as one string so the GLSL and the numerical test can never drift
// apart.
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

// Analytic gradient of pathFbm, matching its octaves one for one: octave i
// has amplitude a_i, argument q_i = 2.13^i * p (+ offset), so its frequency
// factor is 2.13^i, and the value-noise derivative is u' = 6 f (1 - f).
const PATH_GLSL_GRADIENT = `
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
}`;

/**
 * A worn-stone `MeshStandardMaterial` for the path surface: low-frequency
 * tonal mottling, fine grain, and sparse grit specks painted in world space,
 * so every path strip and corner tile on the planet shares one continuous
 * surface — no UV seams between the ~2,000 baked strip chunks, and no texture
 * asset to load.
 *
 * The field modulates the base color, the roughness, and the fragment normal
 * (the grain through the analytic gradient of the FBM, closed form: each
 * value-noise octave differentiates as `a_i * 2.13^i * u'(f)` with
 * `u' = 6 f (1 - f)` — the test checks it against finite differences), all
 * sampled in world XZ. The speck masks are band-limited (lattice-interpolated
 * noise, not a thresholded raw hash, so they do not flicker when the camera
 * pans), and the bump is kept small: at the game's camera distance the grain
 * is a whisper of relief, not a relief map. One GLSL program is shared by
 * every path in the scene (`customProgramCacheKey`), so the material is
 * created once per level load.
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
 ${PATH_GLSL_GRADIENT}`
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

    // Color: low-frequency mottling (large tonal patches), fine grain, and
    // sparse specks — all sampled in world XZ so the pattern is continuous
    // across every strip chunk.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
 {
 	vec2 pp = vPathWorldPos.xz;
 	float mottle = pathFbm( pp * 0.9 + vec2( 3.1, 7.7 ) );
 	float grain = pathFbm( pp * 5.0 );
 	float fleck = smoothstep( 0.30, 0.44, pathValueNoise( pp * 12.0 ) );
 	float grit = smoothstep( 0.34, 0.46, pathValueNoise( pp * 22.0 + vec2( 3.7, 9.2 ) ) );
 	diffuseColor.rgb *= 0.9 + 0.2 * ( 0.5 + mottle * 0.5 + grain * 0.35 );
 	diffuseColor.rgb = mix( diffuseColor.rgb, uPathHighlight, fleck * 0.10 );
 	diffuseColor.rgb = mix( diffuseColor.rgb, uPathShadow, grit * 0.20 );
 }`
    );

    // Roughness: the ground is matte and the grain breathes the specular slightly,
    // so the response is no longer a uniform gray.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
 {
 	vec2 rp = vPathWorldPos.xz;
 	float rGrain = pathFbm( rp * 5.0 );
 	roughnessFactor *= 0.9 + 0.1 * ( 0.5 + rGrain * 0.5 );
 }`
    );

    // Bump: tilt the fragment normal against the grain's slope (the minus,
    // like the water ripple, is what makes light travel across the surface) along
    // the closed-form FBM gradient.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
 {
 	vec2 bp = vPathWorldPos.xz;
 	vec3 pathWorldGrad = pathFbmGradient( bp * 5.0 ) * 5.0;
 	vec3 pathViewGrad = ( viewMatrix * vec4( pathWorldGrad, 0.0 ) ).xyz;
 	normal = normalize( normal - 0.06 * pathViewGrad );
 }`
    );
  };

  // Tints ride uniforms, not program variants: one compile for every path in
  // the scene.
  mat.customProgramCacheKey = () => "path_stone";

  return mat;
};
