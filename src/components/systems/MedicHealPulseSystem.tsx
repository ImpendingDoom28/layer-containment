import { FC, useRef } from "react";
import { useFrame } from "@react-three/fiber";

import { useLevelStore } from "../../core/stores/useLevelStore";
import type { Enemy } from "../../core/types/game";
import {
  computeHealPulseHealthUpdates,
  getInitialNextHealPulseAt,
} from "../../utils/enemyMedicPulse";
import {
  createPauseClock,
  getEffectiveGameTime,
  stepPauseClock,
} from "../../utils/pauseClock";

type MedicHealPulseSystemProps = {
  shouldStopMovement: boolean;
  onEnemyUpdate: ((enemyId: number, updates: Partial<Enemy>) => void) | null;
};

export const MedicHealPulseSystem: FC<MedicHealPulseSystemProps> = ({
  shouldStopMovement,
  onEnemyUpdate,
}) => {
  const pauseClockRef = useRef(createPauseClock());
  const previousShouldStopMovementRef = useRef(shouldStopMovement);
  const shouldStopRef = useRef(shouldStopMovement);
  const onEnemyUpdateRef = useRef(onEnemyUpdate);
  const enemies = useLevelStore((state) => state.enemies);

  shouldStopRef.current = shouldStopMovement;
  onEnemyUpdateRef.current = onEnemyUpdate;

  useFrame((state) => {
    const onUpdate = onEnemyUpdateRef.current;
    if (!onUpdate) return;

    const now = state.clock.elapsedTime;
    const isPaused = shouldStopRef.current;
    const wasPaused = previousShouldStopMovementRef.current;

    stepPauseClock(pauseClockRef.current, now, isPaused, wasPaused);
    previousShouldStopMovementRef.current = isPaused;

    if (isPaused) return;

    const effectiveTime = getEffectiveGameTime(now, pauseClockRef.current);

    const medicIds = enemies
      .filter((e) => e.healPulse && e.health > 0)
      .map((e) => e.id);

    for (const medicId of medicIds) {
      const enemy = enemies.find((e) => e.id === medicId);
      if (!enemy?.healPulse || enemy.health <= 0) continue;

      const { healPulse } = enemy;

      if (enemy.nextHealPulseAt === undefined) {
        onUpdate(enemy.id, {
          nextHealPulseAt: getInitialNextHealPulseAt(
            effectiveTime,
            healPulse.intervalSeconds
          ),
        });
        continue;
      }

      if (effectiveTime < enemy.nextHealPulseAt) continue;

      const updates = computeHealPulseHealthUpdates(enemy, enemies, healPulse);
      for (const u of updates) {
        onUpdate(u.enemyId, { health: u.health });
      }
      onUpdate(enemy.id, {
        nextHealPulseAt: getInitialNextHealPulseAt(
          effectiveTime,
          healPulse.intervalSeconds
        ),
      });
    }
  }, -1);

  return null;
};
