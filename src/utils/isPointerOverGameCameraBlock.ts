export const GAME_CAMERA_BLOCK_SELECTOR = "[data-game-camera-block]";

type ElementFromPointDoc = Pick<Document, "elementFromPoint">;

export const isPointerOverGameCameraBlock = (
  clientX: number,
  clientY: number,
  doc: ElementFromPointDoc
): boolean => {
  const el = doc.elementFromPoint(clientX, clientY);
  return (
    el instanceof Element &&
    el.closest(GAME_CAMERA_BLOCK_SELECTOR) !== null
  );
};
