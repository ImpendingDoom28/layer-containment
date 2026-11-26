/**
 * The one procedural noise field the planet's stone surfaces share: a value
 * noise with three FBM octaves and its analytic gradient, inlined verbatim
 * into the tile-regolith and ground-sphere fragment shaders. Keeping it a
 * single exported string (instead of each material carrying a private copy,
 * the way the water material does for its wave field) means the tile tops and
 * the planet's exposed ring sample the *same* field — a continuous surface
 * with no per-tile patchwork — and the JS port in the test can never drift
 * from the GLSL.
 *
 * All functions are pure and stateless; the field is sampled in world-space
 * XZ by the callers. `terrainFbm` stays roughly within [-0.5, 0.5]; the
 * gradient is the exact derivative of `terrainFbm` (each value-noise octave
 * differentiates as `a_i * 2.13^i * u'(f)` with `u' = 6f(1 - f)`), so bump
 * shading can tilt the normal against the real grain.
 */
export const TERRAIN_NOISE_GLSL = `
float terrainHash( vec2 p ) {
	return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}
float terrainValueNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix(
		mix( terrainHash( i ), terrainHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		mix( terrainHash( i + vec2( 0.0, 1.0 ) ), terrainHash( i + vec2( 1.0, 1.0 ) ), u.x ),
		u.y
	) - 0.5;
}
float terrainFbm( vec2 p ) {
	float v = 0.0;
	float a = 0.5;
	for ( int i = 0; i < 3; i++ ) {
		v += a * terrainValueNoise( p );
		p = p * 2.13 + 11.7;
		a *= 0.5;
	}
	return v;
}
vec3 terrainFbmGradient( vec2 p ) {
	vec2 g = vec2( 0.0 );
	float a = 0.5;
	float s = 1.0;
	vec2 q = p;
	for ( int i = 0; i < 3; i++ ) {
		vec2 ic = floor( q );
		vec2 fc = fract( q );
		vec2 uc = fc * fc * ( 3.0 - 2.0 * fc );
		vec2 du = 6.0 * fc * ( 1.0 - fc );
		float c00 = terrainHash( ic );
		float c10 = terrainHash( ic + vec2( 1.0, 0.0 ) );
		float c01 = terrainHash( ic + vec2( 0.0, 1.0 ) );
		float c11 = terrainHash( ic + vec2( 1.0, 1.0 ) );
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
