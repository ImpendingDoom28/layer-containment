import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import { createPlanetTileMaterial } from "./planetTileMaterial";
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
  baseColor: "#888888",
  emissive: "#000000",
  emissiveIntensity: 0,
  metalness: 0.2,
  roughness: 0.9,
  tileHalfHeight: 0.25,
  regolithHighlight: "#ffffff",
  regolithShadow: "#333333",
  transparent: false as const,
  opacity: 1,
};

describe("createPlanetTileMaterial", () => {
  it("exposes onBeforeCompile and a program cache key shared by every tile", () => {
    const mat = createPlanetTileMaterial(sampleParams);

    expect(mat.onBeforeCompile).toBeDefined();
    expect(mat.customProgramCacheKey).toBeDefined();
    const key = mat.customProgramCacheKey?.();
    expect(key).toBe("planet_tile");
    // The tint extremes and half-height are uniforms, not program source: all
    // tiles share one program.
    const otherMat = createPlanetTileMaterial({
      ...sampleParams,
      tileHalfHeight: 0.75,
    });
    expect(otherMat.customProgramCacheKey?.()).toBe(key);
  });

  it("injects the world-space regolith field with the expected uniforms", () => {
    const mat = createPlanetTileMaterial(sampleParams);
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

    // The shared planet field is inlined verbatim, and sampled in world XZ
    // (the vertex shader carries the world position), so adjacent tiles and
    // the ground sphere form one continuous surface.
    expect(shader.fragmentShader).toContain(TERRAIN_NOISE_GLSL);
    expect(shader.vertexShader).toContain("vPlanetWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
    expect(shader.fragmentShader).toContain("varying vec3 vPlanetWorldPos;");
    expect(shader.fragmentShader).toContain("vPlanetWorldPos.xz");

    expect(shader.uniforms["uTileHalfHeight"]).toBeDefined();
    expect(shader.uniforms["uRegolithHighlight"]).toBeDefined();
    expect(shader.uniforms["uRegolithShadow"]).toBeDefined();

    // Top-face mask plus the side-face local-Y gradient (the slab's edges
    // darken toward the base).
    expect(shader.fragmentShader).toContain("vPlanetTop");
    expect(shader.fragmentShader).toContain("vPlanetLocalY");

    // Color terms: mottling, grain, tonal patches, specks, grit, seams.
    expect(shader.fragmentShader).toContain("terrainFbm( tp * 0.9 )");
    expect(shader.fragmentShader).toContain("terrainFbm( tp * 5.0 )");
    expect(shader.fragmentShader).toContain("uRegolithHighlight, speckle * 0.16");
    expect(shader.fragmentShader).toContain("uRegolithShadow, grit * 0.22");

    // Roughness: a matte ground whose grain breathes the specular slightly.
    expect(shader.fragmentShader).toContain(
      "roughnessFactor *= 0.92 + 0.08 * ( 0.5 + rGrain * 0.5 );"
    );

    // Bump: the grain tilts the normal against the slope along the closed-form
    // FBM gradient, kept small.
    expect(shader.fragmentShader).toContain(
      "tileViewGrad = ( viewMatrix * vec4( tileWorldGrad, 0.0 ) ).xyz"
    );
    expect(shader.fragmentShader).toContain(
      "normal = normalize( normal - 0.06 * tileViewGrad );"
    );
  });
});
