import type { WebGLProgramParametersWithUniforms } from "three";

/**
 * Per-instance trail fade for instanced spheres.
 *
 * The trail is a single stretched, motion-oriented instance per projectile
 * (one slot in the shared pool). This patch fades the instance from full
 * brightness at the local +Y tip (the head) to transparent at the -Y tip
 * (the tail), so the projectile reads as a fading streak. The head stays at
 * the exact projectile position (the instance is centered at head -
 * dir * length / 2), and the per-instance color (vColor) tints the whole
 * streak, so each projectile keeps its tower color.
 *
 * `position` is the unit-sphere vertex attribute, so its y is in [-1, 1]:
 * fade = (y + 1) / 2 is 0 at the tail and 1 at the head.
 */

const TRAIL_FADE_VARYING = "vTrailFade";
const TRAIL_FADE_MARKER = "varying float " + TRAIL_FADE_VARYING + ";";

export const patchInstancedTrailFade = (
  shader: WebGLProgramParametersWithUniforms
): void => {
  if (shader.vertexShader.includes(TRAIL_FADE_MARKER)) {
    return;
  }

  shader.vertexShader =
    TRAIL_FADE_MARKER + "\n" +
    shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n" + TRAIL_FADE_VARYING + " = position.y;"
    );

  shader.fragmentShader =
    TRAIL_FADE_MARKER + "\n" +
    shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n" +
        "float trailFade = clamp( 0.5 + 0.5 * " +
        TRAIL_FADE_VARYING +
        ", 0.0, 1.0 );\n" +
        "diffuseColor.a *= trailFade;\n" +
        "totalEmissiveRadiance *= trailFade;"
    );
};
