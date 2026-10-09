export const GAME_CAMERA_BLOCK_SELECTOR = "[data-game-camera-block]";

export const isPointerOverGameCameraBlock = (
  clientX: number,
  clientY: number
): boolean => {
  const el = document.elementFromPoint(clientX, clientY);
  return (
    el instanceof Element && el.closest(GAME_CAMERA_BLOCK_SELECTOR) !== null
  );
};
