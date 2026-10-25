import { memo, useEffect, useRef, useState } from "react";

import { useGameStore } from "../../../core/stores/useGameStore";
import { useLevelStore } from "../../../core/stores/useLevelStore";
import { gameEvents } from "../../../utils/eventEmitter";
import { GameEvent } from "../../../core/types/enums/events";
import { getPlanetRadius, flatCombatPointToWorldPosition } from "../../../utils/planetSurfaceMapping";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";
import { useNextId } from "../../../core/hooks/utils/useNextId";
import { getCssColorValue } from "../../ui/lib/cssUtils";
import { useTranslationInCanvas } from "../../../core/i18n/useTranslationInCanvas";

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
  /**
   * Show the gold reward float on kills. Off in the main menu, which has no
   * gold display — the death burst still plays.
   */
  showRewardText?: boolean;
};

/**
 * Subscribes to combat game events and renders their juice: gold reward floats
 * (camera-facing sprites) and a small burst when an enemy dies. Event payload
 * positions are flat-field coordinates, mapped onto the planet surface here.
 */
export const CombatJuice = memo(
  ({ shouldStopMovement, showRewardText = true }: CombatJuiceProps) => {
    const floatingTextsRef = useRef<FloatingTextsHandle>(null);
    const [bursts, setBursts] = useState<DeathBurst[]>([]);
    const { getNextId: getNextBurstId } = useNextId();

    const gridSize = useLevelStore((state) => state.gridSize);
    const tileSize = useGameStore((state) => state.tileSize);
    const planetRadius = getPlanetRadius(gridSize, tileSize);
    const reducedMotion = useReducedMotion();
    const t = useTranslationInCanvas();

    useEffect(() => {
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
        // Zero-reward kills (splitter shrapnel) get the burst but no float,
        // so a "+$0" never clutters the path.
        if (showRewardText && data.reward > 0) {
          floatingTextsRef.current?.spawn(
            t("rewardText", { amount: data.reward }),
            [position.x, position.y + REWARD_TEXT_HEIGHT, position.z],
            getCssColorValue("scene-hp-high")
          );
        }
        setBursts((prev) => [
          ...prev.slice(-(MAX_ACTIVE_BURSTS - 1)),
          {
            id: getNextBurstId(),
            position: [position.x, position.y, position.z],
            color: data.color,
          },
        ]);
      };

      gameEvents.on(GameEvent.ENEMY_KILLED, onEnemyKilled);
      return () => {
        gameEvents.off(GameEvent.ENEMY_KILLED, onEnemyKilled);
      };
    }, [planetRadius, t, showRewardText]);

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
  }
);

CombatJuice.displayName = "CombatJuice";
