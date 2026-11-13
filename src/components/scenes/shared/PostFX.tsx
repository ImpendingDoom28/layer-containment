import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useFrame, useThree } from "@react-three/fiber";
import { FC, useMemo, useRef } from "react";

import { MathUtils, Quaternion } from "three";

import {
  bloomEnabledSelector,
  motionBlurEnabledSelector,
  useSettingsStore,
} from "../../../core/stores/useSettingsStore";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";
import { isSoftwareRenderer } from "../../../core/utils/isSoftwareRenderer";
import {
  RADIAL_BLUR_ATTACK_LAMBDA,
  RADIAL_BLUR_MAX_OFFSET_UV,
  RADIAL_BLUR_RELEASE_LAMBDA,
  RADIAL_BLUR_STRENGTH_EPSILON,
  RADIAL_BLUR_VELOCITY_MAX_RAD_S,
  RADIAL_BLUR_VELOCITY_THRESHOLD_RAD_S,
} from "../../../constants/radialBlur";
import {
  computeRadialBlurStrength,
  RadialBlurEffect,
} from "./RadialBlurEffect";

/**
 * Post-process chain for the 3D scenes: a Bloom pass (mipmap blur) that makes
 * every emissive element glow, plus a light radial blur that smears the view
 * while the player moves the camera.
 *
 * Bloom's threshold keeps only hot emissives (luminance above ~0.7 in linear
 * space); the rest of the scene renders untouched, and bloom runs at half
 * resolution to stay cheap.
 *
 * The radial blur is a view-side physical cue: it tracks the camera's angular
 * velocity and smears the frame along rays from the screen center, growing
 * with turn speed and easing back off as the camera settles, so the camera
 * reads as having momentum instead of teleporting. It is off under
 * `prefers-reduced-motion` or the "Motion blur (camera)" quality setting (the
 * strength is cleared to 0) and, like bloom, is auto-skipped on software (CPU)
 * WebGL renderers where a fullscreen pass would starve the main thread.
 *
 * When it doesn't render (software renderer) R3F falls back to the plain scene
 * render at zero cost.
 */
export const PostFX: FC = () => {
  const bloomEnabled = useSettingsStore(bloomEnabledSelector);
  const motionBlurEnabled = useSettingsStore(motionBlurEnabledSelector);
  const reducedMotion = useReducedMotion();
  const { camera } = useThree();

  // One-shot probe (memoised): the rasterizer never changes at runtime.
  const softwareRenderer = useMemo(() => isSoftwareRenderer(), []);

  const radialBlurEffect = useMemo(
    () => new RadialBlurEffect({ offset: 0 }),
    []
  );
  const prevQuaternion = useRef(new Quaternion());
  const hasPrevCamera = useRef(false);
  const blurStrength = useRef(0);

  // Runs before the composer (default priority 0 < the composer's 1), so the
  // strength is fresh for this frame's render. The camera is read in *view*
  // time (real delta), not the paused simulation clock: a yank is a physical
  // camera move, so the blur follows it even if the game world is frozen.
  useFrame((_, delta) => {
    const effect = radialBlurEffect;
    if (softwareRenderer) {
      effect.offset = 0;
      return;
    }

    // Angular velocity (radians/s) from the camera's orientation change — the
    // rotational "yank" the radial blur is meant to depict.
    const angle = hasPrevCamera.current
      ? prevQuaternion.current.angleTo(camera.quaternion)
      : 0;
    const angularVelocity = delta > 0 ? angle / delta : 0;

    // Reduced motion or the quality setting off: no smear at all, regardless
    // of how fast the camera moves. Clear the stored strength immediately
    // (release damping would otherwise keep the offset positive for a few
    // frames after the preference flips), but keep sampling the camera so
    // re-enabling motion does not spike on a stale orientation.
    if (reducedMotion || !motionBlurEnabled) {
      blurStrength.current = 0;
      effect.offset = 0;
      prevQuaternion.current.copy(camera.quaternion);
      hasPrevCamera.current = true;
      return;
    }

    const target = computeRadialBlurStrength(
      angularVelocity,
      RADIAL_BLUR_VELOCITY_THRESHOLD_RAD_S,
      RADIAL_BLUR_VELOCITY_MAX_RAD_S
    );

    // Ease in quickly on a yank, ease out a touch slower so the smear lingers
    // ~1–2 frames before the view snaps crisp.
    const lambda =
      target > blurStrength.current
        ? RADIAL_BLUR_ATTACK_LAMBDA
        : RADIAL_BLUR_RELEASE_LAMBDA;
    const next = MathUtils.damp(blurStrength.current, target, lambda, delta);
    blurStrength.current = next;

    // Keep the damped strength accumulating while it builds — a per-frame
    // epsilon reset would zero it at high frame rates before it ever ramps up.
    // The epsilon only suppresses the *rendered* offset: below it the smear is
    // invisible, and the shader early-outs at offset 0 so no ring is sampled.
    effect.offset =
      next > RADIAL_BLUR_STRENGTH_EPSILON
        ? next * RADIAL_BLUR_MAX_OFFSET_UV
        : 0;

    prevQuaternion.current.copy(camera.quaternion);
    hasPrevCamera.current = true;
  });

  if (softwareRenderer) return null;

  return (
    <EffectComposer multisampling={4}>
      {bloomEnabled ? (
        <Bloom
          luminanceThreshold={0.7}
          luminanceSmoothing={0.25}
          mipmapBlur
          radius={0.65}
          intensity={0.9}
          resolutionScale={0.5}
        />
      ) : null}
      <primitive object={radialBlurEffect} />
    </EffectComposer>
  );
};
