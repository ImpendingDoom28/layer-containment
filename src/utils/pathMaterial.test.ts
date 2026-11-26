import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import { createPathMaterial } from "./pathMaterial";
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
  color: "#6b7280",
  highlight: "#9aa3ae",
  shadow: "#2b3138",
};

describe("createPathMaterial", () => {
  it("builds a fresh material with a program cache key shared by every path", () => {
    const a = createPathMaterial(sampleParams);
    const b = createPathMaterial({ ...sampleParams, color: "#000000" });

    expect(a).not.toBe(b);
    expect(a.customProgramCacheKey?.()).toBe("path_stone");
    // Colors ride uniforms, not program variants: one program serves the
    // whole scene regardless of the per-material color.
    expect(b.customProgramCacheKey?.()).toBe(a.customProgramCacheKey?.());
  });

  it("injects the worn-stone terms with the expected uniforms and world-space sampling", () => {
    const mat = createPathMaterial(sampleParams);
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

    // The material's own color rides the standard `diffuse` uniform; only
    // the tint extremes are custom uniforms.
    expect(shader.uniforms["uPathHighlight"]).toBeDefined();
    expect(shader.uniforms["uPathShadow"]).toBeDefined();

    // The pattern is sampled in world space so every strip chunk of the
    // merged path shares one continuous surface: the vertex shader carries
    // the world position, the fragment shader receives it as a varying.
    expect(shader.vertexShader).toContain(
      "vPathWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;"
    );
    expect(shader.fragmentShader).toContain("varying vec3 vPathWorldPos;");
    expect(shader.fragmentShader).toContain("vPathWorldPos.xz");

    // The worn-stone field is the planet's shared regolith noise (the same
    // field as the tile and ground materials), inlined verbatim so the GLSL
    // and the JS port in `terrainNoise.test.ts` can never drift apart.
    expect(shader.fragmentShader).toContain(TERRAIN_NOISE_GLSL);
    for (const fn of [
      "terrainHash",
      "terrainValueNoise",
      "terrainFbm",
      "terrainFbmGradient",
    ]) {
      expect(shader.fragmentShader).toContain(fn);
    }

    // Color terms: mottling, grain, sparse specks, dark grit. No crack web —
    // at the game's camera distance it read as scribbled lines, so the
    // surface is a painted stone ground instead.
    expect(shader.fragmentShader).toContain("uPathHighlight, fleck * 0.10");
    expect(shader.fragmentShader).toContain("uPathShadow, grit * 0.20");
    // The speckle masks are band-limited (lattice-interpolated noise), not a
    // thresholded raw per-cell hash — otherwise they alias and flicker when
    // the camera pans.
    expect(shader.fragmentShader).toContain(
      "smoothstep( 0.30, 0.44, terrainValueNoise( pp * 12.0 ) )"
    );
    expect(shader.fragmentShader).toContain(
      "smoothstep( 0.34, 0.46, terrainValueNoise( pp * 22.0 + vec2( 3.7, 9.2 ) ) )"
    );

    // Roughness: a matte ground whose grain breathes the specular slightly.
    expect(shader.fragmentShader).toContain(
      "roughnessFactor *= 0.9 + 0.1 * ( 0.5 + rGrain * 0.5 );"
    );

    // Bump: the grain tilts the normal against the slope (the minus, like the
    // water ripple) along the closed-form FBM gradient, kept small.
    expect(shader.fragmentShader).toContain(
      "pathViewGrad = ( viewMatrix * vec4( pathWorldGrad, 0.0 ) ).xyz"
    );
    expect(shader.fragmentShader).toContain(
      "normal = normalize( normal - 0.06 * pathViewGrad );"
    );
  });
});
