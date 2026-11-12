import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { MathUtils, Uniform } from "three";

/**
 * A cheap radial blur for the post-process chain: the previous frame's
 * framebuffer is re-sampled along rays from the screen center and averaged,
 * the strength (`uOffset`) scaling the ray length. At `uOffset` 0 every sample
 * collapses onto the center, so the effect is a no-op — which is also how it is
 * gated (see `PostFX`).
 *
 * It is a plain `postprocessing` `Effect` (not a convolution pass): it reads the
 * `inputBuffer` directly and averages a fixed ring of samples per pixel, so it
 * costs a handful of extra texture fetches only when the camera is actually
 * moving fast, and nothing at rest.
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
  vec4 color = inputColor;
  for (int i = 0; i < 9; i++) {
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
      attributes: EffectAttribute.NONE,
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
 * Maps a camera angular velocity (radians/s) to a 0..1 radial-blur strength
 * with a smoothstep ramp: crisp below `thresholdRadPerSec`, fully smeared at
 * `maxRadPerSec`. Pure so it can be unit-tested without a scene.
 */
export const computeRadialBlurStrength = (
  velocityRadPerSec: number,
  thresholdRadPerSec: number,
  maxRadPerSec: number
): number => {
  if (maxRadPerSec <= thresholdRadPerSec) {
    return 0;
  }
  const x = MathUtils.clamp(
    (velocityRadPerSec - thresholdRadPerSec) /
      (maxRadPerSec - thresholdRadPerSec),
    0,
    1
  );
  return MathUtils.smoothstep(x, 0, 1);
};
