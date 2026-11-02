import { Color, MeshStandardMaterial } from "three";

/** Shared per-frame time uniform: one `{ value }` object every water material
 *  references, so a single write animates all water bodies in the scene. */
export type WaterTimeUniform = { value: number };

type CreateWaterMaterialParams = {
  color: string;
  time: WaterTimeUniform;
  glow: string;
};

/**
 * MeshStandardMaterial with a gentle ripple baked into the emissive and
 * surface tint. The pattern is driven by world-space XZ coordinates (not the
 * per-mesh UVs), so adjacent water bodies share one continuous wave field
 * instead of each pooling its own phase. One GLSL program is shared by every
 * water body (`customProgramCacheKey`), and the time/glow uniforms are shared
 * objects, so the only per-color state is the standard color/emissive pair.
 */
const createWaterMaterial = (
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

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vWaterWorldPos;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
vWaterWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform float uWaterTime;
uniform vec3 uWaterGlow;
varying vec3 vWaterWorldPos;
float waterRipple( vec2 p ) {
	float w1 = sin( p.x * 2.1 + uWaterTime * 0.9 );
	float w2 = sin( ( p.x * 0.6 + p.y * 1.7 ) * 1.8 - uWaterTime * 0.7 );
	float w3 = sin( ( p.x * 0.9 - p.y * 1.3 ) * 1.1 + uWaterTime * 0.5 );
	return ( w1 * 0.5 + w2 * 0.3 + w3 * 0.2 ) * 0.5 + 0.5;
}`
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
  };

  // Time and glow are shared uniforms, color rides the standard `diffuse`
  // uniform: no per-body program variants, one compile for the whole scene.
  mat.customProgramCacheKey = () => "water_ripple";

  return mat;
};

const waterMaterialCache = new Map<string, MeshStandardMaterial>();

/**
 * Returns the cached animated water material for a body color. Materials are
 * shared across every body of the same color and live for the app lifetime
 * (they reference the shared time uniform), so callers must not dispose them.
 */
export const getWaterMaterial = (
  color: string,
  time: WaterTimeUniform,
  glow: string
): MeshStandardMaterial => {
  const key = color.toLowerCase();
  const existing = waterMaterialCache.get(key);
  if (existing) {
    return existing;
  }
  const material = createWaterMaterial({ color, time, glow });
  waterMaterialCache.set(key, material);
  return material;
};
