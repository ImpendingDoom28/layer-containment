import { describe, expect, it } from "vitest";

import type {
  EnemyUpgradeConfig,
  EnemyUpgradeId,
  WaveEnemyGroup,
} from "../core/types/game";
import {
  applyEnemyUpgradeCounts,
  applyWaveEnemyCountMultiplier,
  buildWaveSpawnQueue,
  getWaveCountMultiplierForStack,
} from "./waveEnemyCounts";

const reinforcements: EnemyUpgradeConfig = {
  id: "reinforcements",
  name: "Reinforcements",
  description: "",
  displayRank: 2,
  rewardMultiplier: 1.3,
  countGrowth: 0.2,
  indicatorColor: "#f97316",
};

const otherUpgrades: Partial<Record<EnemyUpgradeId, EnemyUpgradeConfig>> = {
  armored: {
    id: "armored",
    name: "Armored",
    description: "",
    displayRank: 1,
    rewardMultiplier: 1.15,
    healthMultiplier: 1.5,
    indicatorColor: "#6b7280",
  },
};

const allUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> = {
  armored: otherUpgrades.armored!,
  swift: {
    id: "swift",
    name: "Swift",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.35,
    indicatorColor: "#fbbf24",
  },
  slowResistance: {
    id: "slowResistance",
    name: "Unstoppable",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.25,
    indicatorColor: "#8b5cf6",
  },
  regenerating: {
    id: "regenerating",
    name: "Regenerating",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.3,
    indicatorColor: "#22c55e",
  },
  reinforcements,
};

const groups: WaveEnemyGroup[] = [
  { type: "basic", count: 5, spawnInterval: 1 },
  { type: "tank", count: 3, spawnInterval: 2 },
];

describe("getWaveCountMultiplierForStack", () => {
  it("returns 1 without the upgrade or without configs", () => {
    expect(getWaveCountMultiplierForStack(["armored"], allUpgrades)).toBe(1);
    expect(getWaveCountMultiplierForStack([], allUpgrades)).toBe(1);
    expect(getWaveCountMultiplierForStack(["reinforcements"], null)).toBe(1);
  });

  it("maps the pick count to the tier multiplier (1x, 2x, 3x)", () => {
    expect(
      getWaveCountMultiplierForStack(["reinforcements"], allUpgrades)
    ).toBe(1.2);
    expect(
      getWaveCountMultiplierForStack(
        ["reinforcements", "armored", "reinforcements"],
        allUpgrades
      )
    ).toBe(1.4);
    // Extra picks beyond tier 3 stay maxed.
    expect(
      getWaveCountMultiplierForStack(
        [
          "reinforcements",
          "reinforcements",
          "reinforcements",
          "reinforcements",
        ],
        allUpgrades
      )
    ).toBe(1.65);
  });
});

describe("applyWaveEnemyCountMultiplier", () => {
  it("rounds each group's count up and preserves the rest of the group", () => {
    const scaled = applyWaveEnemyCountMultiplier(groups, 1.4);
    expect(scaled).toEqual([
      { type: "basic", count: 7, spawnInterval: 1 },
      { type: "tank", count: 5, spawnInterval: 2 },
    ]);
    // 5 * 1.4 = 7.000000000000001 without exact math; ceil is stable either way.
    expect(scaled[0].count).toBe(7);
  });

  it("rounds up (ceil), not toward zero", () => {
    const scaled = applyWaveEnemyCountMultiplier(groups, 1.2);
    expect(scaled.map((g) => g.count)).toEqual([6, 4]); // 5*1.2=6, 3*1.2=3.6->4
  });

  it("returns fresh group objects so the original config is not mutated", () => {
    const scaled = applyWaveEnemyCountMultiplier(groups, 1.2);
    expect(scaled).not.toBe(groups);
    expect(scaled[0]).not.toBe(groups[0]);
    groups[0].count = 999;
    expect(scaled[0].count).toBe(6);
  });

  it("keeps the relative enemy mix when scaling", () => {
    const scaled = applyWaveEnemyCountMultiplier(groups, 1.4);
    expect(scaled[0].count).toBeGreaterThan(scaled[1].count);
  });
});

