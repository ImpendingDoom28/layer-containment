const env = (import.meta as any).env;

export const GAME_NAME_ID = env.VITE_GAME_NAME_ID;
export const GAME_NAME = env.VITE_GAME_NAME;

const rawRepoUrl = env.VITE_REPOSITORY_URL;
export const REPOSITORY_URL =
  typeof rawRepoUrl === "string" ? rawRepoUrl.trim() : "";

/**
 * Cadence of the background game-loop worker (ms) — the fixed target
 * frame rate of the simulation. A frame must never integrate more than
 * one tick of simulation time, so this is also the upper bound for
 * frame deltas (see `clampFrameDelta` in `utils/gameDelta`).
 */
export const BACKGROUND_TICK_INTERVAL_MS = 50;
