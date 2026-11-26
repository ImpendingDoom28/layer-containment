export type FrameStats = {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  /** Rolling counters used to average FPS every ~0.25s. */
  frameCount: number;
  frameTime: number;
  /** Windowed averages, measured from when the scene became ready. */
  windowFps: number;
  windowFrameMs: number;
  windowDrawCalls: number;
  windowTriangles: number;
  windowPrograms: number;
  windowElapsed: number;
  /** Frames accumulated since the window opened. */
  windowFrames: number;
  windowTime: number;
  windowCallSum: number;
  windowTriSum: number;
  windowProgSum: number;
  /** True once the 30s window has elapsed; freezes the averages until restart. */
  windowDone: boolean;
  /**
   * True once every required 3D model has *settled* (loaded or failed) after
   * the shared load promise resolved. Until then the run is still "loading"
   * and must not be reported as valid or measured.
   */
  modelsSettled: boolean;
  /**
   * True only when every model settled to a loaded parse (the 15s cap on the
   * shared promise absorbs failures, so it is checked separately). A run that
   * settles on primitive fallbacks is not a valid baseline and its average
   * window is skipped. Both are exposed on the overlay for the tests.
   */
  runValid: boolean;
};
