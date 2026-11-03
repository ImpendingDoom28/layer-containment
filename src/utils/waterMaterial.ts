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
 * MeshStandardMaterial with a gentle ripple baked into the emissive, surface
 * tint, roughness, and surface normal. The pattern is driven by world-space XZ
 * coordinates (not the per-mesh UVs), so adjacent water tiles/bodies share one
 * continuous wave field instead of each pooling its own phase.
 *
 * The ripple is made to read as *motion in the reflections* (not just a faint
 * emissive pulse): the analytic gradient of the wave field perturbs the
 * view-space normal, so specular highlights slide across the surface, while a
 * roughness modulation makes the highlight shimmer. One GLSL program is shared
 * by every water tile/body (`customProgramCacheKey`), and the time/glow
 * uniforms are shared objects, so the only per-color state is the standard
 * color/emissive pair.
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

    // Three sines form one wave field; the analytic gradient of that field is
    // used to perturb the normal so highlights move, not just the emissive.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
 uniform float uWaterTime;
 uniform vec3 uWaterGlow;
 varying vec3 vWaterWorldPos;
 vec3 waterRippleCos( vec2 p ) {
 	float a1 = p.x * 2.1 + uWaterTime * 0.9;
 	float a2 = ( p.x * 0.6 + p.y * 1.7 ) * 1.8 - uWaterTime * 0.7;
 	float a3 = ( p.x * 0.9 - p.y * 1.3 ) * 1.1 + uWaterTime * 0.5;
 	return vec3( cos( a1 ), cos( a2 ), cos( a3 ) );
 }
 float waterRipple( vec2 p ) {
 	float a1 = p.x * 2.1 + uWaterTime * 0.9;
 	float a2 = ( p.x * 0.6 + p.y * 1.7 ) * 1.8 - uWaterTime * 0.7;
 	float a3 = ( p.x * 0.9 - p.y * 1.3 ) * 1.1 + uWaterTime * 0.5;
 	return ( sin( a1 ) * 0.5 + sin( a2 ) * 0.3 + sin( a3 ) * 0.2 ) * 0.5 + 0.5;
 }
 vec2 waterRippleGradient( vec2 p ) {
 	vec3 c = waterRippleCos( p );
 	float gx = 0.5 * ( 1.05 * c.x + 0.324 * c.y + 0.198 * c.z );
 	float gy = 0.5 * ( 0.918 * c.y - 0.286 * c.z );
 	return vec2( gx, gy );
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

    // Roughness modulation: the highlight tightens/loosens with the wave so
    // reflections shimmer instead of staying frozen.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
 roughnessFactor = roughnessFactor * ( 0.6 + 0.7 * waterR );`
    );

    // Normal perturbation: slide the view-space normal along the wave field's
    // gradient so the bright specular reflection visibly travels.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
 vec3 waterWorldGrad = waterRippleGradient( vWaterWorldPos.xz );
 vec3 waterViewGrad = ( viewMatrix * vec4( waterWorldGrad, 0.0 ) ).xyz;
 normal = normalize( normal + 0.4 * waterViewGrad );`
    );
  };

  // Time and glow are shared uniforms, color rides the standard `diffuse`
  // uniform: no per-body program variants, one compile for the whole scene.
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
 * Returns the cached animated water material for a body color on a given
 * clock. Materials are shared across every body of the same color *on the
 * same clock* and live as long as that clock (the scene's provider), so
 * callers must not dispose them. A body of the same color on a different
 * clock gets its own material bound to that clock's time uniform.
 */
export const getWaterMaterial = (
  color: string,
  time: WaterTimeUniform,
  glow: string
): MeshStandardMaterial => {
  const key = color.toLowerCase();
  let byColor = waterMaterialCache.get(time);
  if (!byColor) {
    byColor = new Map();
    waterMaterialCache.set(time, byColor);
  }
  const existing = byColor.get(key);
  if (existing) {
    return existing;
  }
  const material = createWaterMaterial({ color, time, glow });
  byColor.set(key, material);
  return material;
};
