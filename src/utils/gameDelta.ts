import { BACKGROUND_TICK_INTERVAL_MS } from "../constants/game";

/**
 * Upper bound (seconds) for a single frame's delta while "pause when tab is
 * hidden" is on. The background ticker advances the game at a fixed cadence
 * (`BACKGROUND_TICK_INTERVAL_MS`), and the browser suspends
 * requestAnimationFrame while the tab is hidden, so the first visible frame
 * after resuming reports a delta spanning the entire hidden duration. The
 * pause clock already excludes that time from effective simulation time
 * (slow, beam and regeneration expiries), but raw delta is what drives
 * movement and projectile integration — capping it to one ticker tick keeps
 * the frame consistent with the paused clock instead of lunging everything
 * forward across the hidden gap. When the setting is off, the background
 * worker keeps the simulation running in real time, so large
 * (throttled-worker) deltas are legitimate and must not be capped.
 *
 * One ticker tick in seconds: MAX_FRAME_DELTA = 1 / (1000 / BACKGROUND_TICK_INTERVAL_MS).
 */
export const MAX_FRAME_DELTA = 1 / (1000 / BACKGROUND_TICK_INTERVAL_MS);

export const clampFrameDelta = (
  delta: number,
  pauseWhenTabHidden: boolean
): number => (pauseWhenTabHidden ? Math.min(delta, MAX_FRAME_DELTA) : delta);
