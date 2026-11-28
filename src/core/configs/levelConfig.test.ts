import { describe, expect, it } from "vitest";

import {
  parseLevelConfigData,
  waterBodyConfigSchema,
  waterBodySchema,
} from "./levelConfig";

const makeLevel = (
  enemies: Array<Record<string, unknown>>
): Record<string, unknown> => ({
  name: "Test",
  label: "Test Sector",
  description: "A test sector.",
  startingHealth: 20,
  startingMoney: 100,
  gridSize: 5,
  pathWaypoints: [[{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }]],
  waveConfigs: [],
  buildings: [],
  towers: [],
  enemies,
  projectiles: [],
  quests: [],
  enemyWeights: null,
});

const splitterEnemy = (split?: Record<string, unknown>) => ({
  id: 1,
  type: "splitter",
  name: "Splitter",
  health: 90,
  speed: 1.5,
  reward: 18,
  color: "#06b6d4",
  size: 0.45,
  healthLoss: 2,
  maxHealth: 90,
  pathProgress: 0,
  pathIndex: 0,
  x: 0,
  z: 4,
  upgrades: [],
  ...(split ? { split } : {}),
});

describe("levelConfigSchema", () => {
  it("retains the split config of a pre-spawned splitter enemy", () => {
    const result = parseLevelConfigData(
      makeLevel([splitterEnemy({ minChildren: 2, maxChildren: 4 })])
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.enemies[0].split).toEqual({
      minChildren: 2,
      maxChildren: 4,
    });
  });

  it("parses enemies without a split config as split-undefined", () => {
    const result = parseLevelConfigData(
      makeLevel([
        { ...splitterEnemy(), type: "basic", name: "Troop" },
      ])
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.enemies[0].split).toBeUndefined();
  });

  it("accepts a level whose enemyWeights include a splitter weight", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      enemyWeights: { basic: 10, splitter: 2 },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.enemyWeights).toEqual({ basic: 10, splitter: 2 });
  });

  const makeBoss = (pathSwap: unknown) => ({
    name: "Test Boss",
    baseStats: {
      health: 100,
      speed: 1,
      size: 1,
      healthLoss: 1,
      reward: 10,
    },
    pathSwap,
  });

  it("accepts a boss path-swap threshold below the path-end boundary", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      boss: makeBoss([{ atProgress: 0.3, targetPathIndex: 1 }]),
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.boss?.pathSwap).toEqual([
      { atProgress: 0.3, targetPathIndex: 1 },
    ]);
  });

  it("rejects a boss path-swap threshold the movement cannot reach (>= 0.99)", () => {
    for (const atProgress of [0.99, 1]) {
      const result = parseLevelConfigData({
        ...makeLevel([]),
        boss: makeBoss([{ atProgress, targetPathIndex: 1 }]),
      });
      expect(result.success).toBe(false);
    }
  });

  describe("boss model", () => {
    const makeModelBoss = (model: unknown) => ({
      name: "The Ferryman",
      baseStats: {
        health: 100,
        speed: 1,
        size: 1.5,
        healthLoss: 3,
        reward: 100,
      },
      model,
    });

    it("parses a boss model with a state → clip animation map", () => {
      const result = parseLevelConfigData({
        ...makeLevel([]),
        boss: makeModelBoss({
          url: "assets/models/boss_level_2.glb?v=2",
          node: "LC_OMEGA7",
          animations: {
            idle: { clip: "IDLE" },
            walk: { clip: "WALK" },
            "teleport-out": { clip: "TELEPORT_OUT", loop: "once" },
            "teleport-in": { clip: "TELEPORT_IN", loop: "once" },
            slam: { clip: "SLAM", loop: "once", speed: 1.5 },
          },
        }),
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.boss?.model).toEqual({
        url: "assets/models/boss_level_2.glb?v=2",
        node: "LC_OMEGA7",
        animations: {
          idle: { clip: "IDLE" },
          walk: { clip: "WALK" },
          "teleport-out": { clip: "TELEPORT_OUT", loop: "once" },
          "teleport-in": { clip: "TELEPORT_IN", loop: "once" },
          slam: { clip: "SLAM", loop: "once", speed: 1.5 },
        },
      });
    });

    it("parses a boss model without animations (the loop states default to repeat)", () => {
      const result = parseLevelConfigData({
        ...makeLevel([]),
        boss: makeModelBoss({
          url: "assets/models/boss.glb",
          node: "Boss",
        }),
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.boss?.model).toEqual({
        url: "assets/models/boss.glb",
        node: "Boss",
      });
    });

    it("rejects a boss model without a url or node", () => {
      for (const model of [{ node: "Boss" }, { url: "assets/models/boss.glb" }]) {
        const result = parseLevelConfigData({
          ...makeLevel([]),
          boss: makeModelBoss(model),
        });
        expect(result.success).toBe(false);
      }
    });

    it("rejects an animation entry with an empty clip or an unknown loop mode", () => {
      for (const animations of [
        { idle: { clip: "" } },
        { idle: { clip: "IDLE", loop: "sometimes" } },
        { idle: { clip: "IDLE", speed: 0 } },
      ]) {
        const result = parseLevelConfigData({
          ...makeLevel([]),
          boss: makeModelBoss({
            url: "assets/models/boss.glb",
            node: "Boss",
            animations,
          }),
        });
        expect(result.success).toBe(false);
      }
    });
  });
});

