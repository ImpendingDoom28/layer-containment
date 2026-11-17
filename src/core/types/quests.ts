import type { EnemyType } from "./game";

/**
 * One live counter a quest can be built from. Quests are defined declaratively
 * (in the level JSON) as a mapping from these counter names to a target, so a
 * new quest kind only needs a new counter here and a schema field — no code
 * changes in the store, the evaluator, or the UI.
 *
 * - `leaks`: cap, not a target — the quest is not complete while the number
 *   of enemies that reached the base has not exceeded it, and fails once it
 *   does (the counter counts leaks; the target is the maximum allowed).
 * - `victory`: boolean flag — completes when the run is won, fails when the
 *   run is lost.
 * - `runOver`: the run ended in a loss (`GAME_OVER`). Any quest that is not
 *   complete at that point is failed — the run is over, so the objective can
 *   never be met. A won run leaves uncompleted quests uncompleted, not failed.
 * - everything else: accumulators — complete once the counter reaches the
 *   target (over-achievement counts as the target, so one counter's surplus
 *   cannot pad another's deficit).
 *
 * A quest flagged `deferred` is settled only at the end of the run: it stays
 * open (incomplete, not failed) while the run goes on — even when its
 * condition already holds — and completes only if the run is won with the
 * condition holding at the end. This is the "hold the line" shape: "let no
 * more than N enemies through" cannot be known as achieved until the run is
 * over. A deferred quest still fails early when its condition is definitively
 * broken (a leak cap exceeded); otherwise the verdict comes at the end.
 */
export type QuestCounters = {
  leaks: number;
  victory: boolean;
  runOver: boolean;
  wavesStarted: number;
  towersPlaced: number;
  towersSold: number;
  kills: number;
  killsByType: Partial<Record<EnemyType, number>>;
  totalGoldEarned: number;
};

export type QuestCountersSpec = {
  leaks?: number;
  victory?: boolean;
  wavesStarted?: number;
  towersPlaced?: number;
  towersSold?: number;
  kills?: number;
  killsByType?: Partial<Record<EnemyType, number>>;
  totalGoldEarned?: number;
};

/**
 * A declarative quest for a level. `labelKey` is an i18n key (interpolated
 * with `labelParams`) so labels stay translatable and reusable across levels;
 * `counters` combines any of the live counters into one objective (e.g.
 * "defeat 5 tanks" is `killsByType.tank: 5`, "defeat 30 enemies" is
 * `kills: 30`). `additional` marks a side quest — shown below the main
 * objectives and visually de-emphasised in the HUD.
 */
export type QuestConfig = {
  id: string;
  /** True for a side (bonus) quest; false/absent for a main objective. */
  additional?: boolean;
  labelKey: string;
  labelParams?: Record<string, string | number>;
  counters: QuestCountersSpec;
  /**
   * True for a quest settled only at the end of the run (e.g. a leak cap —
   * "let no more than N enemies through" is only achieved once the run is won
   * with the cap holding). Stays open while the run goes on; completes only
   * on a win with the condition holding, fails when the condition is broken
   * or the run is lost.
   */
  deferred?: boolean;
};

/** Progress of one quest against the level's live counters. */
export type QuestProgress = {
  current: number;
  target: number;
  complete: boolean;
  /**
   * True once the objective can no longer be met: a `leaks` cap exceeded, or
   * the run lost (`runOver`) with the quest still incomplete. Mutually
   * exclusive with `complete`.
   */
  failed: boolean;
};
