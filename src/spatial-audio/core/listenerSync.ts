import type { ListenerOrientation } from "../types";

/**
 * Copies a listener pose into the Web Audio {@link AudioListener}
 * (`position*`, `forward*`, `up*` AudioParams).
 *
 * Framework-agnostic: pass camera-derived vectors from R3F, Three.js, or custom code.
 *
 * @param audioContext - Context whose listener should be updated.
 * @param orientation - World position plus forward / up axes.
 */
export const syncAudioListener = (
  audioContext: AudioContext,
  orientation: ListenerOrientation
) => {
  const listener = audioContext.listener;
  const { position, forward, up } = orientation;

  listener.positionX.value = position.x;
  listener.positionY.value = position.y;
  listener.positionZ.value = position.z;

  listener.forwardX.value = forward.x;
  listener.forwardY.value = forward.y;
  listener.forwardZ.value = forward.z;

  listener.upX.value = up.x;
  listener.upY.value = up.y;
  listener.upZ.value = up.z;
};
