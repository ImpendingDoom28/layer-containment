import { Color, MeshStandardMaterial } from "three";

import { TERRAIN_NOISE_GLSL } from "./terrainNoise";

export type PlanetTileMaterialParams = {
  baseColor: string;
  emissive: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  tileHalfHeight: number;
  regolithHighlight: string;
  regolithShadow: string;
  transparent?: boolean;
  opacity?: number;
};

/**
 * The land-tile slab's regolith surface: a procedural stone painted in
 * world-space XZ with the shared planet terrain field (see
 * `terrainNoise`), so the tile tops are one continuous surface that the
 * exposed ground sphere around the board picks up seamlessly — no per-tile
 * patchwork, no UV seams, no texture asset.
 *
 * The top face carries the full treatment: low-frequency mottling and tonal
 * patches (large-scale), FBM grain (fine), sparse mineral specks, dark grit,
 * and faint seams between the slabs. The side faces — visible only at the
 * board's rim, at canyon edges, and in the editor's thin slabs — darken
 * toward the base along the slab's local Y (a vertex-attribute gradient, so
 * no extra geometry) with the same grain, reading as a solid stone block
 * rather than a sticker. The grain also modulates the roughness and the
 * fragment normal (tilted against the FBM's analytic gradient, the same
 * closed-form derivative the path material uses), kept small so the surface
 * reads as weathered regolith, not relief.
 *
 * All tints ride uniforms and the slab half-height is a uniform, so every
 * tile in the scene shares one GLSL program (`customProgramCacheKey`); the
 * slabs share one material per slab height (land regolith is painted in
 * world space, so no per-tile instance is needed at all).
 */
export const createPlanetTileMaterial = (
  params: PlanetTileMaterialParams
): MeshStandardMaterial => {
  const mat = new MeshStandardMaterial({
    color: params.baseColor,
    emissive: params.emissive,
    emissiveIntensity: params.emissiveIntensity,
    metalness: params.metalness,
    roughness: params.roughness,
    transparent: params.transparent ?? false,
    opacity: params.opacity ?? 1,
  });

  const halfH = params.tileHalfHeight;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms["uTileHalfHeight"] = { value: halfH };
    shader.uniforms["uRegolithHighlight"] = {
      value: new Color(params.regolithHighlight),
    };
    shader.uniforms["uRegolithShadow"] = {
      value: new Color(params.regolithShadow),
    };

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
uniform float uTileHalfHeight;
varying float vPlanetTop;
varying vec3 vPlanetWorldPos;
varying float vPlanetLocalY;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
vPlanetWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vPlanetTop = float( transformed.y >= uTileHalfHeight - 0.0001 );
vPlanetLocalY = transformed.y;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform float uTileHalfHeight;
uniform vec3 uRegolithHighlight;
uniform vec3 uRegolithShadow;
varying float vPlanetTop;
varying vec3 vPlanetWorldPos;
varying float vPlanetLocalY;
${TERRAIN_NOISE_GLSL}`
    );

    // Color: the shared regolith field, sampled in world XZ so adjacent tiles
    // and the ground sphere form one continuous surface. The top face gets
    // the full treatment; the side faces (the slab's edges, visible at the
    // board rim / canyon edges / editor) darken toward the base along the
    // slab's local Y.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
{
	vec2 tp = vPlanetWorldPos.xz;
	float mottle = terrainFbm( tp * 0.9 );
	float grain = terrainFbm( tp * 5.0 );
	float tone = terrainFbm( tp * 0.35 + vec2( 4.7, 9.1 ) );
	float speckle = smoothstep( 0.32, 0.46, terrainValueNoise( tp * 14.0 ) );
	float grit = smoothstep( 0.36, 0.5, terrainValueNoise( tp * 26.0 + vec2( 3.7, 9.2 ) ) );
	float seam = smoothstep( 0.47, 0.5, abs( terrainValueNoise( tp * 4.5 + vec2( 7.3, 1.9 ) ) ) );
	vec3 reg = diffuseColor.rgb;
	reg *= 0.92 + 0.16 * ( 0.5 + mottle * 0.6 + grain * 0.4 );
	reg *= 1.0 + tone * 0.12;
	reg = mix( reg, uRegolithHighlight, speckle * 0.16 );
	reg = mix( reg, uRegolithShadow, grit * 0.22 );
	reg *= 1.0 - seam * 0.18;
	float side = 1.0 - vPlanetTop;
	float sideGrad = 1.0 - smoothstep( -uTileHalfHeight, uTileHalfHeight, vPlanetLocalY );
	float sideGrain = 0.82 + 0.18 * ( 0.5 + grain * 0.5 );
	float sideDark = 0.82 + 0.18 * ( 1.0 - sideGrad );
	diffuseColor.rgb = reg * mix( 1.0, sideGrain * sideDark, side );
}`
    );

    // Roughness: matte regolith whose grain breathes the specular slightly.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
{
	float rGrain = terrainFbm( vPlanetWorldPos.xz * 5.0 );
	roughnessFactor *= 0.92 + 0.08 * ( 0.5 + rGrain * 0.5 );
}`
    );

    // Bump: tilt the fragment normal against the grain's slope (the minus is
    // what makes light travel across the surface) along the closed-form FBM
    // gradient — the same technique as the path material.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
{
	vec2 bp = vPlanetWorldPos.xz;
	vec3 tileWorldGrad = terrainFbmGradient( bp * 5.0 ) * 5.0;
	vec3 tileViewGrad = ( viewMatrix * vec4( tileWorldGrad, 0.0 ) ).xyz;
	normal = normalize( normal - 0.06 * tileViewGrad );
}`
    );
  };

  // The tint extremes and half-height are uniforms, not program source: all
  // tiles share one program.
  mat.customProgramCacheKey = () => "planet_tile";

  return mat;
};
