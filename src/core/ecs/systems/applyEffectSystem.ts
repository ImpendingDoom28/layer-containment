import type { World } from "koota";

import { effectActions } from "../actions/effectActions";
import { spawnEffectRequest } from "../traits/effect";

/**
 * Consumes pending `spawnEffectRequest` entities: spawns the effect entity
 * and destroys the request. Mirrors `runDamageSystem` (collect, consume,
 * destroy the request).
 */
export const runApplyEffectSystem = (world: World): void => {
  const pending = world.query(spawnEffectRequest);
  if (pending.length === 0) return;

  const actions = effectActions(world);
  for (const entity of pending) {
    const request = entity.get(spawnEffectRequest);
    if (request) {
      // A zero duration means "not provided" — fall back to the per-type
      // default instead of spawning an instantly-finished effect.
      const duration = request.duration || undefined;
      actions.spawnEffect(
        [request.x, request.y, request.z],
        request.color,
        request.type,
        duration
      );
    }
    entity.destroy();
  }
};