// Fresh arrays: the shared `groups` above is mutated by an earlier test.
const capGroups: WaveEnemyGroup[] = [
  { type: "basic", count: 2, spawnInterval: 1 },
  { type: "tank", count: 2, spawnInterval: 2 },
];

describe("applyEnemyUpgradeCounts (cap scaling)", () => {
  it("leaves the cap unchanged without Reinforcements", () => {
    const r = applyEnemyUpgradeCounts(capGroups, [], allUpgrades, 4);
    expect(r.groups.map((x) => x.count)).toEqual([2, 2]);
    expect(r.total).toBe(4);
  });

  it("scales the cap with the tier so a cap-bound wave grows", () => {
    // Tier 1: cap 4 -> 5, groups 2/2 -> 3/3, capped at 5.
    const t1 = applyEnemyUpgradeCounts(
      capGroups,
      ["reinforcements"],
      allUpgrades,
      4
    );
    expect(t1.groups.map((x) => x.count)).toEqual([3, 2]);
    expect(t1.total).toBe(5);

    // Tier 2: cap 4 -> 6, groups 3/3, capped at 6.
    const t2 = applyEnemyUpgradeCounts(
      capGroups,
      ["reinforcements", "reinforcements"],
      allUpgrades,
      4
    );
    expect(t2.groups.map((x) => x.count)).toEqual([3, 3]);
    expect(t2.total).toBe(6);
  });

  it("is cap-limited even when the scaled group sum is larger", () => {
    // Groups total 4; with tier 1 they become 3/3 (6) but the cap only grows
    // to 5, so 5 spawn.
    expect(
      applyEnemyUpgradeCounts(capGroups, ["reinforcements"], allUpgrades, 4)
        .total
    ).toBe(5);
  });

  it("clamps to the group sum when the cap is larger than the groups", () => {
    // No upgrade: cap 10, groups total 4 -> only 4 spawn.
    expect(applyEnemyUpgradeCounts(capGroups, [], allUpgrades, 10).total).toBe(
      4
    );
  });
});

describe("buildWaveSpawnQueue", () => {
  it("queues exactly sum(count) enemies — the old loop halved this", () => {
    // basic 10 + fast 3 + medic 1 (level 1 wave 2, no upgrade): 14, not 7.
    const g = [
      { type: "basic", count: 10, spawnInterval: 1 },
      { type: "fast", count: 3, spawnInterval: 1 },
      { type: "medic", count: 1, spawnInterval: 1 },
    ];
    const q = buildWaveSpawnQueue(g);
    expect(q.length).toBe(14);
    expect(q.filter((i) => i.type === "basic").length).toBe(10);
    expect(q.filter((i) => i.type === "fast").length).toBe(3);
    expect(q.filter((i) => i.type === "medic").length).toBe(1);
  });

  it("keeps the per-type distribution exact with a weighted random draw", () => {
    // Deterministic draws: always pick the first non-exhausted group, so the
    // queue is 5 basic, then 3 tank — order is group order, not a coin flip.
    const alwaysFirst = () => 0;
    const g = [
      { type: "basic", count: 5, spawnInterval: 1 },
      { type: "tank", count: 3, spawnInterval: 2 },
    ];
    const q = buildWaveSpawnQueue(g, alwaysFirst);
    expect(q.length).toBe(8);
    expect(q.filter((i) => i.type === "basic").length).toBe(5);
    expect(q.filter((i) => i.type === "tank").length).toBe(3);
  });

  it("assigns cumulative per-group spawn intervals as delays", () => {
    // basic x2 (interval 1s) then tank x1 (interval 2s): delays 0, 1000, 2000.
    const alwaysFirst = () => 0;
    const g = [
      { type: "basic", count: 2, spawnInterval: 1 },
      { type: "tank", count: 1, spawnInterval: 2 },
    ];
    const q = buildWaveSpawnQueue(g, alwaysFirst);
    expect(q.map((i) => i.delay)).toEqual([0, 1000, 2000]);
  });

  it("does not mutate the input groups", () => {
    const g = [
      { type: "basic", count: 3, spawnInterval: 1 },
      { type: "tank", count: 2, spawnInterval: 1 },
    ];
    const before = g.map((x) => x.count);
    buildWaveSpawnQueue(g, () => 0.5);
    expect(g.map((x) => x.count)).toEqual(before);
  });

  it("returns an empty queue for empty groups", () => {
    expect(buildWaveSpawnQueue([])).toEqual([]);
  });
});

