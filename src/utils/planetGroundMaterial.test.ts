import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import { createPlanetGroundMaterial } from "./planetGroundMaterial";
import { TERRAIN_NOISE_GLSL } from "./terrainNoise";

// three r183 no longer exports the old `Shader` type; onBeforeCompile now
// receives WebGLProgramParametersWithUniforms. The tests only need the three
// mutable fields the hook patches.
type ShaderStub = Pick<
  WebGLProgramParametersWithUniforms,
  "uniforms" | "vertexShader" | "fragmentShader"
>;

const minimalShaderForHook: ShaderStub = {
  uniforms: {},
  vertexShader: `#include <common>
 #include <project_vertex>`,
  fragmentShader: `#include <common>
 #include <color_fragment>
 #include <roughnessmap_fragment>
 #include <normal_fragment_maps>`,
};

const sampleParams = {
  baseColor: "#374151",
  metalness: 0.08,
  roughness: 0.9,
  regolithHighlight: "#6b7280",
  regolithShadow: "#1f2937",
};

describe("createPlanetGroundMaterial", () => {
  it("exposes onBeforeCompile and a single program cache key for the scene", () => {
    const mat = createPlanetGroundMaterial(sampleParams);

    expect(mat.onBeforeCompile).toBeDefined();
    expect(mat.customProgramCacheKey).toBeDefined();
    expect(mat.customProgramCacheKey?.()).toBe("planet_ground");
    // Tints ride uniforms, not program variants: one program serves the
    // whole sphere regardless of the material's color.
    const otherMat = createPlanetGroundMaterial({
      ...sampleParams,
      baseColor: "#000000",
    });
    expect(otherMat.customProgramCacheKey?.()).toBe(
      mat.customProgramCacheKey?.()
    );
  });

  it("injects the shared regolith field sampled in world XZ", () => {
    const mat = createPlanetGroundMaterial(sampleParams);
    const shader: ShaderStub = {
      uniforms: { ...minimalShaderForHook.uniforms },
      vertexShader: minimalShaderForHook.vertexShader,
      fragmentShader: minimalShaderForHook.fragmentShader,
    };

    const onBeforeCompile = mat.onBeforeCompile;
    if (onBeforeCompile == null) {
      throw new Error("expected onBeforeCompile");
    }
    onBeforeCompile(
      shader as WebGLProgramParametersWithUniforms,
      {} as WebGLRenderer
    );

    // The same shared planet field as the tile material (inlined verbatim),
    // sampled in world XZ so the exposed ring and the tile tops form one
    // continuous surface.
    expect(shader.fragmentShader).toContain(TERRAIN_NOISE_GLSL);
    expect(shader.vertexShader).toContain("vPlanetWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
    expect(shader.fragmentShader).toContain("varying vec3 vPlanetWorldPos;");
    expect(shader.fragmentShader).toContain("vPlanetWorldPos.xz");

    expect(shader.uniforms["uRegolithHighlight"]).toBeDefined();
    expect(shader.uniforms["uRegolithShadow"]).toBeDefined();

    // Color terms: mottling, grain, tonal patches, specks, grit, seams, and
    // the darkening that reads as terrain under the slabs.
    expect(shader.fragmentShader).toContain("terrainFbm( gp * 0.9 )");
    expect(shader.fragmentShader).toContain("terrainFbm( gp * 5.0 )");
    expect(shader.fragmentShader).toContain("uRegolithHighlight, speckle * 0.16");
    expect(shader.fragmentShader).toContain("uRegolithShadow, grit * 0.22");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = reg * 0.86;");

    // Roughness: a matte ground whose grain breathes the specular slightly.
    expect(shader.fragmentShader).toContain(
      "roughnessFactor *= 0.92 + 0.08 * ( 0.5 + rGrain * 0.5 );"
    );

    // Bump: the grain tilts the normal against the slope along the closed-form
    // FBM gradient, kept small.
    expect(shader.fragmentShader).toContain(
      "groundViewGrad = ( viewMatrix * vec4( groundWorldGrad, 0.0 ) ).xyz"
    );
    expect(shader.fragmentShader).toContain(
      "normal = normalize( normal - 0.06 * groundViewGrad );"
    );
  });
});
