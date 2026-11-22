import { useFrame, useThree } from "@react-three/fiber";

/**
 * Pins the camera at the far end of the map for the whole run by re-setting
 * its position and aim every frame. The vantage (0, 40, 80) sits past the
 * board's +z end, looks back at the center, and is far enough (~89 units)
 * that the entire 64x64 board fits on screen at the 40-degree fov — the whole
 * map renders in one frame (maximum stressing) — while staying well inside
 * the skybox (radius 100). The camera is also locked (`shouldStopCamera`),
 * so GameCamera's movement frame never clamps it back inside the field.
 */
const STRESS_CAMERA_POSITION: [number, number, number] = [0, 40, 80];

/**
 * Holds the camera at the map's far end so the whole 64x64
 * board renders in one frame. The camera is locked
 * (shouldStopCamera) so GameCamera's movement frame never
 * clamps it back inside the field — the rig owns the view. */
export const StressCameraRig = () => {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.set(...STRESS_CAMERA_POSITION);
    camera.lookAt(0, 0, 0);
  });
  return null;
};
