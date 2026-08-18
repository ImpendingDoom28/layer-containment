import { FC, memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { Entity } from "koota";

import type { HealPulseConfig } from "../../../core/types/game";
import { EnemyState } from "../../../core/ecs/traits/enemy";
import { didHealPulseJustReschedule } from "../../../utils/enemyMedicPulse";
import { getCssColorValue } from "../../ui/lib/cssUtils";

import { EmissiveTorus } from "./primitives/EmissiveTorus";
import type { EnemyAttachedEffectProps } from "./types";
import {
  MEDIC_BURST_BASE_RING_MAJOR_RADIUS,
  applyDualRingBurst,
  getMedicHealBurstSpec,
} from "./utils/dualRingBurst";

type MedicHealBurstEffectProps = EnemyAttachedEffectProps & {
  entity: Entity;
  healPulse: HealPulseConfig;
  color: string;
};

const BURST_DURATION = 0.45;

export const MedicHealBurstEffect: FC<MedicHealBurstEffectProps> = memo(
  ({ entity, healPulse, shouldStopMovement, color }) => {
    const ring1Ref = useRef<Mesh>(null);
    const ring2Ref = useRef<Mesh>(null);
    const prevNextAtRef = useRef<number | undefined>(undefined);
    const burstingRef = useRef(false);
    const animElapsedRef = useRef(0);
    const glowColor = getCssColorValue("scene-portal-glow");

    useFrame((_, delta) => {
      const nextHealPulseAt = entity.get(EnemyState)?.nextHealPulseAt;

      const prev = prevNextAtRef.current;
      if (
        didHealPulseJustReschedule(
          prev,
          nextHealPulseAt,
          healPulse.intervalSeconds
        )
      ) {
        burstingRef.current = true;
        animElapsedRef.current = 0;
      }
      prevNextAtRef.current = nextHealPulseAt;

      if (!burstingRef.current) return;

      if (!shouldStopMovement) {
        animElapsedRef.current += delta;
      }

      const progress = Math.min(animElapsedRef.current / BURST_DURATION, 1);
      const radiusScale =
        healPulse.radius / MEDIC_BURST_BASE_RING_MAJOR_RADIUS;

      applyDualRingBurst(
        ring1Ref.current,
        ring2Ref.current,
        progress,
        getMedicHealBurstSpec(radiusScale)
      );

      if (progress >= 1) {
        burstingRef.current = false;
      }
    });

    return (
      <group position={[0, 0.02, 0]}>
        <EmissiveTorus
          ref={ring1Ref}
          torusArgs={[MEDIC_BURST_BASE_RING_MAJOR_RADIUS, 0.06, 8, 32]}
          color={glowColor}
          emissiveIntensity={0.55}
          opacity={0}
        />
        <EmissiveTorus
          ref={ring2Ref}
          torusArgs={[
            MEDIC_BURST_BASE_RING_MAJOR_RADIUS * 0.88,
            0.04,
            8,
            32,
          ]}
          color={color}
          emissiveIntensity={0.35}
          opacity={0}
        />
      </group>
    );
  }
);

MedicHealBurstEffect.displayName = "MedicHealBurstEffect";
