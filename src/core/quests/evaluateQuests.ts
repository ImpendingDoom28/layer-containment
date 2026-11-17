import type { EnemyType } from "../types/game";
import type {
  QuestConfig,
  QuestCounters,
  QuestProgress,
} from "../types/quests";

/**
 * The counters a quest accumulates toward a target (as opposed to `leaks`, a
 * cap, and `victory`, a flag). `killsByType` is a single type's count; the
 * spec carries at most one counter per quest.
 */
type QuestAccumulatorKey =
  | "wavesStarted"
  | "towersPlaced"
  | "towersSold"
  | "kills"
  | "totalGoldEarned"
  | "killsByType";

const ACCUMULATOR_KEYS: readonly QuestAccumulatorKey[] = [
  "wavesStarted",
  "towersPlaced",
  "towersSold",
  "kills",
  "totalGoldEarned",
  "killsByType",
];

export const getQuestProgress = (
  quest: QuestConfig,
  counters: QuestCounters
): QuestProgress => {
  const spec = quest.counters;

  if (spec.victory === true) {
    return {
      current: counters.victory ? 1 : 0,
      target: 1,
      complete: counters.victory,
    };
  }

  if (spec.leaks !== undefined) {
    const maxLeaks = spec.leaks;
    // A cap counter: current is what is left before the quest is failed, so
    // the display empties toward the cap and the quest stays complete while
    // the cap holds.
    const current = Math.max(0, maxLeaks - counters.leaks);
    return { current, target: maxLeaks, complete: counters.leaks <= maxLeaks };
  }

  const key = ACCUMULATOR_KEYS.find((candidate) => spec[candidate] !== undefined);
  if (!key) {
    return { current: 0, target: 0, complete: false };
  }

  if (key === "killsByType") {
    const [type, target] = Object.entries(
      spec.killsByType as Record<EnemyType, number>
    )[0] as [EnemyType, number];
    const current = Math.min(target, counters.killsByType[type] ?? 0);
    return { current, target, complete: current >= target };
  }

  const target = spec[key] as number;
  const current = Math.min(target, counters[key]);
  return { current, target, complete: current >= target };
};

export const getQuestsProgress = (
  quests: QuestConfig[],
  counters: QuestCounters
): Map<string, QuestProgress> => {
  return new Map(quests.map((quest) => [quest.id, getQuestProgress(quest, counters)]));
};
