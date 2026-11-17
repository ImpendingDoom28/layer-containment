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

const fail = (progress: Omit<QuestProgress, "failed">): QuestProgress => ({
  ...progress,
  failed: true,
});

export const getQuestProgress = (
  quest: QuestConfig,
  counters: QuestCounters
): QuestProgress => {
  const spec = quest.counters;

  if (spec.victory === true) {
    if (counters.victory) {
      return { current: 1, target: 1, complete: true, failed: false };
    }
    return counters.runOver
      ? fail({ current: 0, target: 1, complete: false })
      : { current: 0, target: 1, complete: false, failed: false };
  }

  if (spec.leaks !== undefined) {
    const maxLeaks = spec.leaks;
    // A cap counter: current is what is left before the quest is failed, so
    // the display empties toward the cap.
    const current = Math.max(0, maxLeaks - counters.leaks);
    if (counters.leaks > maxLeaks) {
      return fail({ current, target: maxLeaks, complete: false });
    }
    return {
      current,
      target: maxLeaks,
      complete: true,
      failed: false,
    };
  }

  const key = ACCUMULATOR_KEYS.find((candidate) => spec[candidate] !== undefined);
  if (!key) {
    return { current: 0, target: 0, complete: false, failed: false };
  }

  if (key === "killsByType") {
    const byType = spec.killsByType;
    const entry = byType
      ? (Object.entries(byType)[0] as [EnemyType, number] | undefined)
      : undefined;
    if (!entry) {
      return { current: 0, target: 0, complete: false, failed: false };
    }
    const [type, target] = entry;
    const current = Math.min(target, counters.killsByType[type] ?? 0);
    const complete = current >= target;
    const progress = { current, target, complete };
    return counters.runOver && !complete
      ? fail(progress)
      : { ...progress, failed: false };
  }

  const target = spec[key] as number;
  const current = Math.min(target, counters[key]);
  const complete = current >= target;
  const progress = { current, target, complete };
  return counters.runOver && !complete
    ? fail(progress)
    : { ...progress, failed: false };
};

export const getQuestsProgress = (
  quests: QuestConfig[],
  counters: QuestCounters
): Map<string, QuestProgress> => {
  return new Map(quests.map((quest) => [quest.id, getQuestProgress(quest, counters)]));
};
