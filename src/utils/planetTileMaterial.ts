import { Color, MeshStandardMaterial } from "three";

export type PlanetTileMaterialParams = {
  baseColor: string;
  emissive: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  tileSeed: number;
  tileHalfHeight: number;
  regolithHighlight: string;
  regolithShadow: string;
  transparent?: boolean;
  opacity?: number;
};

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

  const seed = params.tileSeed;
  const halfH = params.tileHalfHeight;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms["uTileSeed"] = { value: seed };
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
varying vec3 vPlanetWorldPos;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
vPlanetWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vPlanetTop = float( transformed.y >= uTileHalfHeight - 0.0001 );`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform float uTileSeed;
uniform vec3 uRegolithHighlight;
uniform vec3 uRegolithShadow;
varying float vPlanetTop;
varying vec3 vPlanetWorldPos;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
{
	float planetMask = vPlanetTop;
	vec3 pBase = diffuseColor.rgb;
	vec2 pw = vPlanetWorldPos.xz * 0.55 + uTileSeed * vec2( 17.13, 9.37 );
	float h1 = fract( sin( dot( pw, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
	float h2 = fract( sin( dot( pw * 1.73 + vec2( 13.2, 7.9 ), vec2( 269.5, 183.3 ) ) ) * 39123.741 );
	float h3 = fract( sin( dot( pw * 0.41 + vec2( 4.1, 8.8 ), vec2( 151.2, 201.9 ) ) ) * 44129.145 );
	float speckle = smoothstep( 0.88, 0.98, h1 ) * 0.11;
	float surfacePatch = ( h2 - 0.5 ) * 0.07;
	vec2 crv = vec2( h2, h3 ) * 2.0 - 1.0;
	float crater = ( 1.0 - smoothstep( 0.2, 0.55, length( crv ) ) ) * 0.09;
	vec3 pCol = pBase * ( 1.0 + surfacePatch - crater );
	pCol += uRegolithHighlight * speckle;
	pCol -= uRegolithShadow * ( 1.0 - h3 ) * 0.045;
	diffuseColor.rgb = mix( pBase, pCol, planetMask );
}`
    );
  };

  // seed and halfH are uniforms, not part of the program source: share one program across tiles.
  mat.customProgramCacheKey = () => "planet_tile";

  return mat;
};
