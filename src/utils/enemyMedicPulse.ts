import type { Enemy, HealPulseConfig } from "../core/types/game";

export const getHealPulseTargetIds = (
  medic: Enemy,
  enemies: Enemy[],
  healPulse: HealPulseConfig
): number[] => {
  const r2 = healPulse.radius * healPulse.radius;
  const ids: number[] = [];
  for (const e of enemies) {
    if (e.id === medic.id) continue;
    if (e.health <= 0) continue;
    const dx = e.x - medic.x;
    const dz = e.z - medic.z;
    if (dx * dx + dz * dz <= r2) {
      ids.push(e.id);
    }
  }
  return ids;
};

export type HealPulseHealthUpdate = {
  enemyId: number;
  health: number;
};

export const computeHealPulseHealthUpdates = (
  medic: Enemy,
  enemies: Enemy[],
  healPulse: HealPulseConfig
): HealPulseHealthUpdate[] => {
  const byId = new Map(enemies.map((e) => [e.id, e]));
  const targets = getHealPulseTargetIds(medic, enemies, healPulse);
  return targets.map((id) => {
    const e = byId.get(id)!;
    return {
      enemyId: id,
      health: Math.min(e.maxHealth, e.health + healPulse.healAmount),
    };
  });
};

export const getInitialNextHealPulseAt = (
  effectiveTime: number,
  intervalSeconds: number
): number => effectiveTime + intervalSeconds;

export const didHealPulseJustReschedule = (
  prevNextHealPulseAt: number | undefined,
  nextNextHealPulseAt: number | undefined,
  intervalSeconds: number
): boolean => {
  if (prevNextHealPulseAt === undefined || nextNextHealPulseAt === undefined) {
    return false;
  }
  const threshold = prevNextHealPulseAt + intervalSeconds * 0.5;
  return nextNextHealPulseAt >= threshold;
};
