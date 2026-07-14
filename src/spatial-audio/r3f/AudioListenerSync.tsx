import { useFrame, useThree } from "@react-three/fiber";
import { memo } from "react";
import { Vector3 } from "three";

import { getAudioContext } from "../context/audioContextRegistry";
import { syncAudioListener } from "../core/listenerSync";

/** Scratch vector for camera look direction (reused each frame to avoid GC). */
const forward = new Vector3();
/** Scratch vector for camera up axis (reused each frame to avoid GC). */
const up = new Vector3();

/**
 * R3F component that keeps the Web Audio listener aligned with the active camera.
 *
 * Each frame: reads camera position / orientation, then calls {@link syncAudioListener}
 * on the context from {@link getAudioContext}. Renders nothing.
 *
 * Mount inside a Canvas that already runs {@link useSpatialAudioEngine} (or otherwise
 * registers the context) so spatial panners hear from the camera’s point of view.
 */
export const AudioListenerSync = memo(() => {
  const { camera } = useThree();

  useFrame(() => {
    const audioContext = getAudioContext();
    if (!audioContext) {
      return;
    }

    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);

    syncAudioListener(audioContext, {
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      forward: {
        x: forward.x,
        y: forward.y,
        z: forward.z,
      },
      up: {
        x: up.x,
        y: up.y,
        z: up.z,
      },
    });
  });

  return null;
});

AudioListenerSync.displayName = "AudioListenerSync";
