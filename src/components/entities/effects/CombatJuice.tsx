import { memo, useEffect, useRef, useState } from "react";

import { useGameStore } from "../../../core/stores/useGameStore";
import { useLevelStore } from "../../../core/stores/useLevelStore";
import { gameEvents } from "../../../utils/eventEmitter";
import { GameEvent } from "../../../core/types/enums/events";
import { getPlanetRadius, flatCombatPointToWorldPosition } from "../../../utils/planetSurfaceMapping";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";
import { getCssColorValue } from "../../ui/lib/cssUtils";

import { Effect } from "./Effect";
import { FloatingTexts, type FloatingTextsHandle } from "./FloatingTexts";

const MAX_ACTIVE_BURSTS = 8;
const BURST_DURATION = 0.5;
const REWARD_TEXT_HEIGHT = 0.45;

type DeathBurst = {
  id: number;
  position: [number, number, number];
  color: string;
};

type CombatJuiceProps = {
  shouldStopMovement: boolean;
};

let burstId = 0;
const nextBurstId = () => ++burstId;

/**
 * Subscribes to combat game events and renders their juice: floating damage
 * numbers and gold rewards (camera-facing sprites), plus a small burst when an
 * enemy dies. Event payload positions are flat-field coordinates, mapped onto
 * the planet surface here.
 */
export const CombatJuice = memo(({ shouldStopMovement }: CombatJuiceProps) => {
  const floatingTextsRef = useRef<FloatingTextsHandle>(null);
  const [bursts, setBursts] = useState<DeathBurst[]>([]);

  const gridSize = useLevelStore((state) => state.gridSize);
  const tileSize = useGameStore((state) => state.tileSize);
  const planetRadius = getPlanetRadius(gridSize, tileSize);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const onProjectileHit = (data: {
      damage?: number;
      worldPosition: { x: number; y: number; z: number };
    }) => {
      const damage = data.damage ?? 0;
      if (damage <= 0) return;
      const position = flatCombatPointToWorldPosition(
        data.worldPosition.x,
        data.worldPosition.z,
        0.2,
        planetRadius
      );
      floatingTextsRef.current?.spawn(
        String(Math.round(damage)),
        [position.x, position.y, position.z],
        getCssColorValue("scene-white")
      );
    };

    const onEnemyKilled = (data: {
      reward: number;
      worldPosition: { x: number; y: number; z: number };
      color: string;
    }) => {
      const position = flatCombatPointToWorldPosition(
        data.worldPosition.x,
        data.worldPosition.z,
        0.15,
        planetRadius
      );
      floatingTextsRef.current?.spawn(
        `+$${data.reward}`,
        [position.x, position.y + REWARD_TEXT_HEIGHT, position.z],
        getCssColorValue("scene-hp-high")
      );
      setBursts((prev) => [
        ...prev.slice(-(MAX_ACTIVE_BURSTS - 1)),
        {
          id: nextBurstId(),
          position: [position.x, position.y, position.z],
          color: data.color,
        },
      ]);
    };

    gameEvents.on(GameEvent.PROJECTILE_HIT, onProjectileHit);
    gameEvents.on(GameEvent.ENEMY_KILLED, onEnemyKilled);
    return () => {
      gameEvents.off(GameEvent.PROJECTILE_HIT, onProjectileHit);
      gameEvents.off(GameEvent.ENEMY_KILLED, onEnemyKilled);
    };
  }, [planetRadius]);

  const onBurstComplete = (id: number) => {
    setBursts((prev) => prev.filter((burst) => burst.id !== id));
  };

  return (
    <>
      <FloatingTexts ref={floatingTextsRef} shouldStopMovement={shouldStopMovement} />
      {bursts.map((burst) => (
        <Effect
          key={burst.id}
          position={burst.position}
          color={burst.color}
          duration={reducedMotion ? BURST_DURATION * 1.5 : BURST_DURATION}
          onComplete={() => onBurstComplete(burst.id)}
        />
      ))}
    </>
  );
});

CombatJuice.displayName = "CombatJuice";
