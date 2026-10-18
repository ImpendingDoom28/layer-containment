import { FC } from "react";
import type { Entity } from "koota";
import { useQuery } from "koota/react";

import { Effect as EffectTrait, IsEffect } from "../../core/ecs/traits/effect";
import { Effect } from "../entities/effects/Effect";

/**
 * Renders the transient effect entities (spawn / end ring bursts) and clears
 * each one when its animation completes.
 *
 * `useQuery` re-renders the list when an effect entity is added or removed, so
 * the world is the single source of truth for active effects. The `Effect`
 * component animates via refs and reports completion, which destroys the
 * entity. `Effect` keeps firing `onComplete` on later frames until the entity
 * is gone, but `destroy()` is a no-op on a dead entity, so the `isAlive` guard
 * makes the callback safe to re-invoke.
 */
export const EffectSystem: FC = () => {
  const entities = useQuery(IsEffect);

  const onComplete = (entity: Entity) => {
    if (entity.isAlive()) entity.destroy();
  };

  return (
    <>
      {entities.map((entity) => {
        const data = entity.get(EffectTrait);
        if (!data) return null;
        return (
          <Effect
            key={entity}
            position={data.position}
            color={data.color}
            duration={data.duration}
            onComplete={() => onComplete(entity)}
          />
        );
      })}
    </>
  );
};

EffectSystem.displayName = "EffectSystem";
