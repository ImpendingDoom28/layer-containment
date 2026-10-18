import { createActions } from "koota";

import { Position } from "../traits/position";
import { Effect, IsEffect, spawnEffectRequest } from "../traits/effect";

/**
 * Raises transient visual effects (spawn / end ring bursts) as ECS entities.
 *
 * `spawnEffect` creates the effect entity directly (used by the apply system
 * after consuming a request). `requestSpawnEffect` raises a request entity
 * that the ApplyEffectSystem turns into an effect entity, so callers (the
 * enemy view and the movement system) are decoupled from the effect system.
 * The view layer (`EffectSystem`) renders the queried effect entities and
 * destroys each one when its animation completes, so the world is the single
 * source of truth for active effects — no parallel store array or id registry.
 */
export const effectActions = createActions((world) => ({
  spawnEffect: (
    position: [number, number, number],
    color: string,
    type: "spawn" | "end",
    duration?: number
  ) => {
    const entity = world.spawn(
      IsEffect,
      Effect({
        color,
        type,
        duration: duration ?? (type === "spawn" ? 0.4 : 0.5),
      }),
      Position({ x: position[0], y: position[1], z: position[2] })
    );
    return entity;
  },

  requestSpawnEffect: (
    position: [number, number, number],
    color: string,
    type: "spawn" | "end",
    duration?: number
  ) => {
    const request = world.spawn(
      spawnEffectRequest({
        x: position[0],
        y: position[1],
        z: position[2],
        color,
        type,
        duration: duration ?? 0,
      })
    );
    return request;
  },
}));
