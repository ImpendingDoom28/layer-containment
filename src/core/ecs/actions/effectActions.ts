import { createActions } from "koota";

import { Effect, IsEffect } from "../traits/effect";

/**
 * Raises transient visual effects (spawn / end ring bursts) as ECS entities.
 *
 * The view layer (`EffectSystem`) renders the queried entities and destroys
 * each one when its animation completes, so the world stays the single source
 * of truth for active effects — no parallel store array or id registry.
 */
export const effectActions = createActions((world) => ({
  spawnEffect: (
    position: [number, number, number],
    color: string,
    type: "spawn" | "end",
    duration?: number
  ) => {
    const entity = world.spawn(IsEffect, Effect);
    entity.set(Effect, {
      position,
      color,
      type,
      duration: duration ?? (type === "spawn" ? 0.4 : 0.5),
    });
    return entity;
  },
}));
