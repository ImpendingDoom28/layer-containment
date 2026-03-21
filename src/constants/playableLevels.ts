export const PLAYABLE_LEVEL_IDS = ["level_1"] as const;

export type PlayableLevelId = (typeof PLAYABLE_LEVEL_IDS)[number];
