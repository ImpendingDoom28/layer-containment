import { FC, memo, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Entity } from "koota";
import { MeshStandardMaterial } from "three";
import type { Mesh } from "three";

import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";
import type { HealPulseConfig } from "../../../core/types/game";
import { EnemyState } from "../../../core/ecs/traits/enemy";
import { didHealPulseJustReschedule } from "../../../utils/enemyMedicPulse";
import { getCssColorValue } from "../../ui/lib/cssUtils";

import { EmissiveTorus } from "./primitives/EmissiveTorus";
import {
  getMedicRing1Material,
  MEDIC_BURST_RING1_GEOMETRY,
  MEDIC_BURST_RING2_GEOMETRY,
} from "./primitives/sharedEffectAssets";
import {
  MEDIC_BURST_BASE_RING_MAJOR_RADIUS,
  applyDualRingBurst,
  getMedicHealBurstSpec,
} from "./utils/dualRingBurst";

type MedicHealBurstEffectProps = {
  entity: Entity;
  healPulse: HealPulseConfig;
  color: string;
};

const BURST_DURATION = 0.45;

export const MedicHealBurstEffect: FC<MedicHealBurstEffectProps> = memo(
  ({ entity, healPulse, color }) => {
    const { getTimeScale } = useSimulationClock();
    const ring1Ref = useRef<Mesh>(null);
    const ring2Ref = useRef<Mesh>(null);
    const prevNextAtRef = useRef<number | undefined>(undefined);
    const burstingRef = useRef(false);
    const animElapsedRef = useRef(0);
    const glowColor = getCssColorValue("scene-portal-glow");
    // The rings only exist during a burst window: between bursts they sit at
    // opacity 0 but still drew every frame, so they are hidden outside the
    // window and an idle medic costs 0 draw calls instead of 2. The visibility
    // flips are rare (once per burst), so the state write is ref-guarded to
    // land exactly on the transition; a fresh mount starts hidden and the
    // first frame re-arms it if a burst is already in flight.
    const [ringsVisible, setRingsVisible] = useState(false);
    const lastVisibleRef = useRef(false);
    const setRingsVisibleRef = (visible: boolean) => {
      if (lastVisibleRef.current === visible) return;
      lastVisibleRef.current = visible;
      setRingsVisible(visible);
    };
    // Ring 1's colour/emissive are identical for every medic, so it uses the
    // shared material; ring 2 is the medic's own colour and keeps its own.
    const ring2Material = useMemo(
      () =>
        new MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.35,
          transparent: true,
          opacity: 0,
        }),
      [color]
    );

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

      if (!burstingRef.current) {
        setRingsVisibleRef(false);
        return;
      }

      setRingsVisibleRef(true);
      animElapsedRef.current += delta * getTimeScale();

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
      <group position={[0, 0.02, 0]} visible={ringsVisible}>
        <EmissiveTorus
          ref={ring1Ref}
          torusArgs={[MEDIC_BURST_BASE_RING_MAJOR_RADIUS, 0.06, 8, 32]}
          geometry={MEDIC_BURST_RING1_GEOMETRY}
          material={getMedicRing1Material(glowColor)}
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
          geometry={MEDIC_BURST_RING2_GEOMETRY}
          material={ring2Material}
          color={color}
          emissiveIntensity={0.35}
          opacity={0}
        />
      </group>
    );
  }
);

MedicHealBurstEffect.displayName = "MedicHealBurstEffect";
