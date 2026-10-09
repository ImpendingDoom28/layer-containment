import { createActions, Entity } from "koota";
import { InputDirection, TInputDirection } from "../traits/input";

export type InputActions = {
  updateDirection: (
    entity: Entity,
    direction: Partial<TInputDirection>
  ) => void;
};

export const inputActions = createActions<InputActions>(() => ({
  updateDirection: (entity: Entity, direction: Partial<TInputDirection>) => {
    if (entity.has(InputDirection)) {
      const currentDirection = entity.get(InputDirection)!;

      entity.set(InputDirection, {
        ...currentDirection,
        ...direction,
      });
    }
  },
}));
