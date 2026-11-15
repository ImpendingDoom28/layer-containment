import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { MathUtils, Uniform } from "three";

import {
  RADIAL_BLUR_ANGULAR_MAX_RAD_S,
  RADIAL_BLUR_ANGULAR_THRESHOLD_RAD_S,
  RADIAL_BLUR_LINEAR_MAX_UNITS_S,
  RADIAL_BLUR_LINEAR_THRESHOLD_UNITS_S,
} from "../../../constants/radialBlur";

/**
 * A cheap radial blur for the post-process chain: the previous frame's
 * framebuffer is re-sampled along rays from the screen center and averaged,
 * the strength (`uOffset`) scaling the ray length. At `uOffset` 0 every sample
 * collapses onto the center, so the effect is a no-op — which is also how it is
 * gated (see `PostFX`).
 *
 * It is a `postprocessing` `Effect` that reads the `inputBuffer` directly and
 * averages a fixed ring of samples per pixel, so it costs a handful of extra
 * texture fetches only when the camera is actually moving fast, and none at
 * rest. The `CONVOLUTION` attribute tells the composer that the effect samples
 * the input buffer beyond its main pixel: in a shared `EffectPass` (e.g. with
 * Bloom) it is then executed first, so the ring reads the un-blurred scene
 * rather than an already-processed frame.
 */
const FRAGMENT_SHADER = /* glsl */ `
uniform float uOffset;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Idle camera: uOffset is 0, so skip the ring sampling entirely (a uniform
  // branch is free on all GPUs) and pass the pixel through untouched. The 9-tap
  // ring only costs anything during an actual yank.
  if (uOffset <= 0.0) {
    outputColor = inputColor;
    return;
  }
  vec2 dir = uv - 0.5;
  // 9 taps total (the center sample plus 8 around the ring), all read from the
  // input buffer and averaged over 9 so a uniform image keeps its brightness
  // regardless of whether the smear is active.
  vec4 color = texture2D(inputBuffer, uv).rgba;
  for (int i = 1; i < 9; i++) {
    float t = float(i) * 0.125;
    color += texture2D(inputBuffer, uv + dir * uOffset * t).rgba;
  }
  outputColor = color / 9.0;
}
`;

export type RadialBlurEffectOptions = {
  /** Peak radial smear in screen-space UV (fraction of the viewport). */
  offset?: number;
};

export class RadialBlurEffect extends Effect {
  private offsetUniform: Uniform<number>;

  constructor({ offset = 0 }: RadialBlurEffectOptions) {
    const offsetUniform = new Uniform(offset);
    super("RadialBlurEffect", FRAGMENT_SHADER, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([["uOffset", offsetUniform]]),
    });
    this.offsetUniform = offsetUniform;
  }

  /** Radial smear in screen-space UV (fraction of the viewport). */
  get offset(): number {
    return this.offsetUniform.value;
  }

  set offset(value: number) {
    this.offsetUniform.value = value;
  }
}

/**
 * Maps a single velocity value to a 0..1 strength with a smoothstep ramp:
 * crisp below `threshold`, fully smeared at `max`. Pure so it can be
 * unit-tested without a scene.
 */
const smoothstepRamp = (
  value: number,
  threshold: number,
  max: number
): number => {
  if (max <= threshold) {
    return 0;
  }
  const x = MathUtils.clamp((value - threshold) / (max - threshold), 0, 1);
  return MathUtils.smoothstep(x, 0, 1);
};

/**
 * Maps the camera's per-frame linear speed (world units/s) and angular
 * velocity (radians/s) to a 0..1 radial-blur strength: the larger of the two
 * independent smoothstep ramps, so the smear responds to a pan *or* a turn (or
 * both). Pure so it can be unit-tested without a scene.
 */
export const computeRadialBlurStrength = (
  linearUnitsPerSec: number,
  angularRadPerSec: number
): number =>
  Math.max(
    smoothstepRamp(
      linearUnitsPerSec,
      RADIAL_BLUR_LINEAR_THRESHOLD_UNITS_S,
      RADIAL_BLUR_LINEAR_MAX_UNITS_S
    ),
    smoothstepRamp(
      angularRadPerSec,
      RADIAL_BLUR_ANGULAR_THRESHOLD_RAD_S,
      RADIAL_BLUR_ANGULAR_MAX_RAD_S
    )
  );
