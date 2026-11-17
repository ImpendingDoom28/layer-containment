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

/**
 * A quest that holds a condition instead of reaching one (a leak cap today).
 * `held` is true while the condition holds; `broken` is true once it
 * definitively does not hold — that is terminal, the condition can never be
 * re-met, so the quest fails immediately regardless of `deferred`.
 */
const holdQuest = (
  quest: QuestConfig,
  counters: QuestCounters
): {
  held: boolean;
  broken: boolean;
  progress: Omit<QuestProgress, "failed">;
} => {
  const maxLeaks = quest.counters.leaks ?? 0;
  const current = Math.max(0, maxLeaks - counters.leaks);
  return {
    held: counters.leaks <= maxLeaks,
    broken: counters.leaks > maxLeaks,
    progress: { current, target: maxLeaks, complete: false },
  };
};

export const getQuestProgress = (
  quest: QuestConfig,
  counters: QuestCounters
): QuestProgress => {
  const spec = quest.counters;

  if (spec.victory === true) {
    // The victory quest's objective *is* the win, so it is never deferred:
    // it completes as soon as the run is won, not only at the end.
    if (counters.victory) {
      return { current: 1, target: 1, complete: true, failed: false };
    }
    return counters.runOver
      ? fail({ current: 0, target: 1, complete: false })
      : { current: 0, target: 1, complete: false, failed: false };
  }

  if (spec.leaks !== undefined) {
    const { held, broken, progress } = holdQuest(quest, counters);
    // A broken cap is terminal: the quest fails the moment it is exceeded,
    // whether or not it is deferred.
    if (broken) {
      return fail(progress);
    }
    // A deferred cap ("hold the line") is settled only at the end of the run:
    // it stays open while the run goes on and completes only if the run is
    // won with the cap holding.
    if (quest.deferred) {
      if (counters.victory) return { ...progress, complete: held, failed: false };
      return counters.runOver
        ? fail(progress)
        : { ...progress, complete: false, failed: false };
    }
    return { ...progress, complete: held, failed: false };
  }

  const key = ACCUMULATOR_KEYS.find((candidate) => spec[candidate] !== undefined);
  if (!key) {
    return { current: 0, target: 0, complete: false, failed: false };
  }

  let current: number;
  let target: number;
  if (key === "killsByType") {
    const byType = spec.killsByType;
    const entry = byType
      ? (Object.entries(byType)[0] as [EnemyType, number] | undefined)
      : undefined;
    if (!entry) {
      return { current: 0, target: 0, complete: false, failed: false };
    }
    const [type, t] = entry;
    current = Math.min(t, counters.killsByType[type] ?? 0);
    target = t;
  } else {
    target = spec[key] as number;
    current = Math.min(target, counters[key]);
  }
  const complete = current >= target;
  const progress = { current, target, complete };

  // A deferred accumulator is achieved only at the end of the run: it
  // completes only if the run is won with the target reached, fails on a
  // loss, and stays open while the run goes on — even when already achieved
  // mid-run (so `complete` is never true before the settlement).
  if (quest.deferred) {
    if (counters.victory) return { ...progress, failed: false };
    const open: Omit<QuestProgress, "failed"> = { current, target, complete: false };
    return counters.runOver ? fail(open) : { ...open, failed: false };
  }

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
