import { useFrame } from "@react-three/fiber";
import { FrameStats } from "../types/frameStats";
import { METRICS_WINDOW_SECONDS } from "../constants/metrics";

/**
 * Collects per-frame renderer stats into a plain mutable ref so the DOM
 * overlay can read them without triggering React re-reads. While the scene is
 * actually rendering (`readyRef`), the models have settled, and the run is
 * valid, it also accumulates averages over a fixed METRICS_WINDOW_SECONDS
 * window for baseline metrics.
 */
export const StressStatsCollector = ({
  statsRef,
  readyRef,
  runValidRef,
}: {
  statsRef: { current: FrameStats };
  readyRef: { current: boolean };
  runValidRef: { current: boolean };
}) => {
  useFrame((state, delta) => {
    const s = statsRef.current;
    s.frameMs = delta * 1000;
    s.frameCount += 1;
    s.frameTime += delta;
    if (s.frameTime >= 0.25) {
      s.fps = s.frameCount / s.frameTime;
      s.frameCount = 0;
      s.frameTime = 0;
    }
    s.drawCalls = state.gl.info.render.calls;
    s.triangles = state.gl.info.render.triangles;
    s.programs = state.gl.info.programs?.length ?? 0;

    // The average window opens only once the models have settled (the scene is
    // mounted) and the run is valid; a run on placeholder fallbacks is not a
    // valid baseline, and a run whose models are still loading is not a
    // settled workload, so neither is measured.
    if (
      statsRef.current.modelsSettled &&
      runValidRef.current &&
      readyRef.current &&
      !s.windowDone
    ) {
      s.windowFrames += 1;
      s.windowTime += delta;
      s.windowCallSum += s.drawCalls;
      s.windowTriSum += s.triangles;
      s.windowProgSum += s.programs;
      s.windowElapsed = s.windowTime;
      if (s.windowTime >= METRICS_WINDOW_SECONDS) {
        s.windowDone = true;
      }
      if (s.windowFrames > 0 && s.windowTime > 0) {
        s.windowFps = s.windowFrames / s.windowTime;
        s.windowFrameMs = (s.windowTime / s.windowFrames) * 1000;
        s.windowDrawCalls = s.windowCallSum / s.windowFrames;
        s.windowTriangles = s.windowTriSum / s.windowFrames;
        s.windowPrograms = s.windowProgSum / s.windowFrames;
      }
    }
  });
  return null;
};
