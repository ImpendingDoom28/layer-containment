import { describe, expect, it } from "vitest";

import type { LevelConfigData } from "../core/configs/levelConfig";
import { collectBosses, type BossLevelRef } from "./bossDirectory";

const boss = (name: string) => ({
  name,
  everyNthWave: 4,
  baseStats: {
    health: 1000,
    speed: 0.6,
    size: 1.4,
    healthLoss: 5,
    reward: 250,
  },
  hpGrowthPerAppearance: 1.5,
});

const level = (
  id: BossLevelRef["id"],
  label: string,
  b: ReturnType<typeof boss> | undefined
): BossLevelRef => ({
  id,
  data: { label, name: "Internal", boss: b } as unknown as LevelConfigData,
});

describe("collectBosses", () => {
  it("keeps only levels that define a boss, in order", () => {
    const entries = collectBosses([
      level("level_1", "Sector 1", boss("Colossus")),
      level("level_2", "", undefined),
      level("level_3", "Sector 3", boss("The Coil Sentinel")),
    ]);
    expect(entries.map((e) => e.boss.name)).toEqual([
      "Colossus",
      "The Coil Sentinel",
    ]);
    expect(entries.map((e) => e.levelId)).toEqual(["level_1", "level_3"]);
  });

  it("uses the label as the level label", () => {
    const [entry] = collectBosses([level("level_1", "Sector 1", boss("X"))]);
    expect(entry.levelLabel).toBe("Sector 1");
  });

  it("falls back to the raw id when no label or name", () => {
    const [entry] = collectBosses([level("level_1", "", boss("X"))]);
    expect(entry.levelLabel).toBe("Internal");
  });

  it("returns an empty list when no level has a boss", () => {
    expect(
      collectBosses([
        level("level_1", "Sector 1", undefined),
        level("level_2", "Sector 2", undefined),
      ])
    ).toEqual([]);
  });
});
