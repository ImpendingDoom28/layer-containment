export type CanvasPoint = {
  x: number;
  y: number;
};

// These points are calibrated for the fixed 1280x720 Playwright viewport and
// the default level (level_1). They sit on open land near the top-left of the
// field (the level_1 path runs through the centre and the water is on the
// right, so the earlier centre/right-side points landed on non-buildable
// tiles). Tests try them in order until a tower is successfully placed.
export const gamePlacementPoints: CanvasPoint[] = [
  { x: 400, y: 150 },
  { x: 480, y: 150 },
  { x: 560, y: 150 },
  { x: 480, y: 240 },
  { x: 560, y: 240 },
];