describe("buildWaveSpawnQueue (portal assignment)", () => {
  // The per-portal split of an unassigned group is the k-th emitted enemy ->
  // portal `k % pathCount`, so it is fixed per group and does not depend on
  // the (random) draw order. These tests use a fixed draw for determinism.
  it("omits pathIndex for single-portal levels (legacy shape)", () => {
    const q = buildWaveSpawnQueue(
      [{ type: "basic", count: 4, spawnInterval: 1 }],
      () => 0
    );
    expect(q.every((item) => item.pathIndex === undefined)).toBe(true);
  });

  it("sends an explicit-pathIndex group only to that portal", () => {
    const q = buildWaveSpawnQueue(
      [
        { type: "basic", count: 5, spawnInterval: 1, pathIndex: 1 },
        { type: "fast", count: 3, spawnInterval: 1 },
      ],
      () => 0,
      2
    );
    const basics = q.filter((i) => i.type === "basic");
    expect(basics.every((i) => i.pathIndex === 1)).toBe(true);
    // The unassigned group splits evenly: 3 across 2 portals -> 2/1.
    const fasts = q.filter((i) => i.type === "fast");
    expect(fasts.filter((i) => i.pathIndex === 0)).toHaveLength(2);
    expect(fasts.filter((i) => i.pathIndex === 1)).toHaveLength(1);
  });

  it("splits an unassigned group evenly across portals (remainder to earlier ones)", () => {
    // 10 basics, no explicit portal, 3 portals -> 4/3/3.
    const q = buildWaveSpawnQueue(
      [{ type: "basic", count: 10, spawnInterval: 1 }],
      () => 0,
      3
    );
    const byPortal = [0, 1, 2].map((p) =>
      q.filter((i) => i.pathIndex === p).length
    );
    expect(byPortal).toEqual([4, 3, 3]);
  });

  it("splits each unassigned group evenly, independently of the others", () => {
    // Two 5-count groups, 2 portals: each group is 3/2, so the totals are 6/4.
    const q = buildWaveSpawnQueue(
      [
        { type: "basic", count: 5, spawnInterval: 1 },
        { type: "tank", count: 5, spawnInterval: 1 },
      ],
      () => 0,
      2
    );
    const portal0 = q.filter((i) => i.pathIndex === 0).length;
    const portal1 = q.filter((i) => i.pathIndex === 1).length;
    expect([portal0, portal1]).toEqual([6, 4]);
  });

  it("mixes explicit and unassigned groups per portal", () => {
    const q = buildWaveSpawnQueue(
      [
        { type: "basic", count: 4, spawnInterval: 1, pathIndex: 0 },
        { type: "tank", count: 4, spawnInterval: 1, pathIndex: 1 },
        { type: "fast", count: 4, spawnInterval: 1 },
      ],
      () => 0,
      2
    );
    const basic = q
      .filter((i) => i.type === "basic")
      .every((i) => i.pathIndex === 0);
    const tank = q.filter((i) => i.type === "tank").every((i) => i.pathIndex === 1);
    expect(basic).toBe(true);
    expect(tank).toBe(true);
    // fast splits 2/2, so portal 0 gets 4 basic + 2 fast = 6,
    // and portal 1 gets 4 tank + 2 fast = 6.
    expect(q.filter((i) => i.pathIndex === 0)).toHaveLength(6);
    expect(q.filter((i) => i.pathIndex === 1)).toHaveLength(6);
  });
});
