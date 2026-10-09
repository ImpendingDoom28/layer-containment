import { createActions, Entity } from "koota";
import { isPlayer } from "../traits/player";
import { Position } from "../traits/mover";
import { HealthInfo } from "../traits/health";

export type PlayerActions = {
  spawnPlayer: () => Entity;
};

export const playerActionsFactory = createActions<PlayerActions>((world) => ({
  spawnPlayer: () => {
    return world.spawn(
      isPlayer,
      Position({ x: 0, y: 0, z: 0 }),
      HealthInfo({ currentHealth: 20, maxHealth: 20 })
    );
  },
}));
