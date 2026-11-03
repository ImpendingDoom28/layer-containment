import type { SimulationFrame } from "./types";

export type SimulationPipelineSystems = {
  applySlow: (simulationTimeSeconds: number) => void;
  applyEffects: () => void;
  settleEnemyDeaths: () => void;
  splitEnemies: () => void;
  moveEnemies: (frame: SimulationFrame) => void;
  healEnemies: (simulationTimeSeconds: number) => void;
  fireTowers: (frame: SimulationFrame) => void;
  updateProjectiles: (frame: SimulationFrame) => void;
  applyDamage: () => void;
  requestBaseDefeat: () => void;
  resolveBaseDefeat: () => void;
  updateWaves: (frame: SimulationFrame) => void;
  foldStats: () => void;
};

export const runSimulationPipeline = (
  frame: SimulationFrame,
  systems: SimulationPipelineSystems
): void => {
  if (frame.canResolveGameplay) {
    systems.applySlow(frame.simulationTimeSeconds);
    systems.healEnemies(frame.simulationTimeSeconds);
  }
  systems.applyEffects();
  systems.settleEnemyDeaths();
  systems.splitEnemies();
  systems.moveEnemies(frame);
  if (frame.canResolveGameplay) {
    systems.fireTowers(frame);
  }
  systems.updateProjectiles(frame);
  systems.updateWaves(frame);
  systems.resolveBaseDefeat();
  systems.applyDamage();
  systems.requestBaseDefeat();
  systems.foldStats();
};
