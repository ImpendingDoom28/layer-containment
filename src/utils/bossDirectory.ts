import type { BossConfig } from "../core/types/game";
import type {
  LevelConfigData,
  LevelConfigFiles,
} from "../core/configs/levelConfig";

export type BossLevelRef = {
  id: LevelConfigFiles;
  data: LevelConfigData;
};

export type BossDirectoryEntry = {
  levelId: LevelConfigFiles;
  levelLabel: string;
  boss: BossConfig;
};

/**
 * Collects the bosses defined across a set of loaded levels, in the order the
 * levels were given. Levels without a boss are skipped. The label falls back
 * the same way the level picker does (label, then name, then the raw id).
 */
export const collectBosses = (levels: BossLevelRef[]): BossDirectoryEntry[] =>
  levels
    .filter(({ data }) => data.boss)
    .map(({ id, data }) => ({
      levelId: id,
      levelLabel: data.label.trim() || data.name.trim() || id,
      boss: data.boss!,
    }));
