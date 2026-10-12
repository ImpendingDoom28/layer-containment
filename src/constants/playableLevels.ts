export const PLAYABLE_LEVEL_IDS = ["level_1"] as const;

export type PlayableLevelId = (typeof PLAYABLE_LEVEL_IDS)[number];

/**
 * Level ids accepted by the game scene / level loader.
 *
 * Includes the performance stress-test level, which is only wired up through
 * the dedicated `index.stress.html` entry (see `vite.stress.config.ts`) and is
 * never reachable from the main menu in the default build.
 */
export type AnyPlayableLevelId = PlayableLevelId | "stress";
