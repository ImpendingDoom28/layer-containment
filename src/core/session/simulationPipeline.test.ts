import { describe, expect, it } from "vitest";

import {
  runSimulationPipeline,
  type SimulationPipelineSystems,
} from "./simulationPipeline";
import type { SimulationFrame } from "./types";

const frame: SimulationFrame = {
  deltaSeconds: 0.25,
  simulationTimeSeconds: 12,
  canResolveGameplay: true,
};

const createSystems = (calls: string[]): SimulationPipelineSystems => ({
  applySlow: () => calls.push("slow"),
  applyEffects: () => calls.push("effects"),
  settleEnemyDeaths: () => calls.push("death"),
  splitEnemies: () => calls.push("split"),
  moveEnemies: () => calls.push("movement"),
  healEnemies: () => calls.push("heal"),
  fireTowers: () => calls.push("towers"),
  updateProjectiles: () => calls.push("projectiles"),
  applyDamage: () => calls.push("damage"),
  requestBaseDefeat: () => calls.push("request-defeat"),
  resolveBaseDefeat: () => calls.push("resolve-defeat"),
  updateWaves: () => calls.push("waves"),
  foldStats: () => calls.push("stats"),
});

describe("runSimulationPipeline", () => {
  it("runs gameplay systems in one explicit order", () => {
    const calls: string[] = [];
    runSimulationPipeline(frame, createSystems(calls));

    expect(calls).toEqual([
      "slow",
      "heal",
      "effects",
      "death",
      "split",
      "movement",
      "towers",
      "projectiles",
      "waves",
      "resolve-defeat",
      "damage",
      "request-defeat",
      "stats",
    ]);
  });

  it("keeps drain and dilated-motion passes alive while gameplay is stopped", () => {
    const calls: string[] = [];
    runSimulationPipeline(
      { ...frame, canResolveGameplay: false },
      createSystems(calls)
    );

    expect(calls).toEqual([
      "effects",
      "death",
      "split",
      "movement",
      "projectiles",
      "waves",
      "resolve-defeat",
      "damage",
      "request-defeat",
      "stats",
    ]);
  });
});
