/**
 * Simulation fast-forward factor for the e2e suite.
 *
 * `window.__SIM_SPEED__` is set by Playwright (an init script that runs before
 * the app boots, on every navigation). When it is ≥ 2 the game session runs the
 * simulation that many times faster than wall time (see
 * `GameSessionSystem`), so simulation-time-bound tests — a wave has to be
 * traversed by the enemies before it can clear — finish in a fraction of a
 * second instead of tens of seconds on the GPU-less CI runner (SwiftShader).
 *
 * Defaults to 1 (real time) in the production build, so the flag only ever
 * affects tests. Mirrors `isDebugFlag` (read once at boot, from a global the
 * harness injects rather than from the URL) so it works identically on the dev
 * server and the production build the e2e suite runs against.
 */
export const SIM_SPEED: number = (() => {
  if (typeof window === "undefined") return 1;
  const raw = (window as { __SIM_SPEED__?: number | string }).__SIM_SPEED__;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value >= 1 ? value : 1;
})();