describe("levelConfigSchema quests", () => {
  const quest = (
    counters: Record<string, unknown>,
    id = "q",
    extra: Record<string, unknown> = {}
  ) => ({
    id,
    labelKey: "quests.kills",
    counters,
    ...extra,
  });

  it("accepts a quest with exactly one counter", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      quests: [quest({ kills: 5 })],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a quest with the optional deferred flag", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      quests: [quest({ leaks: 3 }, "q", { deferred: true })],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a quest with a single-entry killsByType counter", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      quests: [quest({ killsByType: { tank: 5 } })],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a quest with no counters", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      quests: [quest({})],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a quest with two counters", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      quests: [quest({ kills: 5, towersPlaced: 3 })],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a killsByType counter naming more than one enemy type", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      quests: [quest({ killsByType: { tank: 5, fast: 3 } })],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate quest ids within a level", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      quests: [quest({ kills: 5 }, "dup"), quest({ towersPlaced: 3 }, "dup")],
    });
    expect(result.success).toBe(false);
  });
});

describe("levelConfigSchema water variants", () => {
  it("defaults a water body's variant to full when omitted", () => {
    const parsed = waterBodyConfigSchema.parse({
      id: 1,
      gridX: 2,
      gridZ: 3,
      shape: "box",
      color: "#38bdf8",
    });
    expect(parsed.variant).toBe("full");
  });

  it("accepts every partial water variant", () => {
    for (const variant of [
      "half-n",
      "half-e",
      "half-s",
      "half-w",
      "corner-nw",
      "corner-ne",
      "corner-se",
      "corner-sw",
    ]) {
      const parsed = waterBodyConfigSchema.parse({
        id: 1,
        gridX: 0,
        gridZ: 0,
        shape: "box",
        color: "#38bdf8",
        variant,
      });
      expect(parsed.variant).toBe(variant);
    }
  });

  it("rejects an unknown water variant", () => {
    expect(() =>
      waterBodyConfigSchema.parse({
        id: 1,
        gridX: 0,
        gridZ: 0,
        shape: "box",
        color: "#38bdf8",
        variant: "half-diagonal",
      })
    ).toThrow();
  });

  it("keeps a water body's variant when the full level is parsed", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      waters: [
        {
          id: 1,
          gridX: 1,
          gridZ: 1,
          shape: "box",
          color: "#38bdf8",
          variant: "corner-se",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.waters[0].variant).toBe("corner-se");
  });

  it("accepts a runtime water body with a variant", () => {
    const parsed = waterBodySchema.parse({
      id: 1,
      gridX: 0,
      gridZ: 0,
      shape: "box",
      color: "#38bdf8",
      variant: "half-s",
      width: 0.9,
      depth: 0.9,
      height: 0.1,
      x: 0,
      z: 0,
    });
    expect(parsed.variant).toBe("half-s");
  });
});
