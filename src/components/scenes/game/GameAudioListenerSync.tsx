import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

import { getGameAudioContext } from "../../../core/audio/gameAudioContext";

const forward = new Vector3();
const up = new Vector3();

export const GameAudioListenerSync = () => {
  const { camera } = useThree();

  useFrame(() => {
    const audioContext = getGameAudioContext();
    if (!audioContext) {
      return;
    }

    const listener = audioContext.listener;

    listener.positionX.value = camera.position.x;
    listener.positionY.value = camera.position.y;
    listener.positionZ.value = camera.position.z;

    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);

    listener.forwardX.value = forward.x;
    listener.forwardY.value = forward.y;
    listener.forwardZ.value = forward.z;

    listener.upX.value = up.x;
    listener.upY.value = up.y;
    listener.upZ.value = up.z;
  });

  return null;
};
