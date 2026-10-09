import { createActions, Entity } from "koota";
import { Position, Velocity } from "../traits/mover";

export type MoverActions = {
  spawnEntity: (x: number, y: number) => Entity;
  moveEntities: (elapsedTime: number, delta: number) => void;
};

export const moverActions = createActions<MoverActions>((world) => ({
  spawnEntity: (x: number, y: number) => {
    return world.spawn(Position({ x, y }), Velocity({ speed: 0.8 }));
  },
  moveEntities: (_elapsedTime: number, delta: number) => {
    world.query(Position, Velocity).updateEach(([position, velocity]) => {
      position.x += (velocity.speed * delta) / 20;
      position.y += (velocity.speed * delta) / 20;
    });
  },
}));
