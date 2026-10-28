import { FC } from "react";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";

// The testing board is a flat 20×20 grid sitting at the planet's north pole
// (world origin, y ≈ 0). This camera frames the whole board from above and to
// the side, with OrbitControls so it can be orbited and zoomed to inspect any
// asset.
const CAMERA_POSITION: [number, number, number] = [0, 20, 24];
const CAMERA_TARGET: [number, number, number] = [0, 0, 0];
const CAMERA_FOV = 50;

export const TestingLevelCamera: FC = () => {
  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={CAMERA_POSITION}
        fov={CAMERA_FOV}
      />
      <OrbitControls
        makeDefault
        target={CAMERA_TARGET}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={6}
        maxDistance={70}
        enableDamping
        dampingFactor={0.12}
      />
    </>
  );
};
