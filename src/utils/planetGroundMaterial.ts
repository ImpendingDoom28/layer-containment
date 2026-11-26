import { Color, MeshStandardMaterial } from "three";

import { TERRAIN_NOISE_GLSL } from "./terrainNoise";

export type PlanetGroundMaterialParams = {
  baseColor: string;
  metalness: number;
  roughness: number;
  regolithHighlight: string;
  regolithShadow: string;
};

/**
 * The planet sphere's exposed ring (the ground around the board): the same
 * procedural regolith as the land-tile tops (`planetTileMaterial`), sampled
 * in world-space XZ with the shared planet terrain field (`terrainNoise`),
 * so the surface runs continuously from a tile top across the exposed
 * planet — no per-tile patchwork, no UV seams, no texture asset.
 *
 * The tile tops sit `pathYOffset` above the sphere, so the ring reads as the
 * terrain *under* the slabs: the same field, shifted off the tile's sample
 * point and darkened, so a tile top and the ring beneath it are obviously the
 * same material and the ring stays a step quieter than the board. The FBM grain
 * also modulates the roughness and the fragment normal (tilted against the
 * analytic gradient, the same closed-form derivative the path material uses),
 * kept small so the planet reads as weathered stone, not relief.
 *
 * One shared material per scene: tints ride uniforms and there is no
 * per-tile state, so a single GLSL program serves the whole sphere
 * (`customProgramCacheKey`).
 */
export const createPlanetGroundMaterial = (
  params: PlanetGroundMaterialParams
): MeshStandardMaterial => {
  const mat = new MeshStandardMaterial({
    color: params.baseColor,
    metalness: params.metalness,
    roughness: params.roughness,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms["uRegolithHighlight"] = {
      value: new Color(params.regolithHighlight),
    };
    shader.uniforms["uRegolithShadow"] = {
      value: new Color(params.regolithShadow),
    };

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vPlanetWorldPos;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
vPlanetWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform vec3 uRegolithHighlight;
uniform vec3 uRegolithShadow;
varying vec3 vPlanetWorldPos;
${TERRAIN_NOISE_GLSL}`
    );

    // Color: the tile regolith field at the sphere's own world position
    // (offset from the tile tops' sample points), darkened to read as the
    // terrain under the slabs.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
{
	vec2 gp = vPlanetWorldPos.xz;
	float mottle = terrainFbm( gp * 0.9 );
	float grain = terrainFbm( gp * 5.0 );
	float tone = terrainFbm( gp * 0.35 + vec2( 4.7, 9.1 ) );
	float speckle = smoothstep( 0.32, 0.46, terrainValueNoise( gp * 14.0 ) );
	float grit = smoothstep( 0.36, 0.5, terrainValueNoise( gp * 26.0 + vec2( 3.7, 9.2 ) ) );
	float seam = smoothstep( 0.47, 0.5, abs( terrainValueNoise( gp * 4.5 + vec2( 7.3, 1.9 ) ) ) );
	vec3 reg = diffuseColor.rgb;
	reg *= 0.92 + 0.16 * ( 0.5 + mottle * 0.6 + grain * 0.4 );
	reg *= 1.0 + tone * 0.12;
	reg = mix( reg, uRegolithHighlight, speckle * 0.16 );
	reg = mix( reg, uRegolithShadow, grit * 0.22 );
	reg *= 1.0 - seam * 0.18;
	diffuseColor.rgb = reg * 0.86;
}`
    );

    // Roughness: matte stone whose grain breathes the specular slightly.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
{
	float rGrain = terrainFbm( vPlanetWorldPos.xz * 5.0 );
	roughnessFactor *= 0.92 + 0.08 * ( 0.5 + rGrain * 0.5 );
}`
    );

    // Bump: tilt the fragment normal against the grain's slope along the
    // closed-form FBM gradient (the minus makes light travel across the
    // surface) — the same technique as the path material.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
{
	vec2 bp = vPlanetWorldPos.xz;
	vec3 groundWorldGrad = terrainFbmGradient( bp * 5.0 ) * 5.0;
	vec3 groundViewGrad = ( viewMatrix * vec4( groundWorldGrad, 0.0 ) ).xyz;
	normal = normalize( normal - 0.06 * groundViewGrad );
}`
    );
  };

  // Tints ride uniforms: one program for the whole scene's sphere.
  mat.customProgramCacheKey = () => "planet_ground";

  return mat;
};
